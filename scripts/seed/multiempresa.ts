/** Alta inicial de una instalación multiempresa nueva, antes de servir tráfico. */
import { hashPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, getSql, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { sembrarEmpresa } from "@/server/auth/on-signup";
import { multiempresaProduccion } from "@/server/empresas/flag";

const OPERADOR = "hilora_multiempresa_admin";

function leerConfiguracion() {
  const destino = z.string().url().transform((valor) => new URL(valor)).safeParse(process.env.DATABASE_URL);
  const db = destino.success ? destino.data : null;
  if (!multiempresaProduccion() || process.env.MULTIEMPRESA_PILOTO === "on" ||
      db?.protocol !== "postgresql:" || db.hostname !== "hilora-db" || db.port !== "5432" ||
      db.username !== "hilora_multiempresa" || db.pathname !== "/hilora_multiempresa" || db.search || db.hash) {
    throw new Error("Destino de la instalación inicial incorrecto.");
  }
  const correo = z.string().email().parse(process.env.MULTIEMPRESA_ADMIN_EMAIL?.trim().toLowerCase());
  const clave = z.string().min(32).max(128).parse(process.env.HILORA_ADMIN_PASSWORD);
  return { correo, clave };
}

async function iniciar() {
  const { correo, clave } = leerConfiguracion();
  const db = getDb();
  try {
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

      const id = newId("organization");
      await tx.insert(schema.user).values({ id: OPERADOR, name: "Administrador de Hilora", email: correo });
      await tx.insert(schema.account).values({
        id: "hilora_multiempresa_credencial",
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

iniciar().catch(() => {
  console.error("[hilora] No se pudo inicializar la instalación. Revisa el correo, las variables y la base dedicada.");
  process.exitCode = 1;
});
