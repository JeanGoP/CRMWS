import { WhatsappWizard } from "@/components/settings/whatsapp-wizard";
import { multiempresaCanales } from "@/server/empresas/flag";

export const dynamic = "force-dynamic";

export default function WhatsappSettingsPage() {
  return <WhatsappWizard multiempresa={multiempresaCanales()} />;
}
