import { z } from "zod";
import { graphRequest, MetaApiError } from "@/lib/meta/client";
import type { WebhookRegistration } from "./connect";

const metaId = z.string().trim().regex(/^[1-9]\d{0,29}$/, "Usa el ID numérico que aparece en Meta");

export const conexionWhatsappMultiempresaSchema = z.object({
  wabaId: metaId,
  phoneNumberId: metaId,
  appId: metaId,
  appSecret: z.string().trim().regex(/^[a-zA-Z0-9]{32,128}$/, "Introduce el secreto de la app de Meta"),
  token: z.string().trim().min(16).max(4096).regex(/^[^\s]+$/),
});

export type ConexionWhatsappMultiempresa = z.infer<typeof conexionWhatsappMultiempresaSchema>;

export class WhatsappConfigError extends Error {
  constructor(readonly code: string, message: string, readonly status: number = 422) {
    super(message);
  }
}

export function respuestaErrorWhatsapp(error: unknown): Response {
  if (!(error instanceof WhatsappConfigError)) throw error;
  return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
}

type DebugToken = { data?: { app_id?: string; is_valid?: boolean; scopes?: string[] } };
type Numero = { id?: string; display_phone_number?: string; verified_name?: string };
type Numeros = { data?: Numero[]; paging?: { next?: string; cursors?: { after?: string } } };
type Apps = {
  data?: { id?: string; whatsapp_business_api_data?: { id?: string }; override_callback_uri?: string }[];
  paging?: { next?: string };
};
type ConfiguracionWebhook = {
  id?: string;
  webhook_configuration?: { phone_number?: string; waba?: string; application?: string };
};

function errorMeta(err: unknown): WhatsappConfigError {
  if (err instanceof WhatsappConfigError) return err;
  if (err instanceof MetaApiError && (err.status === 0 || err.status >= 500 || err.status === 429)) {
    return new WhatsappConfigError("meta_unavailable", "Meta no respondió. Intenta de nuevo en unos minutos.", 503);
  }
  // Los mensajes de Graph pueden contener URLs, datos del negocio o la credencial inspeccionada.
  return new WhatsappConfigError("meta_error", "Meta rechazó la operación. Revisa los datos y permisos de la app.");
}

async function numeroDeWaba(input: ConexionWhatsappMultiempresa): Promise<Numero> {
  let after: string | undefined;
  for (let pagina = 0; pagina < 10; pagina++) {
    const query = new URLSearchParams({ fields: "id,display_phone_number,verified_name", limit: "100" });
    if (after) query.set("after", after);
    const res = await graphRequest<Numeros | null>(`${input.wabaId}/phone_numbers?${query}`, {
      token: input.token, fresh: true,
    });
    const numero = res?.data?.find((n) => n.id === input.phoneNumberId);
    if (numero?.display_phone_number) return numero;
    const siguiente = res?.paging?.next ? res.paging.cursors?.after : undefined;
    if (!siguiente || siguiente === after) break;
    after = siguiente;
  }
  throw new WhatsappConfigError("invalid_waba_number", "El número no aparece en la cuenta de WhatsApp Business indicada.");
}

/** Valida la app de la credencial y comprueba el número contra la lista de la cuenta. Solo lectura. */
export async function verificarConexionWhatsapp(input: ConexionWhatsappMultiempresa) {
  try {
    const query = new URLSearchParams({ input_token: input.token });
    const res = await graphRequest<DebugToken | null>(`debug_token?${query}`, {
      token: `${input.appId}|${input.appSecret}`, fresh: true,
    });
    const datos = res?.data;
    if (!datos?.is_valid || datos.app_id !== input.appId) {
      throw new WhatsappConfigError("invalid_token", "El token no corresponde a la app de Meta indicada o ya expiró.");
    }
    if (!datos.scopes?.includes("whatsapp_business_management") ||
        !datos.scopes.includes("whatsapp_business_messaging")) {
      throw new WhatsappConfigError(
        "missing_permission", "El token requiere permisos de administración y mensajería de WhatsApp."
      );
    }
    const numero = await numeroDeWaba(input);
    return { displayPhoneNumber: numero.display_phone_number!, verifiedName: numero.verified_name ?? null };
  } catch (err) {
    throw errorMeta(err);
  }
}

