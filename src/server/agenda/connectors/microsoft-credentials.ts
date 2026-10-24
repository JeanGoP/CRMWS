import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";

export type MicrosoftCreds = {
  organizationId?: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
  status: "connected" | "error";
};

export async function getMicrosoftCredentials(organizationId: string): Promise<MicrosoftCreds | null> {
  const rows = await getDb().select().from(schema.microsoftCredentials)
    .where(scoped(schema.microsoftCredentials.organizationId, organizationId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    organizationId,
    tenantId: row.tenantId,
    clientId: row.clientId,
    clientSecret: decryptSecret({ cipher: row.clientSecretCipher, iv: row.clientSecretIv, tag: row.clientSecretTag }),
    refreshToken: decryptSecret({ cipher: row.refreshTokenCipher, iv: row.refreshTokenIv, tag: row.refreshTokenTag }),
    calendarId: row.calendarId,
    status: row.status,
  };
}

export async function saveMicrosoftCredentials(input: MicrosoftCreds & { organizationId: string }): Promise<void> {
  const secret = encryptSecret(input.clientSecret);
  const refresh = encryptSecret(input.refreshToken);
  const values = {
    tenantId: input.tenantId,
    clientId: input.clientId,
    clientSecretCipher: secret.cipher,
    clientSecretIv: secret.iv,
    clientSecretTag: secret.tag,
    refreshTokenCipher: refresh.cipher,
    refreshTokenIv: refresh.iv,
    refreshTokenTag: refresh.tag,
    calendarId: input.calendarId.trim() || "primary",
    status: "connected" as const,
  };
  await getDb().insert(schema.microsoftCredentials).values({
    id: newId("microsoftCredentials"), organizationId: input.organizationId, ...values,
  }).onConflictDoUpdate({
    target: schema.microsoftCredentials.organizationId,
    set: { ...values, updatedAt: new Date() },
  });
  clearMicrosoftTokenCache();
}

/** Microsoft rota el refresh token: conservar el nuevo sin alterar la conexión. */
export async function rotateMicrosoftRefreshToken(organizationId: string, refreshToken: string): Promise<void> {
  const encrypted = encryptSecret(refreshToken);
  await getDb().update(schema.microsoftCredentials).set({
    refreshTokenCipher: encrypted.cipher,
    refreshTokenIv: encrypted.iv,
    refreshTokenTag: encrypted.tag,
    updatedAt: new Date(),
  }).where(scoped(schema.microsoftCredentials.organizationId, organizationId));
}

export async function deleteMicrosoftCredentials(organizationId: string): Promise<void> {
  await getDb().delete(schema.microsoftCredentials)
    .where(scoped(schema.microsoftCredentials.organizationId, organizationId));
  clearMicrosoftTokenCache();
}

export async function markMicrosoftError(organizationId: string): Promise<void> {
  await getDb().update(schema.microsoftCredentials)
    .set({ status: "error", updatedAt: new Date() })
    .where(scoped(schema.microsoftCredentials.organizationId, organizationId));
}

type CachedToken = { token: string; expiresAtMs: number };
const tokenCache = new Map<string, CachedToken>();

export function getCachedMicrosoftToken(key: string): string | null {
  const hit = tokenCache.get(key);
  if (!hit) return null;
  if (hit.expiresAtMs <= Date.now()) {
    tokenCache.delete(key);
    return null;
  }
  return hit.token;
}

export function setCachedMicrosoftToken(key: string, token: string, expiresInSeconds: number): void {
  tokenCache.set(key, { token, expiresAtMs: Date.now() + Math.max(30, expiresInSeconds - 60) * 1000 });
}

export function clearMicrosoftTokenCache(): void {
  tokenCache.clear();
}
