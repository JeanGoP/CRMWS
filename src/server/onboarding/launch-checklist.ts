import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { agendaEnabled } from "@/server/agenda/flag";
import { getSettings } from "@/server/agenda/settings";

/** Revisión adicional del negocio; no bloquea la bandeja ni el agente. */
export type LaunchCheck = {
  key: "privacy" | "reminder" | "lab";
  title: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
};

export function launchChecklistFrom(input: {
  agenda: boolean;
  privacyNoticeUrl: string | null;
  reminderEnabled: boolean;
  labTested: boolean;
}): LaunchCheck[] {
  const checks: LaunchCheck[] = [];
  if (input.agenda) {
    checks.push({
      key: "privacy",
      title: "Aviso de tratamiento de datos",
      description: input.privacyNoticeUrl
        ? "El enlace aprobado está guardado en Agenda. Revisa con tu equipo cuándo se entrega al cliente."
        : "Completa los datos del responsable en Agenda y publica el aviso cuando esté revisado.",
      done: Boolean(input.privacyNoticeUrl),
      href: "/settings/calendar",
      cta: input.privacyNoticeUrl ? "Abrir Agenda" : "Completar aviso",
    });
    checks.push({
      key: "reminder",
      title: "Recordatorio de citas",
      description: input.reminderEnabled
        ? "Está activo el aviso de 24 horas. Telegram usa texto; WhatsApp necesita una plantilla aprobada."
        : "El aviso de 24 horas sigue apagado. Configúralo cuando el aviso de datos esté listo.",
      done: input.reminderEnabled,
      href: "/settings/calendar",
      cta: "Configurar recordatorios",
    });
  }
  checks.push({
    key: "lab",
    title: "Prueba del agente",
    description: input.labTested
      ? "Ya existe una prueba completada en el Laboratorio."
      : "Prueba una conversación completa antes de usar el agente con nuevos clientes.",
    done: input.labTested,
    href: "/lab",
    cta: "Abrir Laboratorio",
  });
  return checks;
}

export async function launchChecklist(organizationId: string): Promise<LaunchCheck[]> {
  const agenda = agendaEnabled();
  const [settings, [test]] = await Promise.all([
    agenda ? getSettings(organizationId) : Promise.resolve(null),
    getDb().select({ id: schema.agentTestRun.id }).from(schema.agentTestRun)
      .where(scoped(schema.agentTestRun.organizationId, organizationId,
        eq(schema.agentTestRun.status, "done"))).limit(1),
  ]);
  return launchChecklistFrom({
    agenda,
    privacyNoticeUrl: settings?.privacyNoticeUrl ?? null,
    reminderEnabled: settings?.reminderEnabled ?? false,
    labTested: Boolean(test),
  });
}
