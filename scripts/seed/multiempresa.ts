/** Alta inicial de una instalación multiempresa nueva, antes de servir tráfico. */
import { createHash } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, getSql, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { sembrarEmpresa } from "@/server/auth/on-signup";
import { multiempresaProduccion } from "@/server/empresas/flag";

const OPERADOR = "hilora_multiempresa_admin";
const CREDENCIAL = "hilora_multiempresa_credencial";
const RECUPERAR = "--restablecer-clave";

function leerConfiguracion() {
  const destino = z.string().url().transform((valor) => new URL(valor)).safeParse(process.env.DATABASE_URL);
  const db = destino.success ? destino.data : null;
  if (!multiempresaProduccion() || process.env.MULTIEMPRESA_PILOTO === "on" ||
      db?.protocol !== "postgresql:" || db.hostname !== "hilora-db" || db.port !== "5432" ||
      db.username !== "hilora_multiempresa" || db.pathname !== "/hilora_multiempresa" || db.search || db.hash) {
    throw new Error("Destino de la instalación inicial incorrecto.");
  }
  return z.string().email().parse(process.env.MULTIEMPRESA_ADMIN_EMAIL?.trim().toLowerCase());
}

async function iniciar() {
  const correo = leerConfiguracion();
  const operacion = process.argv[2];
  if (operacion !== undefined && (operacion !== RECUPERAR || process.argv.length !== 3)) {
    throw new Error("Operación desconocida.");
  }
  if (operacion === RECUPERAR && !process.env.ENCRYPTION_KEY) {
    const origen = z.string().min(32).parse(process.env.HILORA_LLAVE_CIFRADO);
    process.env.ENCRYPTION_KEY = createHash("sha256").update(origen).digest("base64");
  }
  const db = getDb();
  try {
    if (operacion === RECUPERAR) {
      await restablecerClave(db, correo);
      return;
    }
    const cuentaCreada = await db.transaction(async (tx) => {
      // La misma cerradura que usa el registro inicial de la aplicación.
      await tx.execute(sql`select pg_advisory_xact_lock(874201)`);
      const [operador] = await tx.select({ email: schema.user.email }).from(schema.user)
        .where(eq(schema.user.id, OPERADOR)).limit(1);
      if (operador) {
        if (operador.email !== correo) throw new Error("El correo no coincide con la cuenta inicial.");
        return false;
      }

      const [organizacionExistente] = await tx.select({ id: schema.organization.id }).from(schema.organization).limit(1);
      const [usuarioExistente] = await tx.select({ id: schema.user.id }).from(schema.user).limit(1);
      if (organizacionExistente || usuarioExistente) throw new Error("La instalación inicial requiere una base vacía.");

      const clave = z.string().min(32).max(128).parse(process.env.HILORA_ADMIN_PASSWORD);
      const id = newId("organization");
      await tx.insert(schema.user).values({ id: OPERADOR, name: "Administrador de Hilora", email: correo });
      await tx.insert(schema.account).values({
        id: CREDENCIAL,
        accountId: OPERADOR,
        providerId: "credential",
        userId: OPERADOR,
        password: await hashPassword(clave),
      });
      await tx.insert(schema.organization).values({
        id,
        name: "Mi empresa",
        slug: "mi-empresa",
        metadata: JSON.stringify({ branding: { name: "Hilora", accent: "#0d5bff", currency: "COP", favicon: null } }),
      });
      await tx.insert(schema.member).values({
        id: newId("member"), organizationId: id, userId: OPERADOR, role: "owner",
      });
      await sembrarEmpresa(tx, id);
      await tx.update(schema.pipelineStage)
        .set({ name: "Reserva confirmada", position: 4 })
        .where(and(eq(schema.pipelineStage.organizationId, id), eq(schema.pipelineStage.kind, "won")));
      await tx.update(schema.pipelineStage)
        .set({ position: 5 })
        .where(and(eq(schema.pipelineStage.organizationId, id), eq(schema.pipelineStage.kind, "lost")));
      await tx.insert(schema.pipelineStage).values({
        id: newId("stage"), organizationId: id, name: "Pago por verificar", kind: "open", position: 3,
      });
      return true;
    });
    console.log(cuentaCreada
      ? "[hilora] Administrador y espacio inicial creados."
      : "[hilora] Instalación inicial ya aplicada.");
  } finally {
    await getSql().end();
  }
}

/** Se ejecuta solo por orden explícita en la consola administrada del contenedor. */
async function restablecerClave(db: ReturnType<typeof getDb>, correo: string) {
  const clave = z.string().min(8).max(128).safeParse(process.env.HILORA_ADMIN_PASSWORD);
  if (!clave.success) {
    console.error("[hilora] La contraseña guardada para recuperar el acceso debe tener entre 8 y 128 caracteres.");
    process.exitCode = 1;
    return;
  }
  const cambiada = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(874201)`);
    const [credencial] = await tx.select({ password: schema.account.password })
      .from(schema.account)
      .innerJoin(schema.user, eq(schema.account.userId, schema.user.id))
      .where(and(
        eq(schema.user.id, OPERADOR),
        eq(schema.user.email, correo),
        eq(schema.account.id, CREDENCIAL),
        eq(schema.account.accountId, OPERADOR),
        eq(schema.account.providerId, "credential")
      )).limit(1);
    if (!credencial?.password) throw new Error("No se encontró la credencial del administrador.");
    if (await verifyPassword({ hash: credencial.password, password: clave.data })) return false;
    const hash = await hashPassword(clave.data);
    if (!(await verifyPassword({ hash, password: clave.data }))) throw new Error("El hash no pudo verificarse.");
    const ahora = new Date();
    const [cuenta] = await tx.update(schema.account).set({ password: hash, updatedAt: ahora })
      .where(and(eq(schema.account.id, CREDENCIAL), eq(schema.account.password, credencial.password)))
      .returning({ id: schema.account.id });
    if (!cuenta) throw new Error("La credencial cambió durante el restablecimiento.");
    await tx.update(schema.session).set({ expiresAt: ahora, updatedAt: ahora })
      .where(and(eq(schema.session.userId, OPERADOR), gt(schema.session.expiresAt, ahora)));
    return true;
  });
  console.log(cambiada ? "[hilora] Contraseña del administrador actualizada." : "[hilora] La contraseña ya está aplicada.");
}

iniciar().catch(() => {
  const operacion = process.argv[2] === RECUPERAR ? "restablecer la contraseña" : "inicializar la instalación";
  console.error(`[hilora] No se pudo ${operacion}. Revisa el correo, las variables y la base dedicada.`);
  process.exitCode = 1;
});
