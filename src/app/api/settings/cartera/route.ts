import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { carteraDisabledResponse, carteraEnabled } from "@/server/cartera/flag";
import { getCarteraSettings, saveCarteraSchema, saveCarteraSettings, validCarteraApiUrl } from "@/server/cartera/settings";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  if (!carteraEnabled()) return carteraDisabledResponse();
  if (!canConfigure(session.role)) return apiError(403, "forbidden", "Solo el propietario o un administrador puede configurar cartera");
  return Response.json(await getCarteraSettings(session.organizationId));
});

export const PUT = withAuth(async (session, req: Request) => {
  if (!carteraEnabled()) return carteraDisabledResponse();
  if (!canConfigure(session.role)) return apiError(403, "forbidden", "Solo el propietario o un administrador puede configurar cartera");
  const body = await parseBody(req, saveCarteraSchema);
  if (!body.ok) return body.response;
  if (!validCarteraApiUrl(body.data.apiUrl)) {
    return apiError(422, "invalid_body", "La URL de la API debe ser HTTPS, pública y sin token ni parámetros");
  }
  if (body.data.token && body.data.clearToken) {
    return apiError(422, "invalid_body", "No puedes guardar y borrar el token a la vez");
  }
  return Response.json(await saveCarteraSettings(session.organizationId, body.data));
});
