import { withAuth } from "@/lib/api";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { oauthConfig } from "@/server/agenda/calendar-oauth";

export const GET = withAuth(async () => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  return Response.json({ google: Boolean(oauthConfig("google")), microsoft: Boolean(oauthConfig("microsoft")) });
});
