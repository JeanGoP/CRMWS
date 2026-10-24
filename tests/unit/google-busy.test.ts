import { beforeEach, describe, expect, it, vi } from "vitest";
import { googleBusyIntervals } from "@/server/agenda/connectors/google";
import { clearGoogleTokenCache } from "@/server/agenda/connectors/google-credentials";

const creds = {
  clientId: "id",
  clientSecret: "secret",
  refreshToken: "refresh",
  calendarId: "primary",
  status: "connected" as const,
};

beforeEach(() => {
  clearGoogleTokenCache();
  vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
  vi.stubEnv("DATABASE_URL", "postgresql://t:t@localhost:5432/t");
  vi.stubEnv("BETTER_AUTH_SECRET", "secret-de-test-suficiente");
  vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
  vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify-test");
  vi.stubEnv("GOOGLE_OAUTH_BASE_URL", "https://oauth.test");
  vi.stubEnv("GOOGLE_CAL_BASE_URL", "https://cal.test");
});

describe("ocupación de Google Calendar", () => {
  it("expande recurrencias, pagina y omite eventos libres y la propia cita", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(String(url));
      if (String(url).includes("/token")) {
        return Response.json({ access_token: "token", expires_in: 3600 });
      }
      const page = new URL(String(url)).searchParams.get("pageToken");
      return Response.json(page ? {
        items: [
          { id: "dia-completo", start: { date: "2026-10-26" }, end: { date: "2026-10-27" } },
          { id: "propia", start: { dateTime: "2026-10-27T16:00:00Z" }, end: { dateTime: "2026-10-27T17:00:00Z" } },
        ],
      } : {
        nextPageToken: "siguiente",
        items: [
          { id: "ocupado", start: { dateTime: "2026-10-26T13:00:00Z" }, end: { dateTime: "2026-10-26T14:00:00Z" } },
          { id: "libre", transparency: "transparent", start: { dateTime: "2026-10-26T14:00:00Z" }, end: { dateTime: "2026-10-26T15:00:00Z" } },
          { id: "cancelado", status: "cancelled", start: { dateTime: "2026-10-26T15:00:00Z" }, end: { dateTime: "2026-10-26T16:00:00Z" } },
        ],
      });
    }));

    const busy = await googleBusyIntervals(
      creds,
      new Date("2026-10-26T05:00:00Z"),
      new Date("2026-10-28T05:00:00Z"),
      "America/Bogota",
      "propia"
    );
    expect(busy).toEqual([
      { startUtc: "2026-10-26T13:00:00.000Z", endUtc: "2026-10-26T14:00:00.000Z" },
      { startUtc: "2026-10-26T05:00:00.000Z", endUtc: "2026-10-27T05:00:00.000Z" },
    ]);
    expect(urls.filter((u) => u.includes("/events?"))).toHaveLength(2);
    expect(urls[1]).toContain("singleEvents=true");
  });

  it("falla cerrado si Google no responde", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/token")) {
        return Response.json({ access_token: "token", expires_in: 3600 });
      }
      return new Response("fallo", { status: 503 });
    }));
    await expect(googleBusyIntervals(creds, new Date("2026-10-26T00:00:00Z"), new Date("2026-10-27T00:00:00Z"), "America/Bogota")).rejects.toThrow();
  });
});
