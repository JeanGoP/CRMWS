export function multiempresaActiva(): boolean {
  return process.env.MULTIEMPRESA_PILOTO === "on";
}
