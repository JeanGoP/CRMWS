import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { testConnection } from "@/server/whatsapp/connect";
import { canConfigure } from "@/lib/auth/roles";
import { multiempresaActiva, multiempresaCanales } from "@/server/empresas/flag";
import {
  conexionWhatsappMultiempresaSchema,
  respuestaErrorWhatsapp,
  verificarConexionWhatsapp,
} from "@/server/whatsapp/connect-multiempresa";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  phoneNumberId: z.string().trim().min(1),
  token: z.string().trim().min(1),
});

/** Prueba de conexión: valida token↔número, NO guarda (FR-040). */
export const POST = withAuth(async (session, req: Request) => {
  if (multiempresaActiva()) {
    if (!multiempresaCanales()) return new Response(null, { status: 404 });
    if (!canConfigure(session.role)) {
      return apiError(403, "forbidden", "Solo quien administra la empresa puede configurar WhatsApp.");
    }
    const body = await parseBody(req, conexionWhatsappMultiempresaSchema);
    if (!body.ok) return body.response;
    try {
      return Response.json({ ok: true, ...await verificarConexionWhatsapp(body.data) });
    } catch (err) {
      return respuestaErrorWhatsapp(err);
    }
  }
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const check = await testConnection(body.data.phoneNumberId, body.data.token);
  if (!check.ok) {
    const status = check.code === "meta_unavailable" ? 503 : 422;
    return apiError(status, check.code, check.message);
  }
  return Response.json({
    ok: true,
    displayPhoneNumber: check.displayPhoneNumber,
    verifiedName: check.verifiedName,
  });
});
