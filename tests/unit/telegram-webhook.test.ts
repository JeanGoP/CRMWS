import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  credentials: vi.fn(), active: vi.fn(), receive: vi.fn(),
}));

vi.mock("@/server/channels/enabled", () => ({
  isChannelEnabled: () => true,
  channelDisabledResponse: () => new Response(null, { status: 404 }),
}));
vi.mock("@/server/channels/preference", () => ({ isChannelActiveForOrg: h.active }));
vi.mock("@/server/telegram/credentials", () => ({ telegramCredentialsForBot: h.credentials }));
vi.mock("@/server/webhooks/recibir", () => ({ recibirEvento: h.receive }));

import { POST } from "@/app/api/webhooks/telegram/[botId]/route";

const context = { params: Promise.resolve({ botId: "123" }) };
const update = { update_id: 10, message: { message_id: 3, text: "hola" } };
function request(secret: string) {
  return new Request("https://crm.example/api/webhooks/telegram/123", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(update),
  });
}

beforeEach(() => {
  h.credentials.mockReset().mockResolvedValue({ organizationId: "org_1", webhookSecret: "expected" });
  h.active.mockReset().mockResolvedValue(true);
  h.receive.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
});

describe("webhook de Telegram", () => {
  it("rechaza un secreto incorrecto sin guardar el mensaje", async () => {
    expect((await POST(request("wrong"), context)).status).toBe(401);
    expect(h.receive).not.toHaveBeenCalled();
  });

  it("ignora avisos cuando la empresa apagó Telegram", async () => {
    h.active.mockResolvedValue(false);
    expect((await POST(request("expected"), context)).status).toBe(200);
    expect(h.receive).not.toHaveBeenCalled();
  });

  it("entrega un aviso firmado a la cola durable", async () => {
    expect((await POST(request("expected"), context)).status).toBe(200);
    expect(h.receive).toHaveBeenCalledWith(
      "telegram", { botId: "123", update }, `123:${JSON.stringify(update)}`, "telegram"
    );
  });
});
