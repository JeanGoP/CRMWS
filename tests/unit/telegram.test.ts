import { describe, expect, it } from "vitest";
import { normalizeTelegramUpdate } from "@/server/telegram/ingest";
import { capabilitiesFor, textFits } from "@/server/channels/capabilities";
import { parseChannels } from "@/server/channels/enabled";

describe("Telegram opcional", () => {
  it("permanece apagado por defecto y no tiene ventana de 24 horas", () => {
    expect(parseChannels(undefined).has("telegram")).toBe(false);
    expect(parseChannels("telegram").has("telegram")).toBe(true);
    expect(capabilitiesFor("telegram").windowMs).toBeNull();
    expect(textFits("telegram", "a".repeat(4096))).toBe(true);
    expect(textFits("telegram", "a".repeat(4097))).toBe(false);
  });

  it("acepta solo mensajes privados de una persona y crea una llave estable", () => {
    const message = { message_id: 7, date: 1234567890, text: "Hola",
      chat: { id: 42, type: "private" },
      from: { id: 42, first_name: "Ana", last_name: "Pérez" } };
    expect(normalizeTelegramUpdate("88", { message })).toEqual({
      chatId: "42", name: "Ana Pérez", text: "Hola",
      messageId: "tg_88_42_7", timestamp: "1234567890",
    });
    expect(normalizeTelegramUpdate("88", { message: { ...message, chat: { id: 42, type: "group" } } })).toBeNull();
    expect(normalizeTelegramUpdate("88", { message: { ...message, from: { id: 42, is_bot: true } } })).toBeNull();
  });
});
