import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema, type getDb } from "@/lib/db";
import { guideMultiempresa } from "@/server/onboarding/guide-multiempresa";

const preferencias = vi.hoisted(() => vi.fn());
vi.mock("@/server/channels/preference", () => ({ channelPreferenceFor: preferencias }));

const horarios = { mon: [{ start: "09:00", end: "18:00" }] };
const dialect = new PgDialect();
const datos = new Map<unknown, Record<string, unknown[]>>();
const leer = vi.fn((tabla: unknown, filtro: SQL) => {
  const { params } = dialect.sqlToQuery(filtro);
  const [empresa] = params;
  return Promise.resolve(datos.get(tabla)?.[String(empresa)] ?? []);
});
const db = {
  select: () => ({
    from: (tabla: unknown) => ({
      where: (filtro: SQL) => ({ limit: () => leer(tabla, filtro) }),
    }),
  }),
} as unknown as ReturnType<typeof getDb>;

beforeEach(() => {
  datos.clear();
  leer.mockClear();
  preferencias.mockReset();
  vi.stubEnv("MULTIEMPRESA_PRODUCCION", "on");
  vi.stubEnv("MULTIEMPRESA_CANALES", "");
  vi.stubEnv("AGENDA", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("guía manual de la empresa activa", () => {
  it("consulta cada empresa por separado y omite las áreas no habilitadas", async () => {
    datos.set(schema.agentProfile, {
      org_a: [{ name: "Agente A", instructions: null }],
      org_b: [{ name: "Agente B", instructions: "   " }],
    });
    datos.set(schema.kbEntry, { org_a: [{ id: "kb_a" }] });
    const a = await guideMultiempresa("org_a", db);
    const b = await guideMultiempresa("org_b", db);
    expect(a.steps).toMatchObject([{ href: "/agent", done: true }]);
    expect(b.steps).toMatchObject([{ href: "/agent", done: false }]);
    expect(a).toMatchObject({ complete: true, enabled: false, brainConnected: false });
    expect(b.complete).toBe(false);
    expect(preferencias).not.toHaveBeenCalled();
    expect(leer).toHaveBeenCalledTimes(4);
  });

  it("los canales apagados son opcionales; los elegidos requieren conexión propia", async () => {
    vi.stubEnv("MULTIEMPRESA_CANALES", "on");
    preferencias.mockImplementation(async (empresa: string) => ({
      whatsapp: empresa === "org_a", telegram: empresa === "org_a",
    }));
    datos.set(schema.agentProfile, {
      org_a: [{ name: "Agente A", instructions: "Instrucciones A" }],
      org_b: [{ name: "Agente B", instructions: "Instrucciones B" }],
    });
    datos.set(schema.metaCredentials, {
      org_a: [{ status: "connected", appId: null }],
      org_b: [{ status: "connected", appId: "123" }],
    });
    datos.set(schema.telegramCredentials, { org_a: [{ status: "connected" }] });
    const a = await guideMultiempresa("org_a", db);
    const b = await guideMultiempresa("org_b", db);
    expect(a.steps[1]).toMatchObject({ href: "/settings/channels", done: false, hint: "Falta conectar WhatsApp." });
    expect(b.steps[1]).toMatchObject({ href: "/settings/channels", done: false, optional: true });
    expect(a.complete).toBe(false);
    expect(b.complete).toBe(true);
  });

  it("requiere horarios guardados en el calendario interno y no propone conectores externos", async () => {
    vi.stubEnv("AGENDA", "on");
    datos.set(schema.calendarSettings, {
      org_a: [{ connector: "enlace-fijo", weeklyHours: horarios }],
      org_b: [{ connector: "google", weeklyHours: horarios }],
    });
    const a = await guideMultiempresa("org_a", db);
    const b = await guideMultiempresa("org_b", db);
    expect(a.steps[1]).toMatchObject({ href: "/settings/calendar", done: true });
    expect(b.steps[1]).toMatchObject({
      href: "/settings/calendar", done: false, hint: expect.stringContaining("calendario interno"),
    });
  });
});
