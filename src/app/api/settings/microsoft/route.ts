import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { microsoftConnector } from "@/server/agenda/connectors/microsoft";
import {
  deleteMicrosoftCredentials,
  getMicrosoftCredentials,
  saveMicrosoftCredentials,
} from "@/server/agenda/connectors/microsoft-credentials";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tenantId: z.string().trim().min(1),
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  refreshToken: z.string().trim().min(1),
  calendarId: z.string().trim().optional(),
});

export const GET = withAuth(async (session) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const creds = await getMicrosoftCredentials(session.organizationId);
  return Response.json({ connection: creds ? {
    status: creds.status,
    secretLast4: creds.clientSecret.slice(-4),
    fields: { tenantId: creds.tenantId, clientId: creds.clientId, calendarId: creds.calendarId },
  } : null });
});

export const PUT = withAuth(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const creds = {
    ...body.data,
    calendarId: body.data.calendarId || "primary",
    status: "connected" as const,
  };
  const check = await microsoftConnector.testConnection(creds);
  if (!check.ok) return apiError(422, "microsoft_invalid", check.error);
  await saveMicrosoftCredentials({ ...creds, organizationId: session.organizationId });
  return Response.json({ connection: {
    status: "connected",
    secretLast4: creds.clientSecret.slice(-4),
    fields: { tenantId: creds.tenantId, clientId: creds.clientId, calendarId: creds.calendarId },
  } });
});

export const DELETE = withAuth(async (session) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  await deleteMicrosoftCredentials(session.organizationId);
  return Response.json({ ok: true });
});
