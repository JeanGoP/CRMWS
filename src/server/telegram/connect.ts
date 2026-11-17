import { randomBytes } from "node:crypto";
import { currentTelegramWebhook, registerTelegramWebhook, TelegramApiError, telegramWebhookUrl } from "./client";
import { conectarTelegramBotReservado, reservarTelegramBot, TelegramConnectionError } from "./credentials";

type BotDeEmpresa = { organizationId: string; botId: string; username: string; token: string };

export async function connectTelegramForCompany(input: BotDeEmpresa): Promise<void> {
  const destino = telegramWebhookUrl(input.botId);
  if (!destino.startsWith("https://")) throw new TelegramApiError(422);
  const confirmarDestino = async () => {
    const actual = await currentTelegramWebhook(input.token);
    if (actual && actual !== destino) throw new TelegramConnectionError("webhook_in_use");
  };

  // Evita reservar un bot que ya se sabe conectado fuera de esta instalación.
  await confirmarDestino();
  await reservarTelegramBot({ ...input, webhookSecret: randomBytes(32).toString("hex"), status: "reconnect_required" });
  await conectarTelegramBotReservado(input, async (secret) => {
    // Repite la comprobación mientras esta empresa y este bot están bloqueados.
    await confirmarDestino();
    await registerTelegramWebhook(input.token, input.botId, secret);
  });
}
