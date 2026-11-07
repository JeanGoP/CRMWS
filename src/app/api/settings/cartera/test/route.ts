import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { queryCartera } from "@/server/cartera/adapter";
import { carteraDisabledResponse, carteraEnabled } from "@/server/cartera/flag";
import { getCarteraConnection, validCarteraApiUrl } from "@/server/cartera/settings";

export const dynamic = "force-dynamic";
const testSchema = z.object({
  identification: z.string().trim().regex(/^\d{4,20}$/),
  cutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = withAuth(async (session, req: Request) => {
  if (!carteraEnabled()) return carteraDisabledResponse();
  if (!canConfigure(session.role)) return apiError(403, "forbidden", "Solo el propietario o un administrador puede probar cartera");
  const body = await parseBody(req, testSchema);
  if (!body.ok) return body.response;
  const connection = await getCarteraConnection(session.organizationId);
  if (!connection || !validCarteraApiUrl(connection.apiUrl)) {
    return apiError(409, "not_configured", "Guarda la URL y el token de cartera primero");
  }
  try {
    return Response.json(await queryCartera({
      apiUrl: connection.apiUrl, token: connection.token,
      identification: body.data.identification, cutDate: body.data.cutDate,
    }));
  } catch {
    // Nunca propagar el cuerpo del proveedor: puede incluir datos financieros.
    return apiError(502, "provider_error", "La consulta falló. Revisa la URL, el token y los datos de prueba");
  }
});
