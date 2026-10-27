import { and, eq, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { partsInTz } from "@/lib/time/slots";
import { sendText } from "@/server/inbox/send";
import { sendTemplate } from "@/server/whatsapp/templates";
import { agendaEnabled } from "./flag";

/** Una sola pasada en cada proceso. La reserva en Postgres evita duplicados entre réplicas. */
let running = false;
let started = false;

export function reminderWindow(now: Date): { earliest: Date; latest: Date } {
  return {
    earliest: new Date(now.getTime() + 23 * 3_600_000),
    latest: new Date(now.getTime() + 24 * 3_600_000),
  };
}

export function reminderText(name: string, date: string, time: string): string {
  return `Hola ${name}, te recordamos tu cita del ${date} a las ${time}. Si necesitas cambiarla, responde a este mensaje.`;
}

export async function sendDueReminders(now = new Date()): Promise<void> {
  if (!agendaEnabled() || running) return;
  running = true;
  try {
    const db = getDb();
    // Se intenta durante la primera hora de la ventana de 24 h. Nunca se
    // envían de golpe recordatorios atrasados al encender la función.
    const { earliest, latest } = reminderWindow(now);
    const due = await db.select({
      id: schema.booking.id,
      organizationId: schema.booking.organizationId,
      scheduledAt: schema.booking.scheduledAt,
      conversationId: schema.booking.conversationId,
      timezone: schema.calendarSettings.timezone,
      templateId: schema.calendarSettings.reminderTemplateId,
    }).from(schema.booking).innerJoin(schema.calendarSettings,
      and(eq(schema.booking.organizationId, schema.calendarSettings.organizationId),
        eq(schema.calendarSettings.reminderEnabled, true)))
      .innerJoin(schema.conversation,
        and(eq(schema.booking.conversationId, schema.conversation.id),
          eq(schema.booking.organizationId, schema.conversation.organizationId)))
      .where(and(eq(schema.booking.kind, "session"), eq(schema.booking.status, "agendada"),
        eq(schema.booking.isTest, false), isNotNull(schema.booking.conversationId),
        isNull(schema.booking.reminderAttemptedAt),
        // Sin plantilla aprobada de Meta, las citas de WhatsApp esperan; no
        // consumen un intento ni impiden que se procese Telegram.
        or(eq(schema.conversation.channel, "telegram"),
          and(eq(schema.conversation.channel, "whatsapp"), isNotNull(schema.calendarSettings.reminderTemplateId))),
        gte(schema.booking.scheduledAt, earliest), lte(schema.booking.scheduledAt, latest)))
      .limit(100);

    for (const item of due) {
      const [claimed] = await db.update(schema.booking)
        .set({ reminderAttemptedAt: now, reminderError: null })
        .where(scoped(schema.booking.organizationId, item.organizationId,
          eq(schema.booking.id, item.id), eq(schema.booking.status, "agendada"),
          eq(schema.booking.scheduledAt, item.scheduledAt), isNull(schema.booking.reminderAttemptedAt)))
        .returning({ id: schema.booking.id });
      if (!claimed || !item.conversationId) continue;

      try {
        const [current] = await db.select({ status: schema.booking.status, scheduledAt: schema.booking.scheduledAt })
          .from(schema.booking)
          .where(scoped(schema.booking.organizationId, item.organizationId, eq(schema.booking.id, item.id)))
          .limit(1);
        if (!current || current.status !== "agendada" || current.scheduledAt.getTime() !== item.scheduledAt.getTime()) {
          continue;
        }
        const [recipient] = await db.select({
          channel: schema.conversation.channel,
          name: schema.contact.name,
        }).from(schema.conversation)
          .innerJoin(schema.contact, eq(schema.conversation.contactId, schema.contact.id))
          .where(scoped(schema.conversation.organizationId, item.organizationId,
            eq(schema.conversation.id, item.conversationId))).limit(1);
        if (!recipient || (recipient.channel !== "whatsapp" && recipient.channel !== "telegram")) {
          throw new Error("La cita no tiene una conversación compatible");
        }
        const { date, time } = partsInTz(item.scheduledAt.toISOString(), item.timezone);
        if (recipient.channel === "whatsapp") {
          if (!item.templateId) throw new Error("Falta la plantilla aprobada de WhatsApp");
          await sendTemplate({ organizationId: item.organizationId, conversationId: item.conversationId,
            templateId: item.templateId, variables: [recipient.name, date, time] });
        } else {
          await sendText({ organizationId: item.organizationId, conversationId: item.conversationId,
            text: reminderText(recipient.name, date, time) });
        }
        await db.update(schema.booking).set({ reminderSentAt: new Date(), reminderError: null })
          .where(scoped(schema.booking.organizationId, item.organizationId,
            eq(schema.booking.id, item.id), eq(schema.booking.reminderAttemptedAt, now)));
      } catch (error) {
        const detail = error instanceof Error ? error.name : "Error";
        const message = "No se pudo enviar. Revisa la conexión del canal y la plantilla.";
        await db.update(schema.booking).set({ reminderError: message })
          .where(scoped(schema.booking.organizationId, item.organizationId,
            eq(schema.booking.id, item.id), eq(schema.booking.reminderAttemptedAt, now)));
        console.warn(`[agenda] recordatorio ${item.id}: ${detail}`);
      }
    }
  } finally {
    running = false;
  }
}

export function startReminderWorker(): void {
  if (!agendaEnabled() || started) return;
  started = true;
  const timer = setInterval(() => {
    void sendDueReminders().catch((error) => console.error("[agenda] barrido de recordatorios falló:", error));
  }, 60_000);
  timer.unref();
  void sendDueReminders().catch((error) => console.error("[agenda] primer barrido de recordatorios falló:", error));
}
