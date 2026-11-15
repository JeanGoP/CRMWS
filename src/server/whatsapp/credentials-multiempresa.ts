import { createHmac } from "node:crypto";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { getEnv } from "@/lib/env";
import { safeEqual } from "@/server/inbox/webhook";
import type { WebhookRegistration } from "./connect";
import {
  quitarWebhookMultiempresa,
  registrarWebhookMultiempresa,
  verificarConexionWhatsapp,
  WhatsappConfigError,
  type ConexionWhatsappMultiempresa,
} from "./connect-multiempresa";

const tabla = schema.metaCredentials;
type Fila = typeof tabla.$inferSelect;
type Transaccion = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

function secretoDeFirma(fila: Pick<Fila, "appId" | "appSecretCipher" | "appSecretIv" | "appSecretTag">) {
  if (!fila.appId || !fila.appSecretCipher || !fila.appSecretIv || !fila.appSecretTag) return null;
  return decryptSecret({ cipher: fila.appSecretCipher, iv: fila.appSecretIv, tag: fila.appSecretTag });
}

function conexionDe(fila: Fila): ConexionWhatsappMultiempresa | null {
  const appSecret = secretoDeFirma(fila);
  if (!fila.appId || !appSecret) return null;
  return {
    wabaId: fila.wabaId,
    phoneNumberId: fila.phoneNumberId,
    appId: fila.appId,
    appSecret,
    token: decryptSecret({ cipher: fila.tokenCipher, iv: fila.tokenIv, tag: fila.tokenTag }),
  };
}

function codigoWebhook(id: string, uso: "ruta" | "verificacion"): string {
  return createHmac("sha256", Buffer.from(getEnv().ENCRYPTION_KEY, "base64"))
    .update(`whatsapp-multiempresa:v1:${uso}:${id}`)
    .digest("hex");
}

export function direccionWebhookWhatsapp(id: string) {
  const base = getEnv().APP_BASE_URL.replace(/\/$/, "");
  const segmento = `${id}-${codigoWebhook(id, "ruta")}`;
  return { url: `${base}/api/webhooks/wa/${segmento}`, verifyToken: codigoWebhook(id, "verificacion") };
}

export async function conexionParaWebhookWhatsapp(segmento: string) {
  const partes = /^(cred_[a-z0-9]{20})-([0-9a-f]{64})$/.exec(segmento);
  if (!partes || !safeEqual(partes[2]!, codigoWebhook(partes[1]!, "ruta"))) return null;
  const [fila] = await getDb().select({
    id: tabla.id,
    organizationId: tabla.organizationId,
    wabaId: tabla.wabaId,
    phoneNumberId: tabla.phoneNumberId,
    appId: tabla.appId,
    appSecretCipher: tabla.appSecretCipher,
    appSecretIv: tabla.appSecretIv,
    appSecretTag: tabla.appSecretTag,
  }).from(tabla).where(eq(tabla.id, partes[1]!)).limit(1);
  const appSecret = fila && secretoDeFirma(fila);
  if (!fila || !appSecret) return null;
  return {
    id: fila.id,
    organizationId: fila.organizationId,
    wabaId: fila.wabaId,
    phoneNumberId: fila.phoneNumberId,
    appSecret,
    verifyToken: codigoWebhook(fila.id, "verificacion"),
  };
}

export async function conexionWhatsappParaEntrega(organizationId: string, conexionId: string) {
  const [fila] = await getDb().select({
    id: tabla.id,
    organizationId: tabla.organizationId,
    wabaId: tabla.wabaId,
    phoneNumberId: tabla.phoneNumberId,
  }).from(tabla).where(and(
    eq(tabla.organizationId, organizationId),
    eq(tabla.id, conexionId),
    isNotNull(tabla.appId),
    isNotNull(tabla.appSecretCipher),
  )).limit(1);
  return fila ?? null;
}

