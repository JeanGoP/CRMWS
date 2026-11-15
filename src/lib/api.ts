import { z } from "zod";
import { CABECERA_EMPRESA } from "@/lib/empresas-contexto";
import { multiempresaActiva } from "@/server/empresas/flag";
import { requireSession, UnauthorizedError, type SessionContext } from "@/lib/auth/session";

/** Respuesta de error estándar de la API interna (contrato api.md). */
export function apiError(
  status: number,
  code: string,
  message: string
): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Envuelve un route handler autenticado: resuelve la sesión (401 si no hay),
 * captura errores no controlados (500 sin stack) y deja pasar Response.
 */
export function withAuth<Args extends unknown[]>(
  handler: (session: SessionContext, ...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    let session: SessionContext;
    try {
      session = await requireSession();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return apiError(401, "unauthorized", "No autenticado");
      }
      throw err;
    }
    const request = args[0];
    if (multiempresaActiva() && request instanceof Request) {
      const empresaId = request.headers.get(CABECERA_EMPRESA);
      const lee = request.method === "GET" || request.method === "HEAD";
      if ((empresaId || !lee) && empresaId !== session.organizationId) {
        return apiError(409, "empresa_cambio", "La empresa activa cambió. Recarga la página");
      }
    }
    try {
      return await handler(session, ...args);
    } catch (err) {
      console.error("[api] error no controlado:", err);
      return apiError(500, "internal", "Error interno");
    }
  };
}

/** Parsea el body JSON con un esquema Zod; inválido → Response 422. */
export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: apiError(422, "invalid_body", "El body debe ser JSON válido"),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    return {
      ok: false,
      response: apiError(422, "invalid_body", detail),
    };
  }
  return { ok: true, data: parsed.data };
}
