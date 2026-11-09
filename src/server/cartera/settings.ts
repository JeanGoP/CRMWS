import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

const short = z.string().trim().max(500);
const long = z.string().trim().max(4000);
const stage = z.object({
  enabled: z.boolean(),
  minBalance: z.number().finite().min(0).max(1_000_000_000_000),
  message: long,
});

/** Solo configuración; guardar un borrador nunca programa mensajes. */
export const carteraConfigSchema = z.object({
  queryIdentifier: z.string().trim().max(30),
  timezone: z.string().trim().min(1).max(100),
  channel: z.enum(["whatsapp", "telegram"]),
  allowedDays: z.array(z.number().int().min(1).max(7)).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  maxMessagesPerMonth: z.number().int().min(1).max(31),
  minDaysBetween: z.number().int().min(1).max(365),
  templateId: short,
  identityMode: z.enum(["human", "phone_and_document"]),
  tone: short,
  escalationInstructions: long,
  payment: z.object({
    beneficiary: short,
    bank: short,
    accountType: short,
    accountNumber: short,
    paymentUrl: z.string().trim().max(2048),
    referenceInstructions: long,
    otherInstructions: long,
  }),
  stages: z.object({
    upcoming: stage,
    days1to30: stage,
    days31to60: stage,
    days61to90: stage,
    days91plus: stage,
  }),
}).superRefine((v, ctx) => {
  if (v.endTime <= v.startTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "La hora final debe ser posterior a la inicial" });
  if (new Set(v.allowedDays).size !== v.allowedDays.length) ctx.addIssue({ code: "custom", path: ["allowedDays"], message: "No repitas días" });
  try { new Intl.DateTimeFormat("es", { timeZone: v.timezone }); }
  catch { ctx.addIssue({ code: "custom", path: ["timezone"], message: "Zona horaria inválida" }); }
  if (v.payment.paymentUrl) {
    try { if (new URL(v.payment.paymentUrl).protocol !== "https:") throw new Error(); }
    catch { ctx.addIssue({ code: "custom", path: ["payment", "paymentUrl"], message: "El enlace de pago debe ser HTTPS" }); }
  }
});

export type CarteraConfig = z.infer<typeof carteraConfigSchema>;
export const DEFAULT_CARTERA_CONFIG: CarteraConfig = {
  queryIdentifier: "", timezone: "America/Bogota", channel: "whatsapp",
  allowedDays: [1, 2, 3, 4, 5], startTime: "08:00", endTime: "18:00",
  maxMessagesPerMonth: 1, minDaysBetween: 7, templateId: "",
  identityMode: "human", tone: "Respetuoso, claro y breve",
  escalationInstructions: "Pasa a una persona si el cliente discute el saldo, indica que ya pagó o solicita un acuerdo.",
  payment: { beneficiary: "", bank: "", accountType: "", accountNumber: "", paymentUrl: "", referenceInstructions: "", otherInstructions: "" },
  stages: {
    upcoming: { enabled: false, minBalance: 0, message: "" },
    days1to30: { enabled: false, minBalance: 0, message: "" },
    days31to60: { enabled: false, minBalance: 0, message: "" },
    days61to90: { enabled: false, minBalance: 0, message: "" },
    days91plus: { enabled: false, minBalance: 0, message: "" },
  },
};

export const saveCarteraSchema = z.object({
  apiUrl: z.string().trim().max(2048),
  token: z.string().trim().max(500).optional(),
  clearToken: z.boolean().optional(),
  config: carteraConfigSchema,
});

export function validCarteraApiUrl(raw: string): boolean {
  if (!raw) return true;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.hash &&
      !url.search && !url.port && host !== "localhost" && !host.endsWith(".localhost") &&
      !host.endsWith(".local") && !/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(":");
  } catch { return false; }
}

export async function getCarteraSettings(organizationId: string) {
  const [row] = await getDb().select().from(schema.carteraSettings)
    .where(scoped(schema.carteraSettings.organizationId, organizationId)).limit(1);
  const parsed = carteraConfigSchema.safeParse(row?.config);
  return {
    apiUrl: row?.apiUrl ?? "",
    hasToken: Boolean(row?.tokenCipher && row.tokenIv && row.tokenTag),
    tokenLast4: row?.tokenCipher && row.tokenIv && row.tokenTag
      ? decryptSecret({ cipher: row.tokenCipher, iv: row.tokenIv, tag: row.tokenTag }).slice(-4) : null,
    config: parsed.success ? parsed.data : DEFAULT_CARTERA_CONFIG,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

export async function getCarteraConnection(organizationId: string) {
  const [row] = await getDb().select().from(schema.carteraSettings)
    .where(scoped(schema.carteraSettings.organizationId, organizationId)).limit(1);
  if (!row?.apiUrl || !row.tokenCipher || !row.tokenIv || !row.tokenTag) return null;
  return {
    apiUrl: row.apiUrl,
    token: decryptSecret({ cipher: row.tokenCipher, iv: row.tokenIv, tag: row.tokenTag }),
    config: carteraConfigSchema.parse(row.config),
  };
}

export async function saveCarteraSettings(organizationId: string, input: z.infer<typeof saveCarteraSchema>) {
  const db = getDb();
  const secret = input.token ? encryptSecret(input.token) : null;
  const changes = {
    apiUrl: input.apiUrl || null,
    config: input.config,
    updatedAt: new Date(),
    ...(input.clearToken ? { tokenCipher: null, tokenIv: null, tokenTag: null } : {}),
    ...(secret ? { tokenCipher: secret.cipher, tokenIv: secret.iv, tokenTag: secret.tag } : {}),
  };
  await db.insert(schema.carteraSettings).values({
    organizationId, ...changes,
  }).onConflictDoUpdate({ target: schema.carteraSettings.organizationId, set: changes });
  return getCarteraSettings(organizationId);
}
