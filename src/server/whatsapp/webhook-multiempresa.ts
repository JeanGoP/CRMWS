import type { WebhookPayload } from "@/server/inbox/webhook";

type Cuenta = { wabaId: string; phoneNumberId: string };
export type VinculoWhatsapp = Cuenta & { id: string; organizationId: string };
type Registro = Record<string, unknown>;

function objeto(valor: unknown): valor is Registro {
  return !!valor && typeof valor === "object" && !Array.isArray(valor);
}

/** El lote completo debe cumplir la cuenta firmada. Nunca se procesa su primer número y se ignora el resto. */
export function payloadWhatsappDeConexion(payload: unknown, cuenta: Cuenta): payload is WebhookPayload {
  if (!objeto(payload) || payload.object !== "whatsapp_business_account" ||
      !Array.isArray(payload.entry) || payload.entry.length === 0) return false;
  return payload.entry.every((entrada: unknown) => {
    if (!objeto(entrada) || entrada.id !== cuenta.wabaId || !Array.isArray(entrada.changes)) return false;
    return entrada.changes.every((cambio: unknown) => {
      if (!objeto(cambio) || typeof cambio.field !== "string" || !objeto(cambio.value)) return false;
      const metadata = cambio.value.metadata;
      if (metadata !== undefined && !objeto(metadata)) return false;
      const numero = metadata?.phone_number_id;
      if (numero !== undefined && numero !== cuenta.phoneNumberId) return false;
      // Estados de plantillas y otros cambios a nivel WABA no traen phone_number_id.
      return !["messages", "smb_message_echoes"].includes(cambio.field) || numero === cuenta.phoneNumberId;
    });
  });
}

export function entregaWhatsappVerificada(conexionId: string, payload: WebhookPayload) {
  return { conexionWhatsappMultiempresa: conexionId, payload };
}

export function leerEntregaWhatsappVerificada(cuerpo: unknown) {
  if (!objeto(cuerpo) || typeof cuerpo.conexionWhatsappMultiempresa !== "string" ||
      !/^cred_[a-z0-9]{20}$/.test(cuerpo.conexionWhatsappMultiempresa)) return null;
  return { id: cuerpo.conexionWhatsappMultiempresa, payload: cuerpo.payload };
}
