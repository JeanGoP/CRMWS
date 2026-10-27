import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrivacyNoticeCard } from "@/components/settings/privacy-notice-card";

describe("formulario del aviso", () => {
  it("pide los seis datos y separa guardar de publicar", () => {
    const html = renderToStaticMarkup(createElement(PrivacyNoticeCard, {
      currentUrl: null, onPublished: () => {},
    }));
    for (const label of ["Nombre completo o razón social", "NIT o documento", "Correo para solicitudes de privacidad",
      "Teléfono de contacto", "Plazo o criterio de conservación", "Enlace HTTPS a la política completa"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Guardar borrador");
    expect(html).toContain("Publicar aviso");
    expect(html).toContain("autorizo publicar estos datos");
  });
});
