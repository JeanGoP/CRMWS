import { randomBytes } from "node:crypto";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { channelDisabledResponse, isChannelEnabled } from "@/server/channels/enabled";
import { telegramCredentialsForBot, telegramCredentialsForOrg, saveTelegramCredentials } from "@/server/telegram/credentials";
import { registerTelegramWebhook, removeTelegramWebhook, TelegramApiError, verifyTelegramBot } from "@/server/telegram/client";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  if (!isChannelEnabled("telegram")) return channelDisabledResponse();
  const c = await telegramCredentialsForOrg(session.organizationId);
  return Response.json({ connection: c ? {
    botId: c.botId, username: c.username, status: c.status,
    tokenLast4: c.token.slice(-4),
  } : null });
});

const bodySchema = z.object({ token: z.string().trim().regex(/^\d+:[A-Za-z0-9_-]{20,}$/) });

export const PUT = withAuth(async (session, req: Request) => {
  if (!isChannelEnabled("telegram")) return channelDisabledResponse();
  if (session.role !== "owner") return apiError(403, "forbidden", "Solo el propietario puede conectar Telegram");
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  try {
    const bot = await verifyTelegramBot(body.data.token);
    if (!bot.is_bot || !bot.username) return apiError(422, "invalid_bot", "La llave no pertenece a un bot de Telegram");
    const botId = String(bot.id);
    const owner = await telegramCredentialsForBot(botId);
    if (owner && owner.organizationId !== session.organizationId) {
      return apiError(409, "bot_in_use", "Ese bot ya está conectado a otra empresa");
    }
    const webhookSecret = randomBytes(32).toString("hex");
    const previous = await telegramCredentialsForOrg(session.organizationId);
    await registerTelegramWebhook(body.data.token, botId, webhookSecret);
    await saveTelegramCredentials({
      organizationId: session.organizationId, botId, username: bot.username,
      token: body.data.token, webhookSecret, status: "connected",
    });
    if (previous && previous.botId !== botId) {
      await removeTelegramWebhook(previous.token).catch(() => undefined);
    }
    return Response.json({ connection: { botId, username: bot.username, status: "connected", tokenLast4: body.data.token.slice(-4) } });
  } catch (err) {
    if (err instanceof TelegramApiError) {
      return apiError(err.status === 422 ? 422 : 502, "telegram_unavailable", "No se pudo comprobar el bot o registrar su webhook en Telegram");
    }
    throw err;
  }
});
