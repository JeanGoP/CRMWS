import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { sembrarEmpresa } from "@/server/auth/on-signup";
import { multiempresaActiva } from "./flag";

export async function esAdministradorDeEmpresas(userId: string): Promise<boolean> {
  const email = process.env.MULTIEMPRESA_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !multiempresaActiva()) return false;
  const [cuenta] = await getDb().select({ email: schema.user.email }).from(schema.user)
    .where(eq(schema.user.id, userId)).limit(1);
  return cuenta?.email.toLowerCase() === email;
}

export async function empresasDeUsuario(userId: string) {
  return getDb().select({
    id: schema.organization.id,
    nombre: schema.organization.name,
    rol: schema.member.role,
  }).from(schema.member)
    .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
    .where(eq(schema.member.userId, userId))
    .orderBy(asc(schema.organization.name), asc(schema.organization.id));
}

export async function crearEmpresa(userId: string, nombre: string): Promise<string> {
  const id = newId("organization");
  await getDb().transaction(async (tx) => {
    await tx.insert(schema.organization).values({ id, name: nombre, slug: id });
    await tx.insert(schema.member).values({
      id: newId("member"), userId, organizationId: id, role: "owner",
    });
    await sembrarEmpresa(tx, id);
  });
  return id;
}

export async function agregarCuentaExistente(empresaId: string, email: string): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [cuenta] = await tx.select({ id: schema.user.id }).from(schema.user)
      .where(eq(schema.user.email, email)).limit(1);
    if (!cuenta) return false;
    // Serializa altas repetidas para esta membresía, sin cambiar el esquema legado.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${empresaId}), hashtext(${cuenta.id}))`);
    const [membresia] = await tx.select({ id: schema.member.id }).from(schema.member)
      .where(and(eq(schema.member.organizationId, empresaId), eq(schema.member.userId, cuenta.id))).limit(1);
    if (!membresia) {
      await tx.insert(schema.member).values({
        id: newId("member"), organizationId: empresaId, userId: cuenta.id, role: "member",
      });
    }
    return true;
  });
}
