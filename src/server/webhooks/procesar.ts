import type { WebhookPayload } from "@/server/inbox/webhook";
import { processEchoesValue, processMessagesValue } from "@/server/inbox/ingest";
import { processTemplateStatusValue } from "@/server/whatsapp/template-events";
import { processMetaInstagramPayload } from "@/server/instagram/ingest";
import { processMetaPagePayload } from "@/server/messenger/ingest";
import { processZernioPayload } from "@/server/zernio/dispatch";
import { lanzarFalloDePrueba } from "@/server/dev/webhook-fallo";
import type { FuenteWebhook } from "./eventos";
import { processTelegramUpdate } from "@/server/telegram/ingest";
import { multiempresaActiva, multiempresaCanales } from "@/server/empresas/flag";
import { conexionWhatsappParaEntrega } from "@/server/whatsapp/credentials-multiempresa";
import { leerEntregaWhatsappVerificada, payloadWhatsappDeConexion, type VinculoWhatsapp } from "@/server/whatsapp/webhook-multiempresa";

/**
 * 047 — Quién procesa cada evento guardado. Antes cada ruta llamaba a su
 * procesador dentro de un `after()`; ahora lo llaman igual la ruta (en el
 * caso normal) y el barrido (al reintentar), así que vive en un solo lugar.
 *
 * Lanza si el procesamiento falla: eso es lo que hace que se reintente. Lo
 * que la ingesta descarta a propósito (un tipo no soportado, un mensaje sin
 * identidad) no lanza y no se reintenta.
 */
export async function procesarFuente(
  fuente: FuenteWebhook,
  payload: unknown,
  organizationId?: string
): Promise<void> {
  if (multiempresaActiva() && (!multiempresaCanales() || (fuente !== "whatsapp" && fuente !== "telegram"))) return;
  // Solo con mocks: el arnés E2E inyecta fallos aquí (no-op en producción).
  lanzarFalloDePrueba();
  switch (fuente) {
    case "whatsapp":
      if (multiempresaActiva()) {
        if (!organizationId) return;
        const entrega = leerEntregaWhatsappVerificada(payload);
        if (!entrega) return;
        const vinculo = await conexionWhatsappParaEntrega(organizationId, entrega.id);
        if (!vinculo || !payloadWhatsappDeConexion(entrega.payload, vinculo)) return;
        return procesarWhatsapp(entrega.payload, vinculo);
      }
      return procesarWhatsapp(payload as WebhookPayload);
    case "meta_instagram":
      return processMetaInstagramPayload(payload);
    case "meta_messenger":
      return processMetaPagePayload(payload);
    case "zernio":
      return processZernioPayload(payload);
    case "telegram":
      return processTelegramUpdate(payload, organizationId);
  }
}

/** El cuerpo de un webhook de WhatsApp: mensajes, echos de coexistence y estados de plantillas. */
async function procesarWhatsapp(payload: WebhookPayload, vinculo?: VinculoWhatsapp): Promise<void> {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (!change.value) continue;
      if (change.field === "messages") {
        await processMessagesValue(change.value, vinculo);
      } else if (change.field === "smb_message_echoes") {
        // 008: mensajes enviados a mano desde la app del teléfono (coexistence)
        await processEchoesValue(change.value, vinculo);
      } else if (change.field === "message_template_status_update") {
        await processTemplateStatusValue(entry.id ?? null, change.value, vinculo);
      }
      // otros fields: ignorar sin error
    }
  }
}
