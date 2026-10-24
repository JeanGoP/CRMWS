import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { microsoftBusyIntervals, microsoftConnector } from "@/server/agenda/connectors/microsoft";
import { clearMicrosoftTokenCache } from "@/server/agenda/connectors/microsoft-credentials";

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    MICROSOFT_GRAPH_BASE_URL: "https://graph.test/v1.0",
    MICROSOFT_OAUTH_BASE_URL: "https://login.test",
  }),
}));

const creds = {
  tenantId: "tenant-1",
  clientId: "client-1",
  clientSecret: "secret-1",
  refreshToken: "refresh-1",
  calendarId: "primary",
  status: "connected" as const,
};

const request = {
  topic: "Cita",
  startUtc: "2026-08-05T15:00:00.000Z",
  durationMinutes: 50,
  timezone: "America/Bogota",
};

describe("Microsoft 365 + Teams", () => {
  beforeEach(() => clearMicrosoftTokenCache());
  afterEach(() => vi.unstubAllGlobals());

  it("descuenta eventos ocupados de todas las páginas y omite los libres y la cita propia", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => {
      const target = String(url);
      calls.push(target);
      if (target.includes("/token")) return Response.json({ access_token: "token", expires_in: 3600 });
      if (target.includes("page=2")) return Response.json({ value: [
        { id: "recurrence", showAs: "busy", start: { dateTime: "2026-08-05T16:00:00", timeZone: "UTC" }, end: { dateTime: "2026-08-05T17:00:00", timeZone: "UTC" } },
      ] });
      return Response.json({ value: [
        { id: "own", showAs: "busy", start: { dateTime: "2026-08-05T15:00:00", timeZone: "UTC" }, end: { dateTime: "2026-08-05T15:50:00", timeZone: "UTC" } },
        { id: "free", showAs: "free", start: { dateTime: "2026-08-05T15:00:00", timeZone: "UTC" }, end: { dateTime: "2026-08-05T15:50:00", timeZone: "UTC" } },
        { id: "busy", showAs: "tentative", start: { dateTime: "2026-08-05T15:00:00", timeZone: "UTC" }, end: { dateTime: "2026-08-05T15:50:00", timeZone: "UTC" } },
      ], "@odata.nextLink": "https://graph.test/v1.0/me/calendar/calendarView?page=2" });
    }));
    const slots = await microsoftBusyIntervals(creds, new Date("2026-08-05T00:00:00Z"), new Date("2026-08-06T00:00:00Z"), "own");
    expect(slots).toEqual([
      { startUtc: "2026-08-05T15:00:00.000Z", endUtc: "2026-08-05T15:50:00.000Z" },
      { startUtc: "2026-08-05T16:00:00.000Z", endUtc: "2026-08-05T17:00:00.000Z" },
    ]);
    expect(calls.some((url) => url.includes("/v1.0/me/calendar/calendarView"))).toBe(true);
  });

  it("no sigue una página fuera de Graph", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => {
      if (String(url).includes("/token")) return Response.json({ access_token: "token", expires_in: 3600 });
      return Response.json({ value: [], "@odata.nextLink": "https://evil.test/steal" });
    }));
    await expect(microsoftBusyIntervals(creds, new Date("2026-08-05"), new Date("2026-08-06"))).rejects.toThrow("fuera de Graph");
  });

  it("crea un evento Teams y recupera el enlace sin crear otro evento", async () => {
    const methods: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string, init?: RequestInit) => {
      const target = String(url);
      const method = init?.method ?? "GET";
      if (target.includes("/token")) return Response.json({ access_token: "token", expires_in: 3600 });
      methods.push(method);
      if (method === "POST") {
        const body = JSON.parse(String(init?.body));
        expect(body.onlineMeetingProvider).toBe("teamsForBusiness");
        expect(body.subject).toBe("Cita");
        expect(body.body).toBeUndefined();
        return Response.json({ id: "event-1" });
      }
      return Response.json({ id: "event-1", onlineMeeting: { joinUrl: "https://teams.microsoft.com/test" } });
    }));
    const created = await microsoftConnector.createMeeting(creds, request);
    expect(created).toEqual({ externalId: "event-1", joinUrl: "https://teams.microsoft.com/test" });
    const refreshed = await microsoftConnector.refreshMeeting!(creds, "event-1");
    expect(refreshed.joinUrl).toBe(created.joinUrl);
    expect(methods.filter((method) => method === "POST")).toHaveLength(1);
  });

  it("mueve el mismo evento y borrar un 404 es idempotente", async () => {
    const methods: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string, init?: RequestInit) => {
      if (String(url).includes("/token")) return Response.json({ access_token: "token", expires_in: 3600 });
      methods.push(init?.method ?? "GET");
      return new Response(null, { status: init?.method === "DELETE" ? 404 : 204 });
    }));
    await microsoftConnector.updateMeeting(creds, "event-1", request);
    await microsoftConnector.deleteMeeting(creds, "event-1");
    expect(methods).toEqual(["PATCH", "DELETE"]);
  });
});
