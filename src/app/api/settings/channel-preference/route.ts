import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { isChannelEnabled } from "@/server/channels/enabled";
import { channelPreferenceFor, saveChannelPreference } from "@/server/channels/preference";
import { telegramCredentialsForOrg } from "@/server/telegram/credentials";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  return Response.json({ preference: await channelPreferenceFor(session.organizationId),
    telegramAvailable: isChannelEnabled("telegram"), canManage: session.role === "owner" });
});

const bodySchema = z.object({ whatsapp: z.boolean(), telegram: z.boolean() });
export const PUT = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") return apiError(403, "forbidden", "Solo el propietario puede elegir los canales");
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const value = body.data;
  if (!value.whatsapp && !value.telegram) return apiError(422, "no_channels", "Deja al menos un canal activo");
  if (value.telegram) {
    if (!isChannelEnabled("telegram")) return apiError(422, "telegram_unavailable", "Telegram no está disponible en esta instalación");
    const creds = await telegramCredentialsForOrg(session.organizationId);
    if (!creds || creds.status !== "connected") return apiError(409, "telegram_not_connected", "Conecta el bot de Telegram antes de activarlo");
  }
  await saveChannelPreference(session.organizationId, value);
  return Response.json({ preference: value });
});
