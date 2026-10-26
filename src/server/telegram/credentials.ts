import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

export type TelegramCredentials = {
  organizationId: string;
  botId: string;
  username: string;
  token: string;
  webhookSecret: string;
  status: "connected" | "reconnect_required";
};

type Row = typeof schema.telegramCredentials.$inferSelect;
function fromRow(row: Row): TelegramCredentials {
  return {
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

export async function saveTelegramCredentials(input: TelegramCredentials): Promise<void> {
  const token = encryptSecret(input.token);
  const secret = encryptSecret(input.webhookSecret);
  await getDb().insert(schema.telegramCredentials).values({
    id: newId("credentials"), organizationId: input.organizationId,
    botId: input.botId, username: input.username,
    tokenCipher: token.cipher, tokenIv: token.iv, tokenTag: token.tag,
    webhookSecretCipher: secret.cipher, webhookSecretIv: secret.iv, webhookSecretTag: secret.tag,
    status: "connected", updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: schema.telegramCredentials.organizationId,
    set: {
      botId: input.botId, username: input.username,
      tokenCipher: token.cipher, tokenIv: token.iv, tokenTag: token.tag,
      webhookSecretCipher: secret.cipher, webhookSecretIv: secret.iv, webhookSecretTag: secret.tag,
      status: "connected", updatedAt: new Date(),
    },
  });
}

export async function markTelegramReconnectRequired(organizationId: string): Promise<void> {
  await getDb().update(schema.telegramCredentials)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(eq(schema.telegramCredentials.organizationId, organizationId));
}
