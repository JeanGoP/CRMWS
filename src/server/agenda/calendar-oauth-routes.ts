import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { canConfigure } from "@/lib/auth/roles";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { googleConnector } from "@/server/agenda/connectors/google";
import { microsoftConnector } from "@/server/agenda/connectors/microsoft";
import { saveGoogleCredentials } from "@/server/agenda/connectors/google-credentials";
import { saveMicrosoftCredentials } from "@/server/agenda/connectors/microsoft-credentials";
import {
  authorizeUrl, exchangeOauthCode, makeOauthState, oauthConfig, oauthCookie,
  validOauthState, type CalendarProvider,
} from "@/server/agenda/calendar-oauth";

function resultUrl(status: string) {
  const url = new URL("/settings/calendar", getEnv().APP_BASE_URL);
  url.searchParams.set("calendar_oauth", status);
  return url;
}

export function startCalendarOauth(provider: CalendarProvider) {
  return withAuth(async (session) => {
    if (!agendaEnabled()) return agendaDisabledResponse();
    if (!canConfigure(session.role)) return new Response(null, { status: 403 });
    const config = oauthConfig(provider);
    if (!config) return NextResponse.redirect(resultUrl("not_configured"));
    const { nonce, state } = makeOauthState(session, provider);
    const response = NextResponse.redirect(authorizeUrl(provider, config.clientId, state));
    response.cookies.set(oauthCookie(provider), nonce, {
      httpOnly: true,
      secure: resultUrl("x").protocol === "https:",
      sameSite: "lax",
      maxAge: 600,
      path: `/api/settings/calendar-oauth/${provider}/callback`,
    });
    return response;
  });
}

export function finishCalendarOauth(provider: CalendarProvider) {
  return withAuth(async (session, req: NextRequest) => {
    if (!agendaEnabled()) return agendaDisabledResponse();
    if (!canConfigure(session.role)) return new Response(null, { status: 403 });
    const response = (status: string) => {
      const redirect = NextResponse.redirect(resultUrl(status));
      redirect.cookies.set(oauthCookie(provider), "", {
        maxAge: 0,
        path: `/api/settings/calendar-oauth/${provider}/callback`,
      });
      return redirect;
    };
    const url = new URL(req.url);
    if (!validOauthState(url.searchParams.get("state"), req.cookies.get(oauthCookie(provider))?.value, session, provider)) {
      return response("invalid_state");
    }
    if (url.searchParams.has("error")) return response("denied");
    const code = url.searchParams.get("code");
    const config = oauthConfig(provider);
    if (!code || !config) return response("not_configured");
    try {
      const refreshToken = await exchangeOauthCode(provider, code, config);
      if (provider === "google") {
        const creds = { ...config, refreshToken, calendarId: "primary", status: "connected" as const };
        const check = await googleConnector.testConnection(creds);
        if (!check.ok) return response("connection_failed");
        await saveGoogleCredentials({ ...config, refreshToken, calendarId: "primary", organizationId: session.organizationId });
      } else {
        const creds = { ...config, tenantId: config.tenantId || "organizations", refreshToken, calendarId: "primary", status: "connected" as const };
        const check = await microsoftConnector.testConnection(creds);
        if (!check.ok) return response("connection_failed");
        await saveMicrosoftCredentials({ ...creds, organizationId: session.organizationId });
      }
      return response(`${provider}_connected`);
    } catch {
      // Los errores del proveedor pueden contener secretos; el navegador solo ve un código fijo.
      return response("connection_failed");
    }
  });
}
