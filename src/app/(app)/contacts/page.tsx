import { ContactsClient } from "@/components/contacts/contacts-client";
import { multiempresaActiva } from "@/server/empresas/flag";

export const dynamic = "force-dynamic";

export default function ContactsPage() {
  return <ContactsClient permiteIniciarConversacion={!multiempresaActiva()} />;
}
