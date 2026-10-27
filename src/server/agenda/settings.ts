import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { eq } from "drizzle-orm";
import { countVariables } from "@/lib/templates";
import { channelPreferenceFor } from "@/server/channels/preference";
import {
  DEFAULT_CONNECTOR,
  isConnectorId,
  type ConnectorId,
} from "@/lib/agenda-connectors";
import {
  isValidInterval,
  isValidTimeZone,
  WEEKDAYS,
  type Interval,
  type WeekdayKey,
} from "@/lib/time/slots";

/**
 * 015 — La configuración de la agenda del negocio (una por organización):
 * lectura con defaults y upsert normalizado.
 */

export type WeeklyHours = Partial<Record<WeekdayKey, Interval[]>>;

export const DEFAULT_TIMEZONE = "America/Mexico_City";

/** L-V 09:00-18:00 — se ajusta en Ajustes → Agenda. */
export const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  mon: [{ start: "09:00", end: "18:00" }],
  tue: [{ start: "09:00", end: "18:00" }],
  wed: [{ start: "09:00", end: "18:00" }],
  thu: [{ start: "09:00", end: "18:00" }],
  fri: [{ start: "09:00", end: "18:00" }],
};

export type CalendarSettings = {
  weeklyHours: WeeklyHours;
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  timezone: string;
  /** Cómo se entrega la reunión. */
  connector: ConnectorId;
  /** Sala fija del conector `enlace-fijo`; null ⇒ citas sin link. */
  meetingLink: string | null;
  privacyNoticeUrl: string | null;
  reminderEnabled: boolean;
  reminderTemplateId: string | null;
};

/** Lo que ve una instancia recién encendida: útil sin configurar nada. */
export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  weeklyHours: DEFAULT_WEEKLY_HOURS,
  slotMinutes: 30,
  bufferMinutes: 0,
  minNoticeHours: 2,
  maxDaysAhead: 7,
  timezone: DEFAULT_TIMEZONE,
  connector: DEFAULT_CONNECTOR,
  meetingLink: null,
  privacyNoticeUrl: null,
  reminderEnabled: false,
  reminderTemplateId: null,
};

export const LIMITS = {
  slotMinutes: { min: 10, max: 240 },
  bufferMinutes: { min: 0, max: 120 },
  minNoticeHours: { min: 0, max: 72 },
  maxDaysAhead: { min: 1, max: 60 },
} as const;

export async function getSettings(
  organizationId: string
): Promise<CalendarSettings> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.calendarSettings)
    .where(scoped(schema.calendarSettings.organizationId, organizationId))
    .limit(1);

  const row = rows[0];
  // Sin fila: la instancia recién encendida ya es usable.
  if (!row) return DEFAULT_CALENDAR_SETTINGS;

  return {
    weeklyHours: normalizeWeeklyHours(row.weeklyHours as WeeklyHours),
    slotMinutes: row.slotMinutes,
    bufferMinutes: row.bufferMinutes,
    minNoticeHours: row.minNoticeHours,
    maxDaysAhead: row.maxDaysAhead,
    timezone: row.timezone,
    // Un conector que ya no existe en el código (p. ej. venías de un fork) no
    // puede dejar la agenda inservible: se degrada al soberano.
    connector: isConnectorId(row.connector) ? row.connector : DEFAULT_CONNECTOR,
    meetingLink: row.meetingLink,
    privacyNoticeUrl: row.privacyNoticeUrl,
    reminderEnabled: row.reminderEnabled,
    reminderTemplateId: row.reminderTemplateId,
  };
}

export class CalendarSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarSettingsError";
  }
}

/** Telegram no espera a Meta; WhatsApp sí requiere plantilla. */
export function mustValidateReminderTemplate(
  channels: { whatsapp: boolean; telegram: boolean },
  templateId: string | null
): boolean {
  return channels.whatsapp && (Boolean(templateId) || !channels.telegram);
}

/**
 * Lo que llega de fuera, antes de normalizar: el horario y el conector vienen
 * sueltos porque su validación vive AQUÍ. Si el tipo estricto se exigiera en la
 * ruta, cada llamador tendría que hacer un cast — y un cast es justamente la
 * comprobación que no ocurre.
 */
export type CalendarSettingsInput = Partial<
  Omit<CalendarSettings, "weeklyHours" | "connector">
> & {
  weeklyHours?: unknown;
  connector?: string;
};

