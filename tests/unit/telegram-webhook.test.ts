import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  credentials: vi.fn(), active: vi.fn(), receive: vi.fn(), ingest: vi.fn(),
}));

vi.mock("@/server/channels/enabled", () => ({
  isChannelEnabled: () => true,
  channelDisabledResponse: () => new Response(null, { status: 404 }),
}));
vi.mock("@/server/channels/preference", () => ({ isChannelActiveForOrg: h.active }));
vi.mock("@/server/telegram/credentials", () => ({ telegramCredentialsForBot: h.credentials }));
vi.mock("@/server/webhooks/recibir", () => ({ recibirEvento: h.receive }));
vi.mock("@/server/inbox/ingest", () => ({ ingestInboundMessage: h.ingest }));

import { POST } from "@/app/api/webhooks/telegram/[botId]/route";
import { processTelegramUpdate } from "@/server/telegram/ingest";

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
  h.credentials.mockReset().mockResolvedValue({ id: "cred_1", organizationId: "org_1", webhookSecret: "expected" });
  h.active.mockReset().mockResolvedValue(true);
  h.receive.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
  h.ingest.mockReset();
  vi.stubEnv("MULTIEMPRESA_PRODUCCION", "off");
  vi.stubEnv("MULTIEMPRESA_PILOTO", "off");
  vi.stubEnv("MULTIEMPRESA_CANALES", "off");
});
afterEach(() => vi.unstubAllEnvs());

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
      "telegram", { botId: "123", update }, `123:${JSON.stringify(update)}`, "telegram", undefined
    );
  });

  it("vincula la entrega autenticada a su empresa para el procesamiento y los reintentos", async () => {
    vi.stubEnv("MULTIEMPRESA_PRODUCCION", "on");
    vi.stubEnv("MULTIEMPRESA_CANALES", "on");
    h.receive.mockResolvedValue(new Response(null, { status: 503 }));
    expect((await POST(request("expected"), context)).status).toBe(503);
    expect(h.receive).toHaveBeenCalledWith(
      "telegram", { botId: "123", credentialId: "cred_1", update }, `123:${JSON.stringify(update)}`, "telegram", "org_1"
    );
  });

  it("mantiene apagada la ruta en el piloto y cuando la instalación real oculta los canales", async () => {
    vi.stubEnv("MULTIEMPRESA_PILOTO", "on");
    expect((await POST(request("expected"), context)).status).toBe(404);
    vi.stubEnv("MULTIEMPRESA_PILOTO", "off");
    vi.stubEnv("MULTIEMPRESA_PRODUCCION", "on");
    expect((await POST(request("expected"), context)).status).toBe(404);
    expect(h.receive).not.toHaveBeenCalled();
  });
});

describe("procesamiento de Telegram multiempresa", () => {
  const entrega = { botId: "123", credentialId: "cred_1", update: { message: {
    message_id: 3, text: "hola", chat: { id: 42, type: "private" }, from: { id: 42 },
  } } };

  beforeEach(() => {
    vi.stubEnv("MULTIEMPRESA_PRODUCCION", "on");
    vi.stubEnv("MULTIEMPRESA_CANALES", "on");
  });

  it("descarta un evento si el bot ahora está asociado a otra empresa", async () => {
    await processTelegramUpdate(entrega, "org_otra");
    await processTelegramUpdate({ ...entrega, credentialId: "cred_anterior" }, "org_1");
    expect(h.active).not.toHaveBeenCalled();
    expect(h.ingest).not.toHaveBeenCalled();
  });

  it("procesa en la empresa verificada y nunca acepta un evento sin empresa en modo real", async () => {
    await processTelegramUpdate(entrega);
    await processTelegramUpdate({ ...entrega, credentialId: undefined }, "org_1");
    expect(h.ingest).not.toHaveBeenCalled();
    await processTelegramUpdate(entrega, "org_1");
    expect(h.active).toHaveBeenCalledWith("telegram", "org_1");
    expect(h.ingest).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org_1", waMessageId: "tg_123_42_3",
    }));
  });
});
