import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ actual: vi.fn(), registrar: vi.fn(), reservar: vi.fn(), conectar: vi.fn() }));
vi.mock("@/server/telegram/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/telegram/client")>(),
  telegramWebhookUrl: () => "https://crm.example/api/webhooks/telegram/123",
  currentTelegramWebhook: h.actual,
  registerTelegramWebhook: h.registrar,
}));
vi.mock("@/server/telegram/credentials", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/telegram/credentials")>(),
  reservarTelegramBot: h.reservar,
  conectarTelegramBotReservado: h.conectar,
}));

import { connectTelegramForCompany } from "@/server/telegram/connect";
import { TelegramConnectionError } from "@/server/telegram/credentials";
import { TelegramApiError } from "@/server/telegram/client";

const entrada = { organizationId: "org_1", botId: "123", username: "empresa_bot", token: "token-de-prueba" };

beforeEach(() => {
  h.actual.mockReset().mockResolvedValue("");
  h.registrar.mockReset().mockResolvedValue(undefined);
  h.reservar.mockReset().mockResolvedValue(undefined);
  h.conectar.mockReset().mockImplementation((_input, registrar) => registrar("secreto-reservado"));
});

describe("conectar Telegram en multiempresa", () => {
  it("registra con el secreto de la reserva durable después de comprobar su propiedad", async () => {
    await connectTelegramForCompany(entrada);
    expect(h.reservar).toHaveBeenCalledWith({ ...entrada, status: "reconnect_required", webhookSecret: expect.any(String) });
    expect(h.registrar).toHaveBeenCalledWith(entrada.token, entrada.botId, "secreto-reservado");
    expect(h.reservar.mock.invocationCallOrder[0]).toBeLessThan(h.registrar.mock.invocationCallOrder[0]!);
  });

  it("no reserva ni sustituye un webhook existente de otra instalación", async () => {
    h.actual.mockResolvedValue("https://externo.example/webhook");
    await expect(connectTelegramForCompany(entrada)).rejects.toMatchObject({ code: "webhook_in_use" });
    expect(h.reservar).not.toHaveBeenCalled();
    expect(h.registrar).not.toHaveBeenCalled();
  });

  it("rechaza si otra empresa reclamó el bot antes de modificar un webhook remoto", async () => {
    h.reservar.mockRejectedValue(new TelegramConnectionError("bot_in_use"));
    await expect(connectTelegramForCompany(entrada)).rejects.toMatchObject({ code: "bot_in_use" });
    expect(h.conectar).not.toHaveBeenCalled();
    expect(h.registrar).not.toHaveBeenCalled();
  });

  it("vuelve a comprobar el webhook al conectar y ofrece reintentar con el mismo secreto", async () => {
    h.actual.mockResolvedValueOnce("").mockResolvedValueOnce("https://externo.example/webhook");
    await expect(connectTelegramForCompany(entrada)).rejects.toMatchObject({ code: "webhook_in_use" });
    expect(h.registrar).not.toHaveBeenCalled();

    h.registrar.mockRejectedValueOnce(new TelegramApiError(503));
    await expect(connectTelegramForCompany(entrada)).rejects.toBeInstanceOf(TelegramApiError);
    await connectTelegramForCompany(entrada);
    expect(h.registrar.mock.calls).toEqual([
      [entrada.token, entrada.botId, "secreto-reservado"],
      [entrada.token, entrada.botId, "secreto-reservado"],
    ]);
  });
});
