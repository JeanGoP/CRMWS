import { redirect } from "next/navigation";
import { canConfigure } from "@/lib/auth/roles";
import { getSessionOrNull } from "@/lib/auth/session";
import { multiempresaProduccion } from "@/server/empresas/flag";
import { AgentClient } from "@/components/agent/agent-client";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const soloConfiguracion = multiempresaProduccion();
  if (soloConfiguracion) {
    const session = await getSessionOrNull();
    if (!session) redirect("/login");
    if (!canConfigure(session.role)) redirect("/catalogo");
  }
  return <AgentClient soloConfiguracion={soloConfiguracion} />;
}
