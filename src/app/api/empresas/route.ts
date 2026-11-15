import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { multiempresaActiva } from "@/server/empresas/flag";
import { crearEmpresa, empresasDeUsuario, esAdministradorDeEmpresas } from "@/server/empresas/servicio";

export const dynamic = "force-dynamic";

const crearSchema = z.object({ nombre: z.string().trim().min(2).max(100) });

export const GET = withAuth(async (session) => {
  if (!multiempresaActiva()) return new Response(null, { status: 404 });
  const [empresas, puedeCrear] = await Promise.all([
    empresasDeUsuario(session.userId),
    esAdministradorDeEmpresas(session.userId),
  ]);
  return Response.json({ empresaActivaId: session.organizationId, puedeCrear, empresas });
});

export const POST = withAuth(async (session, req: Request) => {
  if (!multiempresaActiva()) return new Response(null, { status: 404 });
  if (!(await esAdministradorDeEmpresas(session.userId))) {
    return apiError(403, "forbidden", "Solo el administrador de Hilora puede crear empresas");
  }
  const body = await parseBody(req, crearSchema);
  if (!body.ok) return body.response;
  const id = await crearEmpresa(session.userId, body.data.nombre);
  return Response.json({ id }, { status: 201 });
});
