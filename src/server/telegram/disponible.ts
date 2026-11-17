import { isChannelEnabled } from "@/server/channels/enabled";
import { multiempresaActiva, multiempresaCanales } from "@/server/empresas/flag";

export function telegramDisponible(): boolean {
  return (!multiempresaActiva() || multiempresaCanales()) && isChannelEnabled("telegram");
}
