import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AvisoDatosPage, { metadata } from "@/app/aviso-datos/page";
import { getPrivacyNotice, validateNoticeForPublication } from "@/server/privacy-notice";
import { getSessionOrNull } from "@/lib/auth/session";

vi.mock("@/server/branding", () => ({
  getBrandingContext: vi.fn().mockResolvedValue({ organizationId: "org_1" }),
}));
vi.mock("@/server/privacy-notice", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/privacy-notice")>();
  return { ...original, getPrivacyNotice: vi.fn() };
});
vi.mock("@/lib/auth/session", () => ({ getSessionOrNull: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ canConfigure: vi.fn(() => true) }));

const draft = {
  responsibleName: "Consultorio Ejemplo", responsibleDocument: "123456",
  contactEmail: "datos@ejemplo.co", contactPhone: "3000000000",
  retention: "el plazo indicado en la política", policyUrl: "https://ejemplo.co/politica",
};

describe("borrador público del aviso", () => {
  beforeEach(() => {
    vi.mocked(getPrivacyNotice).mockResolvedValue({ draft, published: null, publishedAt: null });
    vi.mocked(getSessionOrNull).mockResolvedValue(null);
  });

  it("no publica el borrador guardado mientras no se apruebe", async () => {
    const html = renderToStaticMarkup(await AvisoDatosPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Borrador pendiente de aprobación");
    expect(html).toContain("[Nombre completo o razón social");
    expect(html).not.toContain("Consultorio Ejemplo");
    expect(html).toContain("datos sensibles");
    expect(html).toContain("no debe enviarse a pacientes");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("muestra la vista privada solo con sesión autorizada", async () => {
    vi.mocked(getSessionOrNull).mockResolvedValue({ organizationId: "org_1", role: "owner" } as never);
    const html = renderToStaticMarkup(await AvisoDatosPage({ searchParams: Promise.resolve({ vista: "borrador" }) }));
    expect(html).toContain("Vista previa privada");
    expect(html).toContain("Consultorio Ejemplo");
  });

  it("no revela datos con vista=borrador sin sesión", async () => {
    const html = renderToStaticMarkup(await AvisoDatosPage({ searchParams: Promise.resolve({ vista: "borrador" }) }));
    expect(html).not.toContain("Consultorio Ejemplo");
    expect(html).toContain("Borrador pendiente de aprobación");
  });

  it("publica la copia aprobada y valida los seis campos", async () => {
    vi.mocked(getPrivacyNotice).mockResolvedValue({ draft, published: draft, publishedAt: new Date() });
    const html = renderToStaticMarkup(await AvisoDatosPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Consultorio Ejemplo");
    expect(html).not.toContain("Borrador pendiente");
    expect(validateNoticeForPublication(draft)).toEqual(draft);
    expect(() => validateNoticeForPublication({ ...draft, policyUrl: "http://ejemplo.co" })).toThrow(/HTTPS/);
    expect(() => validateNoticeForPublication({ ...draft, contactEmail: "" })).toThrow(/seis datos/);
  });
});
