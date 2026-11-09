const ON_VALUES = new Set(["on", "1", "true", "si", "sí", "yes"]);

/** Conector opcional: una instancia común no consulta ninguna cartera. */
export function carteraEnabled(): boolean {
  return ON_VALUES.has((process.env.CARTERA ?? "").trim().toLowerCase());
}

export function carteraDisabledResponse(): Response {
  return new Response(null, { status: 404 });
}
