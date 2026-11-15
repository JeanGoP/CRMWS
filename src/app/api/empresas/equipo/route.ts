import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { multiempresaActiva } from "@/server/empresas/flag";
import { agregarCuentaExistente, esAdministradorDeEmpresas } from "@/server/empresas/servicio";

const cuentaSchema = z.object({ email: z.string().trim().email().toLowerCase() });

export const POST = withAuth(async (session, req: Request) => {
  if (!multiempresaActiva()) return new Response(null, { status: 404 });
  if (session.role !== "owner" || !(await esAdministradorDeEmpresas(session.userId))) {
    return apiError(403, "forbidden", "No puedes asignar cuentas a esta empresa");
  }
  const body = await parseBody(req, cuentaSchema);
  if (!body.ok) return body.response;
  if (!(await agregarCuentaExistente(session.organizationId, body.data.email))) {
    return apiError(404, "not_found", "La cuenta no existe");
  }
  return Response.json({ ok: true }, { status: 201 });
});
