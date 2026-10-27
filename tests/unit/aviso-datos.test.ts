import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AvisoDatosPage, { metadata } from "@/app/aviso-datos/page";

describe("borrador público del aviso", () => {
  it("deja visibles los datos pendientes y no se presenta como aviso aprobado", () => {
    const html = renderToStaticMarkup(AvisoDatosPage());
    expect(html).toContain("Borrador pendiente de aprobación");
    expect(html).toContain("[Nombre completo o razón social");
    expect(html).toContain("[correo de privacidad]");
    expect(html).toContain("datos sensibles");
    expect(html).toContain("no debe enviarse a pacientes");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
