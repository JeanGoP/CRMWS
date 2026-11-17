import { redirect } from "next/navigation";
import { multiempresaActiva } from "@/server/empresas/flag";

export default function SettingsPage() {
  redirect(multiempresaActiva() ? "/settings/branding" : "/settings/whatsapp");
}
