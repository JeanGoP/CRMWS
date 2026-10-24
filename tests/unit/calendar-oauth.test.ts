import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authorizeUrl, exchangeOauthCode, makeOauthState, validOauthState,
} from "@/server/agenda/calendar-oauth";

vi.mock("@/lib/env", () => ({ getEnv: () => ({
  APP_BASE_URL: "https://crm.example.com",
  BETTER_AUTH_SECRET: "test-secret-long-enough",
  GOOGLE_OAUTH_BASE_URL: "https://oauth2.googleapis.com",
  MICROSOFT_OAUTH_BASE_URL: "https://login.microsoftonline.com",
}) }));

const session = { userId: "owner", organizationId: "clinic", role: "owner" };

afterEach(() => vi.unstubAllGlobals());

describe("conexión OAuth de calendarios", () => {
  it("vincula el retorno al usuario, organización, proveedor y cookie", () => {
    const { state, nonce } = makeOauthState(session, "google");
    expect(validOauthState(state, nonce, session, "google")).toBe(true);
    expect(validOauthState(state, "otro", session, "google")).toBe(false);
    expect(validOauthState(state, nonce, { ...session, organizationId: "otro" }, "google")).toBe(false);
    expect(validOauthState(state, nonce, session, "microsoft")).toBe(false);
    expect(validOauthState(`${state}x`, nonce, session, "google")).toBe(false);
    expect(validOauthState("no.es.json", nonce, session, "google")).toBe(false);
  });

  it("manda al dominio oficial con retorno propio, estado y acceso persistente", () => {
    const google = new URL(authorizeUrl("google", "google-client", "state-1"));
    expect(google.origin).toBe("https://accounts.google.com");
    expect(google.searchParams.get("redirect_uri")).toBe("https://crm.example.com/api/settings/calendar-oauth/google/callback");
    expect(google.searchParams.get("access_type")).toBe("offline");
    expect(google.searchParams.get("prompt")).toBe("consent");
    expect(google.searchParams.get("state")).toBe("state-1");
    const microsoft = new URL(authorizeUrl("microsoft", "ms-client", "state-2"));
    expect(microsoft.origin).toBe("https://login.microsoftonline.com");
    expect(microsoft.searchParams.get("scope")).toContain("Calendars.ReadWrite");
    expect(microsoft.searchParams.get("scope")).toContain("offline_access");
    expect(microsoft.searchParams.get("redirect_uri")).toBe("https://crm.example.com/api/settings/calendar-oauth/microsoft/callback");
  });

  it("intercambia el código en el servidor y exige refresh token y permiso de calendario", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(String(init.body));
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("client_secret")).toBe("secret");
      return Response.json({ access_token: "access", refresh_token: "refresh", scope: "offline_access Calendars.ReadWrite" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(exchangeOauthCode("microsoft", "code", { clientId: "id", clientSecret: "secret" })).resolves.toBe("refresh");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ access_token: "access" })));
    await expect(exchangeOauthCode("google", "code", { clientId: "id", clientSecret: "secret" })).rejects.toThrow("missing_refresh_token");
  });
});
