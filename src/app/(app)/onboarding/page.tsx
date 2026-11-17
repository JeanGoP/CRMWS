import { redirect } from "next/navigation";
import { OnboardingClient } from "@/components/onboarding/onboarding-client";
import { getSessionOrNull } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { guideStatus } from "@/server/onboarding/guide";
import { guideMultiempresa } from "@/server/onboarding/guide-multiempresa";
import { launchChecklist } from "@/server/onboarding/launch-checklist";
import { multiempresaActiva, multiempresaProduccion } from "@/server/empresas/flag";

export const dynamic = "force-dynamic";

/**
 * La guía se resuelve en el servidor en cada visita: el dueño va a Agente o
 * a WhatsApp, vuelve por el menú y ve su avance sin recargar nada a mano.
 */
export default async function OnboardingPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!canConfigure(session.role)) redirect("/inbox");
  if (multiempresaProduccion()) {
    const guide = await guideMultiempresa(session.organizationId);
    return <OnboardingClient guide={guide} checks={[]} agentName={null} manual />;
  }
  if (multiempresaActiva()) redirect("/empresas");

  const [guide, checks, [profile]] = await Promise.all([
    guideStatus(session.organizationId),
    launchChecklist(session.organizationId),
    getDb()
      .select({ name: schema.agentProfile.name })
      .from(schema.agentProfile)
      .where(scoped(schema.agentProfile.organizationId, session.organizationId))
      .limit(1),
  ]);
  return (
    <OnboardingClient guide={guide} checks={checks} agentName={profile?.name?.trim() || null} />
  );
}
