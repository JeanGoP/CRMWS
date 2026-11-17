import { TeamClient } from "@/components/settings/team-client";
import { getSessionOrNull } from "@/lib/auth/session";
import { multiempresaActiva } from "@/server/empresas/flag";
import { esAdministradorDeEmpresas } from "@/server/empresas/servicio";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const session = multiempresaActiva() ? await getSessionOrNull() : null;
  const puedeAgregarCuenta =
    session?.role === "owner" && await esAdministradorDeEmpresas(session.userId);

  return <TeamClient puedeAgregarCuenta={puedeAgregarCuenta} />;
}
