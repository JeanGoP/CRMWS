import { DEFAULT_CONNECTOR } from "@/lib/agenda-connectors";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { agendaEnabled } from "@/server/agenda/flag";
import { channelPreferenceFor } from "@/server/channels/preference";
import { multiempresaCanales } from "@/server/empresas/flag";
import { hasWeeklyHours } from "./calendar-verifiers";
import type { Guide, GuideStep } from "./guide";

type Db = ReturnType<typeof getDb>;

/** La guía de la empresa activa se calcula con datos guardados, sin sondas externas. */
export async function guideMultiempresa(organizationId: string, db: Db = getDb()): Promise<Guide> {
  const [[profile], [knowledge], channels, calendar] = await Promise.all([
    db.select({ name: schema.agentProfile.name, instructions: schema.agentProfile.instructions })
      .from(schema.agentProfile)
      .where(scoped(schema.agentProfile.organizationId, organizationId)).limit(1),
    db.select({ id: schema.kbEntry.id }).from(schema.kbEntry)
      .where(scoped(schema.kbEntry.organizationId, organizationId)).limit(1),
    multiempresaCanales() ? pasoCanales(organizationId, db) : null,
    agendaEnabled() ? pasoAgendaInterna(organizationId, db) : null,
  ]);

  const steps: GuideStep[] = [{
    key: "agent",
    title: "Prepara el perfil del agente",
    description: "Dale un nombre y escribe instrucciones o agrega información del negocio.",
    done: Boolean(profile?.name.trim() && (profile.instructions?.trim() || knowledge)),
    href: "/agent",
    cta: "Abrir Agente",
    hint: "Guarda instrucciones o una entrada de conocimiento.",
  }];
  if (channels) steps.push(channels);
  if (calendar) steps.push(calendar);
  return { steps, complete: steps.every((step) => step.done || step.optional), enabled: false, brainConnected: false };
}

async function pasoCanales(organizationId: string, db: Db): Promise<GuideStep> {
  const preference = await channelPreferenceFor(organizationId);
  const base = {
    key: "whatsapp" as const,
    title: "Configura tus canales",
    description: "Elige por qué canales quieres recibir conversaciones en la Bandeja.",
    href: "/settings/channels",
    cta: "Revisar canales",
  };
  if (!preference.whatsapp && !preference.telegram) {
    return { ...base, optional: true, done: false, hint: null };
  }

  const [whatsapp, telegram] = await Promise.all([
    preference.whatsapp
      ? db.select({ status: schema.metaCredentials.status, appId: schema.metaCredentials.appId })
          .from(schema.metaCredentials)
          .where(scoped(schema.metaCredentials.organizationId, organizationId)).limit(1)
      : [],
    preference.telegram
      ? db.select({ status: schema.telegramCredentials.status }).from(schema.telegramCredentials)
          .where(scoped(schema.telegramCredentials.organizationId, organizationId)).limit(1)
      : [],
  ]);
  const wa = whatsapp[0];
  const faltan: string[] = [];
  if (preference.whatsapp && (wa?.status !== "connected" || !wa.appId)) faltan.push("WhatsApp");
  if (preference.telegram && telegram[0]?.status !== "connected") faltan.push("Telegram");
  return { ...base, done: faltan.length === 0, hint: faltan.length ? `Falta conectar ${faltan.join(" y ")}.` : null };
}

async function pasoAgendaInterna(organizationId: string, db: Db): Promise<GuideStep> {
  const [settings] = await db.select({
    connector: schema.calendarSettings.connector,
    weeklyHours: schema.calendarSettings.weeklyHours,
  }).from(schema.calendarSettings)
    .where(scoped(schema.calendarSettings.organizationId, organizationId)).limit(1);
  const done = settings?.connector === DEFAULT_CONNECTOR && hasWeeklyHours(settings.weeklyHours);
  return {
    key: "calendar",
    title: "Configura la agenda interna",
    description: "Guarda tus horarios para que el equipo pueda registrar citas y bloquear espacios.",
    done,
    href: "/settings/calendar",
    cta: "Configurar agenda",
    hint: done ? null : "Confirma el calendario interno y guarda al menos un horario de atención.",
  };
}
