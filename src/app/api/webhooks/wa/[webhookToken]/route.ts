import { getEnv } from "@/lib/env";
import { isValidSignature, isValidWebhookToken } from "@/server/inbox/webhook";
import { recibirEvento } from "@/server/webhooks/recibir";
import { multiempresaActiva, multiempresaCanales } from "@/server/empresas/flag";
import { conexionParaWebhookWhatsapp } from "@/server/whatsapp/credentials-multiempresa";
import { entregaWhatsappVerificada, payloadWhatsappDeConexion } from "@/server/whatsapp/webhook-multiempresa";

/**
 * Webhook público de WhatsApp (contrato webhook.md).
 * Capa 1: el segmento [webhookToken] debe coincidir (si no → 404 sin efectos).
 * Capa 2: firma x-hub-signature-256 solo si META_APP_SECRET está configurado.
 * 047: tras validar, el evento se guarda ANTES de responder 200 y se procesa
 * fuera de la ruta; si falla, el barrido lo reintenta. Si no se pudo guardar,
 * 503 para que Meta reintente (`src/server/webhooks/recibir.ts`).
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ webhookToken: string }> };

export async function GET(req: Request, { params }: Params) {
  const { webhookToken } = await params;
  if (multiempresaActiva()) {
    if (!multiempresaCanales()) return new Response(null, { status: 404 });
    try {
      const conexion = await conexionParaWebhookWhatsapp(webhookToken);
      if (!conexion) return new Response(null, { status: 404 });
      return verificarDesafio(req, conexion.verifyToken);
    } catch {
      return new Response(null, { status: 503 });
    }
  }
  const env = getEnv();
  if (!isValidWebhookToken(webhookToken, env.META_WEBHOOK_VERIFY_TOKEN)) {
    return new Response(null, { status: 404 });
  }

  return verificarDesafio(req, env.META_WEBHOOK_VERIFY_TOKEN);
}

function verificarDesafio(req: Request, verifyToken: string) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token !== null && isValidWebhookToken(token, verifyToken)) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response(null, { status: 403 });
}

export async function POST(req: Request, { params }: Params) {
  const { webhookToken } = await params;
  if (multiempresaActiva()) {
    if (!multiempresaCanales()) return new Response(null, { status: 404 });
    return recibirWhatsappMultiempresa(req, webhookToken);
  }
  const env = getEnv();
  if (!isValidWebhookToken(webhookToken, env.META_WEBHOOK_VERIFY_TOKEN)) {
    return new Response(null, { status: 404 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!isValidSignature(rawBody, signature, env.META_APP_SECRET)) {
    return new Response(null, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // body ilegible: 200 igualmente (Meta reintenta y termina desactivando)
    return Response.json({ received: true });
  }

  return recibirEvento("whatsapp", payload, rawBody, "webhook");
}

async function recibirWhatsappMultiempresa(req: Request, segmento: string) {
  let conexion: Awaited<ReturnType<typeof conexionParaWebhookWhatsapp>>;
  try {
    conexion = await conexionParaWebhookWhatsapp(segmento);
  } catch {
    return new Response(null, { status: 503 });
  }
  if (!conexion) return new Response(null, { status: 404 });
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length > 2_000_000) return new Response(null, { status: 413 });
  if (!isValidSignature(raw, req.headers.get("x-hub-signature-256"), conexion.appSecret)) {
    return new Response(null, { status: 401 });
  }
  const cuerpo = raw.toString("utf8");
  let payload: unknown;
  try { payload = JSON.parse(cuerpo); }
  catch { return new Response(null, { status: 400 }); }
  if (!payloadWhatsappDeConexion(payload, conexion)) return new Response(null, { status: 403 });
  return recibirEvento(
    "whatsapp", entregaWhatsappVerificada(conexion.id, payload), cuerpo, "whatsapp", conexion.organizationId
  );
}
