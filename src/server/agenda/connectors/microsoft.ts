import { createHash } from "node:crypto";
import { getEnv } from "@/lib/env";
import type { SlotUtc } from "@/lib/time/slots";
import {
  ConnectorError,
  type AgendaConnector,
  type MeetingRequest,
  type MeetingResult,
  type TestConnectionResult,
} from "./types";
import {
  getCachedMicrosoftToken,
  rotateMicrosoftRefreshToken,
  setCachedMicrosoftToken,
  type MicrosoftCreds,
} from "./microsoft-credentials";

/** Permisos delegados mínimos para leer ocupación y crear/mover/borrar eventos. */
export const MICROSOFT_SCOPES = "offline_access Calendars.ReadWrite";

function tokenKey(creds: MicrosoftCreds): string {
  return createHash("sha256")
    .update(JSON.stringify([creds.tenantId, creds.clientId, creds.clientSecret, creds.refreshToken]))
    .digest("hex");
}

async function accessToken(creds: MicrosoftCreds): Promise<string> {
  const key = tokenKey(creds);
  const cached = getCachedMicrosoftToken(key);
  if (cached) return cached;
  let res: Response;
  try {
    res = await fetch(`${getEnv().MICROSOFT_OAUTH_BASE_URL}/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: creds.refreshToken,
        grant_type: "refresh_token",
        scope: MICROSOFT_SCOPES,
      }),
    });
  } catch {
    throw new ConnectorError("microsoft", "No se pudo contactar a Microsoft");
  }
  if (!res.ok) {
    throw new ConnectorError("microsoft", "Microsoft rechazó la conexión del calendario. Vuelve a autorizar la cuenta.", {
      status: res.status,
      isAuthError: res.status === 400 || res.status === 401,
    });
  }
  const data = (await res.json().catch(() => null)) as {
    access_token?: string; expires_in?: number; refresh_token?: string;
  } | null;
  if (!data?.access_token) throw new ConnectorError("microsoft", "Microsoft no devolvió un token de acceso");
  if (data.refresh_token && data.refresh_token !== creds.refreshToken && creds.organizationId) {
    await rotateMicrosoftRefreshToken(creds.organizationId, data.refresh_token);
    const nextKey = tokenKey({ ...creds, refreshToken: data.refresh_token });
    setCachedMicrosoftToken(nextKey, data.access_token, data.expires_in ?? 3600);
  }
  setCachedMicrosoftToken(key, data.access_token, data.expires_in ?? 3600);
  return data.access_token;
}

async function graphFetch(
  creds: MicrosoftCreds,
  path: string,
  init: RequestInit & { allow404?: boolean } = {}
): Promise<unknown> {
  const token = await accessToken(creds);
  const base = getEnv().MICROSOFT_GRAPH_BASE_URL;
  // nextLink is absolute and untrusted input from Graph: keep it on the same API origin.
  const url = new URL(path.startsWith("http") ? path : `${base.replace(/\/$/, "")}${path}`);
  const api = new URL(base);
  if (url.origin !== api.origin || !url.pathname.startsWith(`${api.pathname.replace(/\/$/, "")}/`)) {
    throw new ConnectorError("microsoft", "Microsoft devolvió una página fuera de Graph");
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
        Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ConnectorError("microsoft", "No se pudo contactar a Microsoft Graph");
  }
  if (res.status === 404 && init.allow404) return null;
  if (res.status === 204) return null;
  if (!res.ok) {
    throw new ConnectorError("microsoft", `Microsoft Graph respondió ${res.status}`, { status: res.status });
  }
  return res.json().catch(() => null);
}

function calendarPath(creds: MicrosoftCreds): string {
  return creds.calendarId === "primary"
    ? "/me/calendar"
    : `/me/calendars/${encodeURIComponent(creds.calendarId)}`;
}

type GraphEvent = {
  id?: string;
  isCancelled?: boolean;
  showAs?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  onlineMeeting?: { joinUrl?: string };
};

/** El encabezado Prefer pide UTC; Graph suele devolver dateTime sin sufijo Z. */
function graphTime(value?: { dateTime?: string; timeZone?: string }): number {
  if (!value?.dateTime || (value.timeZone && value.timeZone !== "UTC")) return NaN;
  const raw = value.dateTime;
  return Date.parse(/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`);
}

export async function microsoftBusyIntervals(
  creds: MicrosoftCreds,
  fromUtc: Date,
  toUtc: Date,
  excludeEventId?: string
): Promise<SlotUtc[]> {
  const params = new URLSearchParams({
    startDateTime: fromUtc.toISOString(),
    endDateTime: toUtc.toISOString(),
    $top: "1000",
    $select: "id,isCancelled,showAs,start,end",
  });
  let page: string | null = `${calendarPath(creds)}/calendarView?${params}`;
  const busy: SlotUtc[] = [];
  let pages = 0;
  while (page) {
    if (++pages > 20) throw new ConnectorError("microsoft", "Demasiados eventos de Microsoft; no se puede comprobar disponibilidad");
    const data = (await graphFetch(creds, page)) as {
      value?: GraphEvent[]; "@odata.nextLink"?: string;
    } | null;
    if (!Array.isArray(data?.value)) throw new ConnectorError("microsoft", "Microsoft no devolvió la disponibilidad");
    for (const event of data.value) {
      if (event.id === excludeEventId || event.isCancelled || event.showAs === "free") continue;
      const start = graphTime(event.start);
      const end = graphTime(event.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        throw new ConnectorError("microsoft", "Microsoft devolvió un evento con horario desconocido; no se puede confirmar disponibilidad");
      }
      busy.push({ startUtc: new Date(start).toISOString(), endUtc: new Date(end).toISOString() });
    }
    page = data["@odata.nextLink"] ?? null;
  }
  return busy;
}

function joinUrl(event: GraphEvent | null): string | null {
  return event?.onlineMeeting?.joinUrl ?? null;
}

export const microsoftConnector: AgendaConnector<MicrosoftCreds> = {
  id: "microsoft",
  requiresCredentials: true,

  async createMeeting(creds, req: MeetingRequest): Promise<MeetingResult> {
    const end = new Date(Date.parse(req.startUtc) + req.durationMinutes * 60_000).toISOString();
    const created = (await graphFetch(creds, `${calendarPath(creds)}/events`, {
      method: "POST",
      body: JSON.stringify({
        // El calendario externo no necesita el nombre ni notas del paciente.
        subject: "Cita",
        start: { dateTime: req.startUtc.replace(/Z$/, ""), timeZone: "UTC" },
        end: { dateTime: end.replace(/Z$/, ""), timeZone: "UTC" },
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
        showAs: "busy",
      }),
    })) as GraphEvent | null;
    if (!created?.id) throw new ConnectorError("microsoft", "Microsoft no devolvió el evento creado");
    let link = joinUrl(created);
    // Teams puede generar el enlace tras crear el evento. Releer el mismo ID evita duplicados.
    for (let i = 0; i < 3 && !link; i++) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const refreshed = (await graphFetch(creds, `/me/events/${encodeURIComponent(created.id)}`).catch(() => null)) as GraphEvent | null;
      link = joinUrl(refreshed);
    }
    return { externalId: created.id, joinUrl: link };
  },

  async refreshMeeting(creds, externalId): Promise<MeetingResult> {
    const event = (await graphFetch(creds, `/me/events/${encodeURIComponent(externalId)}`)) as GraphEvent | null;
    return { externalId, joinUrl: joinUrl(event) };
  },

  async updateMeeting(creds, externalId, req): Promise<void> {
    const end = new Date(Date.parse(req.startUtc) + req.durationMinutes * 60_000).toISOString();
    await graphFetch(creds, `/me/events/${encodeURIComponent(externalId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        start: { dateTime: req.startUtc.replace(/Z$/, ""), timeZone: "UTC" },
        end: { dateTime: end.replace(/Z$/, ""), timeZone: "UTC" },
      }),
    });
  },

  async deleteMeeting(creds, externalId): Promise<void> {
    await graphFetch(creds, `/me/events/${encodeURIComponent(externalId)}`, {
      method: "DELETE", allow404: true,
    });
  },

  async testConnection(creds): Promise<TestConnectionResult> {
    try {
      const calendar = (await graphFetch(creds, `${calendarPath(creds)}?$select=name,allowedOnlineMeetingProviders`)) as {
        name?: string; allowedOnlineMeetingProviders?: string[];
      } | null;
      if (!calendar?.allowedOnlineMeetingProviders?.includes("teamsForBusiness")) {
        return { ok: false, error: "Esta cuenta o calendario no permite crear reuniones de Teams" };
      }
      return { ok: true, detail: calendar.name };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "No se pudo conectar con Microsoft" };
    }
  },
};
