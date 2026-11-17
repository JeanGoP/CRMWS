import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CABECERA_EMPRESA } from "@/lib/empresas-contexto";
import { middleware } from "@/middleware";

const origin = "https://hilora.example.test";

describe.each(["MULTIEMPRESA_PILOTO", "MULTIEMPRESA_PRODUCCION"])("Ajustes con %s", (mode) => {
  beforeEach(() => {
    vi.stubEnv("MULTIEMPRESA_PILOTO", undefined);
    vi.stubEnv("MULTIEMPRESA_PRODUCCION", undefined);
    vi.stubEnv("MULTIEMPRESA_CANALES", undefined);
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

  it("la Guía de inicio está disponible en producción tras validar sesión y rol", () => {
    const response = middleware(new NextRequest(`${origin}/onboarding`));
    if (mode === "MULTIEMPRESA_PRODUCCION") {
      expect(response.headers.get("x-middleware-next")).toBe("1");
    } else {
      expect(response.headers.get("location")).toBe(`${origin}/empresas`);
    }
  });

  it("delega el cambio de contraseña a Better Auth sin exigir una empresa", () => {
    const url = `${origin}/api/auth/change-password`;
    expect(middleware(new NextRequest(url, { method: "POST" })).headers.get("x-middleware-next")).toBe("1");
    expect(middleware(new NextRequest(url)).status).toBe(404);
    expect(middleware(new NextRequest(`${origin}/api/auth/reset-password`, { method: "POST" })).status).toBe(404);
  });
});

describe("Canales en producción multiempresa", () => {
  beforeEach(() => {
    vi.stubEnv("MULTIEMPRESA_PILOTO", undefined);
    vi.stubEnv("MULTIEMPRESA_PRODUCCION", "on");
    vi.stubEnv("MULTIEMPRESA_CANALES", "on");
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(["channels", "whatsapp", "telegram", "templates"])("deja abrir %s con sesión", (page) => {
    const response = middleware(new NextRequest(`${origin}/settings/${page}`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    "/api/settings/whatsapp",
    "/api/settings/telegram",
    "/api/settings/channel-preference",
  ])("exige el contexto de empresa para cambiar %s", (path) => {
    expect(middleware(new NextRequest(`${origin}${path}`, { method: "PUT" })).status).toBe(409);
    const response = middleware(new NextRequest(`${origin}${path}`, {
      method: "PUT",
      headers: { [CABECERA_EMPRESA]: "empresa-a" },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["wa/seguridad-del-numero", "telegram/12345"])("delega la autenticación de %s en su handler", (path) => {
    const request = new NextRequest(`${origin}/api/webhooks/${path}`, { method: "POST" });
    expect(middleware(request).headers.get("x-middleware-next")).toBe("1");
    vi.stubEnv("MULTIEMPRESA_PRODUCCION", undefined);
    vi.stubEnv("MULTIEMPRESA_PILOTO", "on");
    expect(middleware(request).status).toBe(404);
  });

  it.each([
    "/api/settings/channels",
    "/api/webhooks/ig/no-configurado",
    "/api/bot/messages",
    "/api/contacts/contacto-a/start-conversation",
  ])("mantiene bloqueado POST %s", (path) => {
    const response = middleware(new NextRequest(`${origin}${path}`, {
      method: "POST",
      headers: { [CABECERA_EMPRESA]: "empresa-a" },
    }));
    expect(response.status).toBe(404);
  });

  it("permite responder en la bandeja solo con empresa explícita", () => {
    const url = `${origin}/api/conversations/conversacion-a/messages`;
    expect(middleware(new NextRequest(url, { method: "POST" })).status).toBe(409);
    expect(middleware(new NextRequest(url, {
      method: "POST",
      headers: { [CABECERA_EMPRESA]: "empresa-a" },
    })).headers.get("x-middleware-next")).toBe("1");
  });

  it("deja gestionar el perfil con su empresa y bloquea los endpoints operativos", () => {
    const profile = `${origin}/api/agent/profile`;
    const headers = { [CABECERA_EMPRESA]: "empresa-a" };
    expect(middleware(new NextRequest(profile)).headers.get("x-middleware-next")).toBe("1");
    expect(middleware(new NextRequest(profile, { method: "PUT" })).status).toBe(409);
    expect(middleware(new NextRequest(profile, { method: "PUT", headers }))
      .headers.get("x-middleware-next")).toBe("1");
    expect(middleware(new NextRequest(`${profile}/preset`, { method: "POST", headers }))
      .headers.get("x-middleware-next")).toBe("1");
    expect(middleware(new NextRequest(`${profile}/preset`)).status).toBe(404);
    expect(middleware(new NextRequest(`${origin}/api/agent/brain-status`)).status).toBe(404);
    expect(middleware(new NextRequest(`${origin}/api/bot/profile`)).status).toBe(404);
  });
});
