import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import {
  getPrivacyNotice,
  noticeDraftSchema,
  PrivacyNoticeError,
  publishPrivacyNotice,
  savePrivacyNoticeDraft,
} from "@/server/privacy-notice";

export const dynamic = "force-dynamic";

function allowed(role: string) {
  return canConfigure(role)
    ? null
    : apiError(403, "forbidden", "Solo el propietario o un administrador puede configurar el aviso");
}

export const GET = withAuth(async (session) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const denied = allowed(session.role);
  if (denied) return denied;
  return Response.json(await getPrivacyNotice(session.organizationId));
});

export const PUT = withAuth(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const denied = allowed(session.role);
  if (denied) return denied;
  const body = await parseBody(req, noticeDraftSchema);
  if (!body.ok) return body.response;
  const draft = await savePrivacyNoticeDraft(session.organizationId, body.data);
  return Response.json({ draft });
});

export const POST = withAuth(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const denied = allowed(session.role);
  if (denied) return denied;
  const body = await parseBody(req, z.object({ confirmed: z.literal(true) }));
  if (!body.ok) return body.response;
  try {
    return Response.json(await publishPrivacyNotice(session.organizationId));
  } catch (err) {
    if (err instanceof PrivacyNoticeError) return apiError(422, "invalid_body", err.message);
    throw err;
  }
});
