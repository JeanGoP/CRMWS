import type { WebhookValue } from "@/server/inbox/webhook";
import { applyTemplateStatusEvent } from "@/server/whatsapp/templates";
import type { VinculoWhatsapp } from "./webhook-multiempresa";

/**
 * Evento `message_template_status_update` (llega a nivel WABA: se enruta por
 * entry.id). Idempotente: re-aplicar el mismo estado no tiene efectos.
 */
export async function processTemplateStatusValue(
  wabaId: string | null,
  value: WebhookValue,
  vinculo?: VinculoWhatsapp
): Promise<void> {
  await applyTemplateStatusEvent(wabaId, value, vinculo);
}
