import { randomBytes } from "node:crypto";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { channelDisabledResponse } from "@/server/channels/enabled";
import { multiempresaCanales } from "@/server/empresas/flag";
import { telegramCredentialsForBot, telegramCredentialsForOrg, saveTelegramCredentials, TelegramConnectionError } from "@/server/telegram/credentials";
import { registerTelegramWebhook, removeTelegramWebhook, TelegramApiError, verifyTelegramBot } from "@/server/telegram/client";
import { connectTelegramForCompany } from "@/server/telegram/connect";
import { telegramDisponible } from "@/server/telegram/disponible";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  if (!telegramDisponible()) return channelDisabledResponse();
  const c = await telegramCredentialsForOrg(session.organizationId);
  return Response.json({ connection: c ? {
    botId: c.botId, username: c.username, status: c.status,
    tokenLast4: c.token.slice(-4),
  } : null, canManage: session.role === "owner" });
});

const bodySchema = z.object({ token: z.string().trim().regex(/^\d+:[A-Za-z0-9_-]{20,}$/) });

export const PUT = withAuth(async (session, req: Request) => {
  if (!telegramDisponible()) return channelDisabledResponse();
  if (session.role !== "owner") return apiError(403, "forbidden", "Solo el propietario puede conectar Telegram");
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  try {
    const { token } = body.data;
    const bot = await verifyTelegramBot(token);
    if (!bot.is_bot || !bot.username || !Number.isSafeInteger(bot.id) || bot.id <= 0) {
      return apiError(422, "invalid_bot", "La llave no pertenece a un bot de Telegram");
    }
    const botId = String(bot.id);
    const input = { organizationId: session.organizationId, botId, username: bot.username, token };
    if (multiempresaCanales()) {
      await connectTelegramForCompany(input);
    } else {
      const owner = await telegramCredentialsForBot(botId);
      if (owner && owner.organizationId !== session.organizationId) {
        return apiError(409, "bot_in_use", "Ese bot ya está conectado a otra empresa");
      }
      const webhookSecret = randomBytes(32).toString("hex");
      const previous = await telegramCredentialsForOrg(session.organizationId);
      await registerTelegramWebhook(token, botId, webhookSecret);
      await saveTelegramCredentials({ ...input, webhookSecret, status: "connected" });
      if (previous && previous.botId !== botId) {
        await removeTelegramWebhook(previous.token).catch(() => undefined);
      }
    }
    return Response.json({ connection: { botId, username: bot.username, status: "connected", tokenLast4: token.slice(-4) } });
  } catch (err) {
    if (err instanceof TelegramConnectionError) {
      const mensajes = {
        bot_in_use: "Ese bot ya está conectado a otra empresa",
        bot_already_linked: "Esta empresa ya tiene un bot. Para reconectarlo, usa el token de ese mismo bot",
        webhook_in_use: "El bot ya tiene un webhook en otro servicio. Quita ese webhook desde el servicio que lo administra antes de conectar el bot a Hilora",
        connection_busy: "Hay otra conexión de Telegram en curso. Intenta de nuevo en unos segundos",
      };
      return apiError(409, err.code, mensajes[err.code]);
    }
    if (err instanceof TelegramApiError) {
      if (multiempresaCanales() && err.status === 401) return apiError(422, "invalid_bot", "Telegram rechazó el token del bot");
      return apiError(err.status === 422 ? 422 : 502, "telegram_unavailable", "No se pudo comprobar el bot o registrar su webhook en Telegram");
    }
    throw err;
  }
});
