import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { microsoftConnector } from "@/server/agenda/connectors/microsoft";
import { getMicrosoftCredentials } from "@/server/agenda/connectors/microsoft-credentials";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tenantId: z.string().trim().optional(),
  clientId: z.string().trim().optional(),
  clientSecret: z.string().trim().optional(),
  refreshToken: z.string().trim().optional(),
  calendarId: z.string().trim().optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const stored = await getMicrosoftCredentials(session.organizationId);
  const creds = {
    tenantId: body.data.tenantId || stored?.tenantId,
    clientId: body.data.clientId || stored?.clientId,
    clientSecret: body.data.clientSecret || stored?.clientSecret,
    refreshToken: body.data.refreshToken || stored?.refreshToken,
    calendarId: body.data.calendarId || stored?.calendarId || "primary",
    status: "connected" as const,
  };
  if (!creds.tenantId || !creds.clientId || !creds.clientSecret || !creds.refreshToken) {
    return apiError(422, "invalid_body", "Faltan credenciales que probar");
  }
  const check = await microsoftConnector.testConnection({
    ...creds,
    tenantId: creds.tenantId,
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
  });
  if (!check.ok) return apiError(422, "microsoft_invalid", check.error);
  return Response.json({ ok: true, detail: check.detail ?? null });
});
