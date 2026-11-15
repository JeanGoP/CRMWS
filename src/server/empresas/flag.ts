type EntornoMultiempresa = Record<string, unknown>;

export function multiempresaProduccion(env: EntornoMultiempresa = process.env): boolean {
  return env.MULTIEMPRESA_PRODUCCION === "on";
}

export function multiempresaActiva(env: EntornoMultiempresa = process.env): boolean {
  return multiempresaProduccion(env) || env.MULTIEMPRESA_PILOTO === "on";
}

export function multiempresaCanales(env: EntornoMultiempresa = process.env): boolean {
  return multiempresaProduccion(env) && env.MULTIEMPRESA_CANALES === "on";
}