async function consultarWebhook(input: ConexionWhatsappMultiempresa) {
  const res = await graphRequest<ConfiguracionWebhook | null>(`${input.phoneNumberId}?fields=webhook_configuration`, {
    token: input.token, fresh: true,
  });
  if (res?.id !== input.phoneNumberId || !res.webhook_configuration) {
    throw new WhatsappConfigError("webhook_unknown", "Meta no informó la configuración del webhook del número.");
  }
  return res.webhook_configuration;
}

/** La app debe estar suscrita. Hilora no sobrescribe el webhook de una cuenta o de otro servicio. */
export async function registrarWebhookMultiempresa(
  input: ConexionWhatsappMultiempresa, webhook: { url: string; verifyToken: string }
): Promise<WebhookRegistration> {
  try {
    if (!webhook.url.startsWith("https://")) {
      throw new WhatsappConfigError("insecure_webhook", "El webhook de WhatsApp necesita un dominio HTTPS.");
    }
    const apps = await graphRequest<Apps | null>(`${input.wabaId}/subscribed_apps`, {
      token: input.token, fresh: true,
    });
    if (!apps?.data?.some((app) => (app.whatsapp_business_api_data?.id ?? app.id) === input.appId)) {
      throw new WhatsappConfigError("missing_subscription", "Suscribe la app en Meta a la cuenta de WhatsApp Business y vuelve a intentar.");
    }
    if (apps.paging?.next || apps.data.some((app) => app.override_callback_uri && app.override_callback_uri !== webhook.url)) {
      throw new WhatsappConfigError("existing_webhook", "La cuenta de Meta tiene otra dirección de webhook. Revísala en Meta antes de continuar.");
    }
    const actual = await consultarWebhook(input);
    if ((actual.phone_number && actual.phone_number !== webhook.url) ||
        (actual.waba && actual.waba !== webhook.url) ||
        (actual.application && actual.application !== webhook.url && !actual.phone_number)) {
      throw new WhatsappConfigError("existing_webhook", "Meta tiene otra dirección de webhook. Revísala allí antes de continuar.");
    }
    if (actual.phone_number === webhook.url) {
      return { ok: true, appWithoutWebhook: !actual.application };
    }
    await graphRequest(input.phoneNumberId, {
      method: "POST",
      token: input.token,
      body: { webhook_configuration: { override_callback_uri: webhook.url, verify_token: webhook.verifyToken } },
      fresh: true,
    });
    const guardado = await consultarWebhook(input);
    if (guardado.phone_number !== webhook.url) {
      throw new WhatsappConfigError("webhook_unknown", "Meta aún no confirma el webhook del número. Vuelve a intentar.");
    }
    return { ok: true, appWithoutWebhook: !guardado.application };
  } catch (err) {
    const error = errorMeta(err);
    return { ok: false, code: error.code === "meta_unavailable" ? "meta_unavailable" : "meta_error", message: error.message };
  }
}

/** Solo toca un override exacto de esta conexión, incluso al soltar una cuenta. */
export async function quitarWebhookMultiempresa(
  input: ConexionWhatsappMultiempresa, urlPropia: string
): Promise<boolean> {
  try {
    const actual = await consultarWebhook(input);
    if (actual.phone_number !== urlPropia) return true;
    await graphRequest(input.phoneNumberId, {
      method: "POST",
      token: input.token,
      body: { webhook_configuration: { override_callback_uri: "" } },
      fresh: true,
    });
    return (await consultarWebhook(input)).phone_number !== urlPropia;
  } catch {
    return false;
  }
}
