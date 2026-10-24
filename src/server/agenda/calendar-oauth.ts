import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import type { SessionContext } from "@/lib/auth/session";
import { GOOGLE_SCOPE } from "@/server/agenda/connectors/google";
import { MICROSOFT_SCOPES } from "@/server/agenda/connectors/microsoft";

export type CalendarProvider = "google" | "microsoft";

const stateSchema = z.object({
  organizationId: z.string(),
  userId: z.string(),
  provider: z.enum(["google", "microsoft"]),
  nonce: z.string().min(20),
  issuedAt: z.number().int(),
});

export function oauthConfig(provider: CalendarProvider) {
  const env = getEnv();
  const clientId = provider === "google" ? env.GOOGLE_OAUTH_CLIENT_ID : env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret = provider === "google" ? env.GOOGLE_OAUTH_CLIENT_SECRET : env.MICROSOFT_OAUTH_CLIENT_SECRET;
  return clientId && clientSecret ? {
    clientId, clientSecret,
    tenantId: provider === "microsoft" ? env.MICROSOFT_OAUTH_TENANT_ID || "organizations" : undefined,
  } : null;
}

export function callbackUrl(provider: CalendarProvider): string {
  return new URL(`/api/settings/calendar-oauth/${provider}/callback`, getEnv().APP_BASE_URL).toString();
}

export function oauthCookie(provider: CalendarProvider): string {
  return `calendar_oauth_${provider}`;
}

function signature(payload: string): Buffer {
  return createHmac("sha256", getEnv().BETTER_AUTH_SECRET).update(payload).digest();
}

export function makeOauthState(session: SessionContext, provider: CalendarProvider) {
  const nonce = randomBytes(32).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    organizationId: session.organizationId,
    userId: session.userId,
    provider,
    nonce,
    issuedAt: Date.now(),
  })).toString("base64url");
  return { nonce, state: `${payload}.${signature(payload).toString("base64url")}` };
}

export function validOauthState(state: string | null, nonce: string | undefined, session: SessionContext, provider: CalendarProvider): boolean {
  if (!state || !nonce || state.length > 2048) return false;
  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const received = Buffer.from(parts[1], "base64url");
  const expected = signature(parts[0]);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
  let raw: unknown;
  try { raw = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
  catch { return false; }
  const parsed = stateSchema.safeParse(raw);
  if (!parsed.success) return false;
  const data = parsed.data;
  return data.organizationId === session.organizationId && data.userId === session.userId &&
    data.provider === provider && data.nonce === nonce &&
    data.issuedAt <= Date.now() && Date.now() - data.issuedAt <= 10 * 60_000;
}

export function authorizeUrl(provider: CalendarProvider, clientId: string, state: string): string {
  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl(provider),
      response_type: "code",
      scope: GOOGLE_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();
    return url.toString();
  }
  const tenant = getEnv().MICROSOFT_OAUTH_TENANT_ID || "organizations";
  const url = new URL(`${getEnv().MICROSOFT_OAUTH_BASE_URL}/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(provider),
    response_type: "code",
    response_mode: "query",
    scope: MICROSOFT_SCOPES,
    state,
  }).toString();
  return url.toString();
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  scope: z.string().optional(),
});

export async function exchangeOauthCode(provider: CalendarProvider, code: string, config: { clientId: string; clientSecret: string }) {
  const url = provider === "google"
    ? `${getEnv().GOOGLE_OAUTH_BASE_URL}/token`
    : `${getEnv().MICROSOFT_OAUTH_BASE_URL}/${encodeURIComponent(getEnv().MICROSOFT_OAUTH_TENANT_ID || "organizations")}/oauth2/v2.0/token`;
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl(provider),
      ...(provider === "microsoft" ? { scope: MICROSOFT_SCOPES } : {}),
    }),
  });
  if (!response.ok) throw new Error("token_exchange_failed");
  const parsed = tokenSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error("missing_refresh_token");
  if (parsed.data.scope && !(provider === "google"
    ? parsed.data.scope.split(" ").includes(GOOGLE_SCOPE)
    : parsed.data.scope.split(" ").some((scope) => scope.toLowerCase() === "calendars.readwrite"))) {
    throw new Error("missing_calendar_permission");
  }
  return parsed.data.refresh_token;
}
