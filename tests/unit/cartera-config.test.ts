import { describe, expect, it, vi } from "vitest";
import { queryCartera, summarizeCartera } from "@/server/cartera/adapter";
import { DEFAULT_CARTERA_CONFIG, carteraConfigSchema, validCarteraApiUrl } from "@/server/cartera/settings";

const rows = [
  { iden: "cliente-a", numfactura: "F1", vencimiento_cuota: "2026-03-01", dias: 15,
    PorVencer: 0, Treinta_Dias: 100, sesenta_Dias: 0, noventa_Dias: 0, Mas_de_Noventa: 0,
    celular: "dato privado" },
  { iden: "cliente-a", numfactura: "F1", vencimiento_cuota: "2026-04-01", dias: 0,
    PorVencer: 50, Treinta_Dias: 0, sesenta_Dias: 0, noventa_Dias: 0, Mas_de_Noventa: 0 },
  { iden: "cliente-b", numfactura: "F2", vencimiento_cuota: "2026-01-01", dias: 75,
    PorVencer: 0, Treinta_Dias: 0, sesenta_Dias: 0, noventa_Dias: 25, Mas_de_Noventa: 0 },
];

describe("conector de cartera", () => {
  it("resume cuotas sin exponer la identidad ni el teléfono", () => {
    const result = summarizeCartera({ Error: false, Resultado: rows });
    expect(result).toEqual({ records: 3, customers: 2, invoices: 2,
      openBalance: 175, overdueBalance: 125, overdueRecords: 2 });
    expect(JSON.stringify(result)).not.toContain("cliente-a");
    expect(JSON.stringify(result)).not.toContain("dato privado");
  });

  it("envía el contrato exacto de consulta y rechaza un error del proveedor", async () => {
    const fetcher = vi.fn(async (_url: URL, _init: RequestInit) =>
      new Response(JSON.stringify({ Error: false, Resultado: rows }), { status: 200 }));
    await queryCartera({ apiUrl: "https://ejemplo.com/api/ObtenerCarteraFianncieraIden",
      token: "secreto", identification: "123456", cutDate: "2026-03-16", fetcher: fetcher as typeof fetch });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url.searchParams.get("token")).toBe("secreto");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"Identificacion":"123456","Fecha":"2026-03-16"}');
    expect(() => summarizeCartera({ Error: true, Resultado: [] })).toThrow();
  });

  it("bloquea URL internas y valida las reglas antes de guardar", () => {
    expect(validCarteraApiUrl("https://www.sintesiserp.com/ApiGestionCarteERP/api/ObtenerCarteraFianncieraIden")).toBe(true);
    expect(validCarteraApiUrl("https://localhost:44383/api/CrearComprobante")).toBe(false);
    expect(validCarteraApiUrl("https://example.com/api?token=secreto")).toBe(false);
    expect(carteraConfigSchema.safeParse(DEFAULT_CARTERA_CONFIG).success).toBe(true);
    expect(carteraConfigSchema.safeParse({ ...DEFAULT_CARTERA_CONFIG, startTime: "19:00", endTime: "08:00" }).success).toBe(false);
  });
});
