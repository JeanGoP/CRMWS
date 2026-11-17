import { timingSafeEqual } from "node:crypto";
import { channelDisabledResponse } from "@/server/channels/enabled";
import { isChannelActiveForOrg } from "@/server/channels/preference";
import { multiempresaCanales } from "@/server/empresas/flag";
import { telegramCredentialsForBot } from "@/server/telegram/credentials";
import { telegramDisponible } from "@/server/telegram/disponible";
import { recibirEvento } from "@/server/webhooks/recibir";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ botId: string }> };

export async function POST(req: Request, { params }: Params) {
  if (!telegramDisponible()) return channelDisabledResponse();
  const { botId } = await params;
  if (!/^\d+$/.test(botId)) return new Response(null, { status: 404 });
  const creds = await telegramCredentialsForBot(botId);
  if (!creds) return new Response(null, { status: 404 });
  const presented = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const expected = Buffer.from(creds.webhookSecret);
  const actual = Buffer.from(presented);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return new Response(null, { status: 401 });
  }
  if (!(await isChannelActiveForOrg("telegram", creds.organizationId))) return Response.json({ received: true });
  if (Number(req.headers.get("content-length") ?? 0) > 512_000) return new Response(null, { status: 413 });
  const rawBody = await req.text();
  if (rawBody.length > 512_000) return new Response(null, { status: 413 });
  let update: unknown;
  try { update = JSON.parse(rawBody); } catch { return Response.json({ received: true }); }
  const multiempresa = multiempresaCanales();
  return recibirEvento(
    "telegram", multiempresa ? { botId, credentialId: creds.id, update } : { botId, update },
    `${botId}:${rawBody}`, "telegram", multiempresa ? creds.organizationId : undefined
  );
}
