import { getEnv } from "@/lib/env";

/** Toda llamada a Telegram pasa por este adaptador; nunca se registra la URL con token. */
export class TelegramApiError extends Error {
  constructor(public readonly status: number) {
    super("Telegram rechazó la solicitud");
  }
}

async function telegramRequest<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TelegramApiError(503);
  }
  if (!response.ok) throw new TelegramApiError(response.status);
  const data = await response.json().catch(() => null) as { ok?: boolean; result?: T } | null;
  if (!data?.ok || data.result === undefined) throw new TelegramApiError(502);
  return data.result;
}

export function telegramWebhookUrl(botId: string): string {
  return new URL(`/api/webhooks/telegram/${encodeURIComponent(botId)}`, getEnv().APP_BASE_URL).toString();
}

export function verifyTelegramBot(token: string) {
  return telegramRequest<{ id: number; username: string; is_bot: boolean }>(token, "getMe");
}

export async function registerTelegramWebhook(token: string, botId: string, secret: string): Promise<void> {
  const url = telegramWebhookUrl(botId);
  if (!url.startsWith("https://")) throw new TelegramApiError(422);
  const registered = await telegramRequest<boolean>(token, "setWebhook", {
    url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: false,
  });
  if (!registered) throw new TelegramApiError(502);
}

export async function removeTelegramWebhook(token: string): Promise<void> {
  await telegramRequest<boolean>(token, "deleteWebhook", { drop_pending_updates: false });
}

export async function sendTelegramText(token: string, chatId: string, text: string): Promise<string> {
  const result = await telegramRequest<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId, text,
  });
  return String(result.message_id);
}
