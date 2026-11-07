import { z } from "zod";

/** El nombre de la ruta del proveedor conserva su grafía original. */
const amount = z.coerce.number().finite();
const rowSchema = z.object({
  iden: z.string().or(z.number()).transform(String),
  numfactura: z.string().or(z.number()).transform(String),
  vencimiento_cuota: z.string(),
  dias: z.coerce.number().int().min(0),
  PorVencer: amount, Treinta_Dias: amount, sesenta_Dias: amount,
  noventa_Dias: amount, Mas_de_Noventa: amount,
});
const responseSchema = z.object({
  Error: z.boolean(),
  Resultado: z.array(rowSchema),
});

export type CarteraSummary = {
  records: number;
  customers: number;
  invoices: number;
  openBalance: number;
  overdueBalance: number;
  overdueRecords: number;
};

/** Solo devuelve agregados: ninguna identificación o teléfono sale hacia el navegador. */
export function summarizeCartera(payload: unknown): CarteraSummary {
  const parsed = responseSchema.parse(payload);
  if (parsed.Error) throw new Error("La API de cartera informó un error");
  const customers = new Set<string>();
  const invoices = new Set<string>();
  let openBalance = 0;
  let overdueBalance = 0;
  let overdueRecords = 0;
  for (const row of parsed.Resultado) {
    const balance = row.PorVencer + row.Treinta_Dias + row.sesenta_Dias + row.noventa_Dias + row.Mas_de_Noventa;
    if (balance <= 0) continue;
    customers.add(row.iden);
    invoices.add(`${row.iden}\0${row.numfactura}`);
    openBalance += balance;
    if (row.dias > 0) { overdueBalance += balance; overdueRecords++; }
  }
  return { records: parsed.Resultado.length, customers: customers.size,
    invoices: invoices.size, openBalance, overdueBalance, overdueRecords };
}

export async function queryCartera(input: {
  apiUrl: string; token: string; identification: string; cutDate: string;
  fetcher?: typeof fetch;
}): Promise<CarteraSummary> {
  const url = new URL(input.apiUrl);
  url.searchParams.set("token", input.token);
  const response = await (input.fetcher ?? fetch)(url, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ Identificacion: input.identification, Fecha: input.cutDate }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`La API de cartera respondió ${response.status}`);
  const size = Number(response.headers.get("content-length") ?? 0);
  if (size > 20_000_000) throw new Error("La respuesta de cartera es demasiado grande");
  const raw = await response.text();
  if (raw.length > 20_000_000) throw new Error("La respuesta de cartera es demasiado grande");
  return summarizeCartera(JSON.parse(raw) as unknown);
}
