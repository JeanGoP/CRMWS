import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { resolveMembership } from "@/server/auth/on-signup";
import { multiempresaActiva } from "@/server/empresas/flag";

const cambiarSchema = z.object({ empresaId: z.string().min(1).max(100) });

export const POST = withAuth(async (session, req: Request) => {
  if (!multiempresaActiva()) return new Response(null, { status: 404 });
  const body = await parseBody(req, cambiarSchema);
  if (!body.ok) return body.response;
  const { empresaId } = body.data;
  const auth = await getAuth().api.getSession({ headers: req.headers });
  if (!auth || auth.user.id !== session.userId) {
    return apiError(401, "unauthorized", "No autenticado");
  }
  if (!(await resolveMembership(session.userId, empresaId))) {
    return apiError(403, "forbidden", "No tienes acceso a esa empresa");
  }
  const active = auth.session.activeOrganizationId;
  if (active && active !== session.organizationId) {
    return apiError(409, "empresa_cambio", "La empresa activa cambió. Recarga la página");
  }
  const [actualizada] = await getDb().update(schema.session)
    .set({ activeOrganizationId: empresaId, updatedAt: new Date() })
    .where(and(
      eq(schema.session.id, auth.session.id),
      eq(schema.session.userId, session.userId),
      gt(schema.session.expiresAt, new Date()),
      active ? eq(schema.session.activeOrganizationId, active) : isNull(schema.session.activeOrganizationId)
    ))
    .returning({ id: schema.session.id });

  return actualizada
    ? new Response(null, { status: 204 })
    : apiError(409, "empresa_cambio", "La sesión cambió. Recarga la página");
});