export async function upsertSettings(
  organizationId: string,
  input: CalendarSettingsInput
): Promise<CalendarSettings> {
  const current = await getSettings(organizationId);

  const timezone = input.timezone ?? current.timezone;
  // Una zona desconocida rompería el motor entero: se rechaza al guardar.
  if (!isValidTimeZone(timezone)) {
    throw new CalendarSettingsError(`Zona horaria desconocida: ${timezone}`);
  }

  const connector = input.connector ?? current.connector;
  if (!isConnectorId(connector)) {
    throw new CalendarSettingsError(`Conector desconocido: ${connector}`);
  }

  const next: CalendarSettings = {
    weeklyHours: normalizeWeeklyHours(
      input.weeklyHours !== undefined ? input.weeklyHours : current.weeklyHours
    ),
    slotMinutes: clampInt(
      input.slotMinutes ?? current.slotMinutes,
      LIMITS.slotMinutes.min,
      LIMITS.slotMinutes.max
    ),
    bufferMinutes: clampInt(
      input.bufferMinutes ?? current.bufferMinutes,
      LIMITS.bufferMinutes.min,
      LIMITS.bufferMinutes.max
    ),
    minNoticeHours: clampInt(
      input.minNoticeHours ?? current.minNoticeHours,
      LIMITS.minNoticeHours.min,
      LIMITS.minNoticeHours.max
    ),
    maxDaysAhead: clampInt(
      input.maxDaysAhead ?? current.maxDaysAhead,
      LIMITS.maxDaysAhead.min,
      LIMITS.maxDaysAhead.max
    ),
    timezone,
    connector,
    meetingLink: normalizeLink(
      input.meetingLink !== undefined ? input.meetingLink : current.meetingLink
    ),
    privacyNoticeUrl: normalizeLink(
      input.privacyNoticeUrl !== undefined ? input.privacyNoticeUrl : current.privacyNoticeUrl
    ),
    reminderEnabled: input.reminderEnabled ?? current.reminderEnabled,
    reminderTemplateId: normalizeLink(
      input.reminderTemplateId !== undefined ? input.reminderTemplateId : current.reminderTemplateId
    ),
  };
  if (next.privacyNoticeUrl && !/^https:\/\/[^\s]+$/i.test(next.privacyNoticeUrl)) {
    throw new CalendarSettingsError("El aviso de datos debe tener una dirección HTTPS válida");
  }
  if (next.reminderEnabled) {
    if (!next.privacyNoticeUrl) {
      throw new CalendarSettingsError("Agrega el enlace al aviso de tratamiento de datos antes de activar recordatorios");
    }
    const channels = await channelPreferenceFor(organizationId);
    // Con ambos canales, Telegram puede avisar mientras Meta revisa la
    // plantilla. WhatsApp empezará a avisar cuando se seleccione una aprobada.
    if (mustValidateReminderTemplate(channels, next.reminderTemplateId)) {
      const [template] = next.reminderTemplateId
        ? await getDb().select({ status: schema.template.status, body: schema.template.body, category: schema.template.category })
            .from(schema.template)
            .where(scoped(schema.template.organizationId, organizationId, eq(schema.template.id, next.reminderTemplateId)))
            .limit(1)
        : [undefined];
      if (!template || template.status !== "approved" || template.category !== "UTILITY" || countVariables(template.body) !== 3) {
        throw new CalendarSettingsError("Selecciona una plantilla de utilidad aprobada con {{1}} nombre, {{2}} fecha y {{3}} hora");
      }
    }
  }

  const db = getDb();
  const values = {
    weeklyHours: next.weeklyHours,
    slotMinutes: next.slotMinutes,
    bufferMinutes: next.bufferMinutes,
    minNoticeHours: next.minNoticeHours,
    maxDaysAhead: next.maxDaysAhead,
    timezone: next.timezone,
    connector: next.connector,
    meetingLink: next.meetingLink,
    privacyNoticeUrl: next.privacyNoticeUrl,
    reminderEnabled: next.reminderEnabled,
    reminderTemplateId: next.reminderTemplateId,
  };
  await db
    .insert(schema.calendarSettings)
    .values({
      id: newId("calendarSettings"),
      organizationId,
      ...values,
    })
    .onConflictDoUpdate({
      target: schema.calendarSettings.organizationId,
      set: { ...values, updatedAt: new Date() },
    });

  return next;
}

/**
 * Descarta intervalos inválidos y días vacíos (día cerrado) y ordena por hora
 * de inicio. Se prefiere limpiar a rechazar: un día mal escrito no debe tumbar
 * el guardado completo del horario.
 */
export function normalizeWeeklyHours(input: unknown): WeeklyHours {
  const out: WeeklyHours = {};
  if (typeof input !== "object" || input === null) return out;
  const source = input as Record<string, unknown>;
  for (const day of WEEKDAYS) {
    const intervals = source[day];
    if (!Array.isArray(intervals)) continue;
    const valid = intervals
      .filter(isValidInterval)
      .sort((a, b) => a.start.localeCompare(b.start));
    if (valid.length > 0) out[day] = valid;
  }
  return out;
}

/** Cadena vacía o espacios ⇒ null (el campo es opcional de verdad). */
function normalizeLink(link: string | null | undefined): string | null {
  const trimmed = (link ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
