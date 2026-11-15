import { multiempresaProduccion } from "@/server/empresas/flag";
import { CatalogoClient } from "@/components/agent/catalogo-client";
import { AgentClient } from "@/components/agent/agent-client";

export const dynamic = "force-dynamic";

export default function AgentPage() {
  return multiempresaProduccion() ? <CatalogoClient /> : <AgentClient />;
}
