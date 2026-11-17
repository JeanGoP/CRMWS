const AJUSTES_DEL_PILOTO = new Set([
  "/settings/team",
  "/settings/branding",
  "/settings/quick-replies",
  "/settings/calendar",
  "/settings/cartera",
]);

const AJUSTES_DE_CANALES = new Set([
  "/settings/channels",
  "/settings/whatsapp",
  "/settings/telegram",
  "/settings/templates",
]);

export function ajusteMultiempresaDisponible(path: string, canales: boolean): boolean {
  return AJUSTES_DEL_PILOTO.has(path) || (canales && AJUSTES_DE_CANALES.has(path));
}
