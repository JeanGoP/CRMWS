import { notFound } from "next/navigation";
import { CatalogoClient } from "@/components/agent/catalogo-client";
import { multiempresaProduccion } from "@/server/empresas/flag";

export const dynamic = "force-dynamic";

export default function CatalogoPage() {
  if (!multiempresaProduccion()) notFound();
  return <CatalogoClient />;
}