/** Las altas y los cambios de webhook se serializan entre réplicas. El desafío de Meta solo lee. */
async function gestionarConexion<T>(
  organizationId: string,
  action: (tx: Transaccion, actual: Fila | undefined) => Promise<T>
): Promise<T> {
  return getDb().transaction(async (tx) => {
    const [lock] = await tx.execute<{ tomado: boolean }>(sql`select pg_try_advisory_xact_lock(1486168209) as tomado`);
    if (!lock?.tomado) {
      throw new WhatsappConfigError("whatsapp_busy", "Hay un cambio de WhatsApp en curso. Vuelve a intentar.", 409);
    }
    const [actual] = await tx.select().from(tabla).where(eq(tabla.organizationId, organizationId)).limit(1);
    return action(tx, actual);
  });
}

/** El token y el App Secret se cifran en columnas independientes. */
export async function guardarWhatsappMultiempresa(
  organizationId: string,
  input: ConexionWhatsappMultiempresa
) {
  const verificado = await verificarConexionWhatsapp(input);
  const id = await gestionarConexion(organizationId, async (tx, actual) => {
    if (actual && (actual.phoneNumberId !== input.phoneNumberId || actual.wabaId !== input.wabaId ||
        (actual.appId && actual.appId !== input.appId))) {
      throw new WhatsappConfigError("disconnect_first", "Desconecta el número actual antes de cambiar de cuenta o de app.", 409);
    }
    const reclamadas = await tx.select({ organizationId: tabla.organizationId }).from(tabla).where(or(
      eq(tabla.phoneNumberId, input.phoneNumberId), eq(tabla.wabaId, input.wabaId)
    ));
    if (reclamadas.some((fila) => fila.organizationId !== organizationId)) {
      throw new WhatsappConfigError("whatsapp_in_use", "Ese número o cuenta ya está conectado en Hilora.", 409);
    }
    const token = encryptSecret(input.token);
    const firma = encryptSecret(input.appSecret);
    const datos = {
      phoneNumberId: input.phoneNumberId,
      wabaId: input.wabaId,
      appId: input.appId,
      tokenCipher: token.cipher,
      tokenIv: token.iv,
      tokenTag: token.tag,
      appSecretCipher: firma.cipher,
      appSecretIv: firma.iv,
      appSecretTag: firma.tag,
      status: "connected" as const,
      ...verificado,
    };
    const id = actual?.id ?? newId("credentials");
    await tx.insert(tabla).values({ id, organizationId, ...datos }).onConflictDoUpdate({
      target: tabla.organizationId, set: { ...datos, updatedAt: new Date() },
    });
    return id;
  });
  return { id, ...verificado };
}

export async function registrarWhatsappDeEmpresa(
  organizationId: string, conexionIdEsperada?: string
): Promise<WebhookRegistration> {
  return gestionarConexion(organizationId, async (_tx, actual) => {
    const conexion = actual && conexionDe(actual);
    if (!actual || !conexion || (conexionIdEsperada && actual.id !== conexionIdEsperada)) {
      throw new WhatsappConfigError("sin_conexion", "Primero guarda la conexión de WhatsApp.", 409);
    }
    await verificarConexionWhatsapp(conexion);
    return registrarWebhookMultiempresa(conexion, direccionWebhookWhatsapp(actual.id));
  });
}

export async function desconectarWhatsappDeEmpresa(organizationId: string) {
  return gestionarConexion(organizationId, async (tx, actual) => {
    if (!actual) return { webhookRemoved: true };
    const conexion = conexionDe(actual);
    // Un token vencido no obliga a mantener la conexión local. En ese caso no se modifica Meta.
    const webhookRemoved = await (async () => {
      if (!conexion) return false;
      try {
        await verificarConexionWhatsapp(conexion);
        return await quitarWebhookMultiempresa(conexion, direccionWebhookWhatsapp(actual.id).url);
      } catch {
        return false;
      }
    })();
    await tx.delete(tabla).where(eq(tabla.organizationId, organizationId));
    return { webhookRemoved };
  });
}
