import { notFound } from "next/navigation";
import { CarteraClient } from "@/components/settings/cartera-client";
import { carteraEnabled } from "@/server/cartera/flag";

export const dynamic = "force-dynamic";

export default function CarteraSettingsPage() {
  if (!carteraEnabled()) notFound();
  return <CarteraClient />;
}
