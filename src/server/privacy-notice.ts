import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { DEFAULT_WEEKLY_HOURS } from "@/server/agenda/settings";

/** Datos que el responsable decide publicar en el aviso de su negocio. */
export const noticeDraftSchema = z.object({
  responsibleName: z.string().max(180),
  responsibleDocument: z.string().max(60),
  contactEmail: z.string().max(254),
  contactPhone: z.string().max(50),
  retention: z.string().max(500),
  policyUrl: z.string().max(2048),
});

export type NoticeDetails = z.infer<typeof noticeDraftSchema>;

export const EMPTY_NOTICE: NoticeDetails = {
  responsibleName: "",
  responsibleDocument: "",
  contactEmail: "",
  contactPhone: "",
  retention: "",
  policyUrl: "",
};

export class PrivacyNoticeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivacyNoticeError";
  }
}

function fromDb(value: unknown): NoticeDetails {
  const parsed = noticeDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_NOTICE;
}

export function normalizeNoticeDraft(input: NoticeDetails): NoticeDetails {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value.trim()])
  ) as NoticeDetails;
}

export function validateNoticeForPublication(input: NoticeDetails): NoticeDetails {
  const details = normalizeNoticeDraft(input);
  const missing = Object.values(details).some((value) => !value);
  if (missing) throw new PrivacyNoticeError("Completa los seis datos del aviso antes de publicarlo");
  if (!z.string().email().safeParse(details.contactEmail).success) {
    throw new PrivacyNoticeError("Escribe un correo válido para solicitudes de privacidad");
  }
  let url: URL;
  try { url = new URL(details.policyUrl); }
  catch { throw new PrivacyNoticeError("Escribe un enlace HTTPS válido a la política completa"); }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new PrivacyNoticeError("La política completa debe tener un enlace HTTPS sin credenciales");
  }
  return details;
}

export async function getPrivacyNotice(organizationId: string) {
  const [row] = await getDb().select().from(schema.privacyNotice)
    .where(scoped(schema.privacyNotice.organizationId, organizationId)).limit(1);
  return {
    draft: fromDb(row?.draft),
    published: row?.published ? fromDb(row.published) : null,
    publishedAt: row?.publishedAt ?? null,
  };
}

export async function savePrivacyNoticeDraft(organizationId: string, input: NoticeDetails) {
  const draft = normalizeNoticeDraft(input);
  await getDb().insert(schema.privacyNotice).values({ organizationId, draft })
    .onConflictDoUpdate({
      target: schema.privacyNotice.organizationId,
      set: { draft, updatedAt: new Date() },
    });
  return draft;
}

/** Publica una copia estable y registra la URL interna para la agenda. */
export async function publishPrivacyNotice(organizationId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ draft: schema.privacyNotice.draft })
      .from(schema.privacyNotice)
      .where(scoped(schema.privacyNotice.organizationId, organizationId))
      .for("update").limit(1);
    if (!row) throw new PrivacyNoticeError("Guarda primero el borrador del aviso");
    const published = validateNoticeForPublication(fromDb(row.draft));
    const url = new URL("/aviso-datos", getEnv().APP_BASE_URL).toString();
    const publishedAt = new Date();
    await tx.update(schema.privacyNotice)
      .set({ published, publishedAt, updatedAt: publishedAt })
      .where(scoped(schema.privacyNotice.organizationId, organizationId));
    await tx.insert(schema.calendarSettings).values({
      id: newId("calendarSettings"), organizationId,
      weeklyHours: DEFAULT_WEEKLY_HOURS,
      privacyNoticeUrl: url,
    }).onConflictDoUpdate({
      target: schema.calendarSettings.organizationId,
      set: { privacyNoticeUrl: url, updatedAt: publishedAt },
    });
    return { published, publishedAt, url };
  });
}
