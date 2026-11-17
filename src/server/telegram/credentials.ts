import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

export type TelegramCredentials = {
  id: string;
  organizationId: string;
  botId: string;
  username: string;
  token: string;
  webhookSecret: string;
  status: "connected" | "reconnect_required";
};

type DatosCredenciales = Omit<TelegramCredentials, "id">;
type Row = typeof schema.telegramCredentials.$inferSelect;
type Transaccion = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export class TelegramConnectionError extends Error {
  constructor(readonly code: "bot_in_use" | "bot_already_linked" | "webhook_in_use" | "connection_busy") {
    super(code);
  }
}

function fromRow(row: Row): TelegramCredentials {
  return {
    id: row.id,
    organizationId: row.organizationId,
    botId: row.botId,
    username: row.username,
    token: decryptSecret({ cipher: row.tokenCipher, iv: row.tokenIv, tag: row.tokenTag }),
    webhookSecret: decryptSecret({ cipher: row.webhookSecretCipher, iv: row.webhookSecretIv, tag: row.webhookSecretTag }),
    status: row.status,
  };
}

export async function telegramCredentialsForOrg(organizationId: string): Promise<TelegramCredentials | null> {
  const [row] = await getDb().select().from(schema.telegramCredentials)
    .where(eq(schema.telegramCredentials.organizationId, organizationId)).limit(1);
  return row ? fromRow(row) : null;
}

export async function telegramCredentialsForBot(botId: string): Promise<TelegramCredentials | null> {
  const [row] = await getDb().select().from(schema.telegramCredentials)
    .where(eq(schema.telegramCredentials.botId, botId)).limit(1);
  return row ? fromRow(row) : null;
}

function credencialesCifradas(input: DatosCredenciales) {
  const token = encryptSecret(input.token);
  const secret = encryptSecret(input.webhookSecret);
  return {
    botId: input.botId, username: input.username,
    tokenCipher: token.cipher, tokenIv: token.iv, tokenTag: token.tag,
    webhookSecretCipher: secret.cipher, webhookSecretIv: secret.iv, webhookSecretTag: secret.tag,
    status: input.status, updatedAt: new Date(),
  };
}

export async function saveTelegramCredentials(input: DatosCredenciales): Promise<void> {
  const valores = credencialesCifradas(input);
  await getDb().insert(schema.telegramCredentials).values({
    id: newId("credentials"), organizationId: input.organizationId, ...valores,
  }).onConflictDoUpdate({
    target: schema.telegramCredentials.organizationId,
    set: valores,
  });
}

async function bloquearConexion(tx: Transaccion, organizationId: string, botId: string) {
  // Orden fijo y sin espera: una llamada a Telegram no retiene otras empresas ni agota el pool.
  for (const [ambito, clave] of [["hilora:telegram:empresa", organizationId], ["hilora:telegram:bot", botId]]) {
    const [fila] = await tx.execute<{ tomado: boolean }>(sql`
      select pg_try_advisory_xact_lock(hashtext(${ambito}), hashtext(${clave})) as tomado
    `);
    if (!fila?.tomado) throw new TelegramConnectionError("connection_busy");
  }
}

/** Confirma en Postgres quién puede configurar este bot antes de modificar Telegram. */
export async function reservarTelegramBot(input: DatosCredenciales): Promise<void> {
  await getDb().transaction(async (tx) => {
    await bloquearConexion(tx, input.organizationId, input.botId);
    const [actual] = await tx.select({ botId: schema.telegramCredentials.botId })
      .from(schema.telegramCredentials)
      .where(eq(schema.telegramCredentials.organizationId, input.organizationId)).limit(1);
    if (actual) {
      if (actual.botId !== input.botId) throw new TelegramConnectionError("bot_already_linked");
      return;
    }
    const [dueno] = await tx.select({ organizationId: schema.telegramCredentials.organizationId })
      .from(schema.telegramCredentials)
      .where(eq(schema.telegramCredentials.botId, input.botId)).limit(1);
    if (dueno) throw new TelegramConnectionError("bot_in_use");

    const [reserva] = await tx.insert(schema.telegramCredentials).values({
      id: newId("credentials"), organizationId: input.organizationId,
      ...credencialesCifradas({ ...input, status: "reconnect_required" }),
    }).onConflictDoNothing().returning({ id: schema.telegramCredentials.id });
    if (!reserva) throw new TelegramConnectionError("connection_busy");
  });
}

export async function conectarTelegramBotReservado(
  input: Pick<TelegramCredentials, "organizationId" | "botId" | "username" | "token">,
  configurarWebhook: (secret: string) => Promise<void>
): Promise<void> {
  await getDb().transaction(async (tx) => {
    await bloquearConexion(tx, input.organizationId, input.botId);
    const [actual] = await tx.select().from(schema.telegramCredentials).where(and(
      eq(schema.telegramCredentials.organizationId, input.organizationId),
      eq(schema.telegramCredentials.botId, input.botId)
    )).limit(1).for("update");
    if (!actual) throw new TelegramConnectionError("bot_in_use");

    // El secreto ya existe de forma durable. Si Telegram aplica un cambio y la
    // respuesta se pierde, la ruta puede verificarlo y una reconexión lo reutiliza.
    const { webhookSecret } = fromRow(actual);
    const valores = credencialesCifradas({ ...input, webhookSecret, status: "connected" });
    await configurarWebhook(webhookSecret);
    await tx.update(schema.telegramCredentials).set(valores).where(and(
      eq(schema.telegramCredentials.id, actual.id),
      eq(schema.telegramCredentials.organizationId, input.organizationId)
    ));
  });
}

export async function markTelegramReconnectRequired(
  usada: Pick<TelegramCredentials, "id" | "organizationId" | "botId" | "token">
): Promise<void> {
  await getDb().transaction(async (tx) => {
    const filtro = and(
      eq(schema.telegramCredentials.id, usada.id),
      eq(schema.telegramCredentials.organizationId, usada.organizationId),
      eq(schema.telegramCredentials.botId, usada.botId),
      eq(schema.telegramCredentials.status, "connected")
    );
    const [actual] = await tx.select().from(schema.telegramCredentials).where(filtro).limit(1).for("update");
    // Un 401 tardío del token anterior no desconecta un bot que ya se reconectó.
    if (!actual || fromRow(actual).token !== usada.token) return;
    await tx.update(schema.telegramCredentials).set({ status: "reconnect_required", updatedAt: new Date() }).where(filtro);
  });
}
