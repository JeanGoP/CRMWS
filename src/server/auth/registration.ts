import { count } from "drizzle-orm";
import { multiempresaActiva, multiempresaProduccion } from "@/server/empresas/flag";
import { getDb, schema } from "@/lib/db";

/**
 * Registro público cerrado tras la primera organización (FR-060), salvo la
 * variable de escape ALLOW_SIGNUP=true. Las cuentas de equipo las crea el
 * propietario (bypass interno del gate).
 */
export async function isPublicSignupAllowed(): Promise<boolean> {
  if (multiempresaProduccion()) return false;
  if (!multiempresaActiva() && process.env.ALLOW_SIGNUP === "true") return true;
  const db = getDb();
  const rows = await db.select({ n: count() }).from(schema.organization);
  return (rows[0]?.n ?? 0) === 0;
}
