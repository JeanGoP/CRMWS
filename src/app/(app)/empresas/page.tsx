import { notFound } from "next/navigation";
import { EmpresasClient } from "@/components/empresas-client";
import { multiempresaActiva } from "@/server/empresas/flag";

export const dynamic = "force-dynamic";

export default function EmpresasPage() {
  if (!multiempresaActiva()) notFound();
  return <EmpresasClient />;
}
