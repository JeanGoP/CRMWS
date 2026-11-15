import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { middleware } from "@/middleware";

const origin = "https://hilora.example.test";

describe.each(["MULTIEMPRESA_PILOTO", "MULTIEMPRESA_PRODUCCION"])("Ajustes con %s", (mode) => {
  beforeEach(() => {
    vi.stubEnv("MULTIEMPRESA_PILOTO", undefined);
    vi.stubEnv("MULTIEMPRESA_PRODUCCION", undefined);
    vi.stubEnv(mode, "on");
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(["branding", "calendar", "team"])("deja que la página /settings/%s valide la sesión", (page) => {
    const response = middleware(new NextRequest(`${origin}/settings/${page}`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirige los ajustes de canales fuera del modo manual", () => {
    const response = middleware(new NextRequest(`${origin}/settings/whatsapp`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/settings`);
  });

  it("mantiene bloqueado el aviso público sin contexto de empresa", () => {
    const response = middleware(new NextRequest(`${origin}/aviso-datos`));
    expect(response.status).toBe(404);
  });
});
