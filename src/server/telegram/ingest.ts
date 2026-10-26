import { isChannelActiveForOrg } from "@/server/channels/preference";
import { telegramCredentialsForBot } from "@/server/telegram/credentials";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { z } from "zod";

export const telegramUpdateSchema = z.object({
  message: z.object({
    message_id: z.number().int().positive(),
    date: z.number().int().nonnegative().optional(),
    text: z.string().max(4096).optional(),
    caption: z.string().max(4096).optional(),
    chat: z.object({ id: z.number().int(), type: z.string() }),
    from: z.object({
      id: z.number().int(), is_bot: z.boolean().optional(),
      first_name: z.string().max(256).optional(),
      last_name: z.string().max(256).optional(),
      username: z.string().max(256).optional(),
    }).optional(),
  }).optional(),
});
type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

/** Un chat privado por contacto; grupos y mensajes de bots no entran al CRM. */
export function normalizeTelegramUpdate(botId: string, update: TelegramUpdate) {
  const msg = update.message;
  if (!msg || msg.chat?.type !== "private" || !msg.chat.id || !msg.from?.id || msg.from.is_bot || !msg.message_id) return null;
  const text = msg.text ?? msg.caption;
  if (!text) return null;
  const chatId = String(msg.chat.id);
  const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ").trim()
    || (msg.from.username ? `@${msg.from.username}` : null);
  return { chatId, name, text, messageId: `tg_${botId}_${chatId}_${msg.message_id}`,
    timestamp: String(msg.date ?? Math.floor(Date.now() / 1000)) };
}

export async function processTelegramUpdate(payload: unknown): Promise<void> {
  if (!payload || typeof payload !== "object") return;
  const { botId, update } = payload as { botId?: string; update?: unknown };
  if (!botId) return;
  const parsed = telegramUpdateSchema.safeParse(update);
  if (!parsed.success) return;
  const creds = await telegramCredentialsForBot(botId);
  if (!creds || !(await isChannelActiveForOrg("telegram", creds.organizationId))) return;
  const msg = normalizeTelegramUpdate(botId, parsed.data);
  if (!msg) return;
  await ingestInboundMessage({
    organizationId: creds.organizationId,
    identity: { identity: `tg:${botId}:${msg.chatId}`, channel: "telegram", phone: null, waUserId: null, profileName: msg.name },
    waMessageId: msg.messageId, type: "text", text: msg.text,
    timestamp: msg.timestamp, threadRef: msg.chatId,
  });
}
