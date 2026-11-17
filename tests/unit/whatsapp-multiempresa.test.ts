import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/webhooks/wa/[webhookToken]/route";
import { graphRequest } from "@/lib/meta/client";
import { recibirEvento } from "@/server/webhooks/recibir";
import { conexionParaWebhookWhatsapp } from "@/server/whatsapp/credentials-multiempresa";
import {
  quitarWebhookMultiempresa,
  registrarWebhookMultiempresa,
  verificarConexionWhatsapp,
} from "@/server/whatsapp/connect-multiempresa";
import { leerEntregaWhatsappVerificada } from "@/server/whatsapp/webhook-multiempresa";

vi.mock("@/lib/meta/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/meta/client")>(),
  graphRequest: vi.fn(),
}));
vi.mock("@/server/whatsapp/credentials-multiempresa", () => ({
  conexionParaWebhookWhatsapp: vi.fn(),
}));
vi.mock("@/server/webhooks/recibir", () => ({
  recibirEvento: vi.fn(async () => Response.json({ received: true })),
}));

const cuenta = {
  appId: "101",
  appSecret: "firma-ficticia-de-whatsapp",
  token: "token-de-acceso-ficticio",
  wabaId: "123",
  phoneNumberId: "456",
};
const direccion = { url: "https://hilora.example.test/api/webhooks/wa/propio", verifyToken: "verificacion" };
const meta = vi.mocked(graphRequest);

describe("validación y registro de WhatsApp de una empresa", () => {
  beforeEach(() => meta.mockReset());

  it("comprueba qué app expidió el token y busca el número dentro de la WABA", async () => {
    meta.mockResolvedValueOnce({ data: {
      app_id: cuenta.appId,
      is_valid: true,
      scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
    } }).mockResolvedValueOnce({ data: [{ id: cuenta.phoneNumberId, display_phone_number: "+1 202 555 0101" }] });

    expect(await verificarConexionWhatsapp(cuenta)).toEqual({ displayPhoneNumber: "+1 202 555 0101", verifiedName: null });
    expect(meta.mock.calls.map(([path]) => path.split("?")[0])).toEqual(["debug_token", "123/phone_numbers"]);
  });

  it("rechaza el token de una app distinta y no pide información de la WABA", async () => {
    meta.mockResolvedValueOnce({ data: { app_id: "102", is_valid: true } });
    await expect(verificarConexionWhatsapp(cuenta)).rejects.toMatchObject({ code: "invalid_token" });
    expect(meta).toHaveBeenCalledTimes(1);
  });

  it("rechaza una WABA que no contiene el número aunque el token sea válido", async () => {
    meta.mockResolvedValueOnce({ data: {
      app_id: cuenta.appId,
      is_valid: true,
      scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
    } }).mockResolvedValueOnce({ data: [{ id: "567" }] });
    await expect(verificarConexionWhatsapp(cuenta)).rejects.toMatchObject({ code: "invalid_waba_number" });
  });

  it("no sustituye el override de otro servicio ni borra ese override al desconectar", async () => {
    const ajeno = {
      id: cuenta.phoneNumberId,
      webhook_configuration: { phone_number: "https://otro.example.test/webhook" },
    };
    meta.mockResolvedValueOnce({ data: [{ whatsapp_business_api_data: { id: cuenta.appId } }] })
      .mockResolvedValueOnce(ajeno).mockResolvedValueOnce(ajeno);
    await expect(registrarWebhookMultiempresa(cuenta, direccion)).resolves.toMatchObject({ ok: false });
    await expect(quitarWebhookMultiempresa(cuenta, direccion.url)).resolves.toBe(true);
    expect(meta.mock.calls.every(([, opts]) => opts.method !== "POST")).toBe(true);
  });

  it("solo escribe el override del número después de confirmar la suscripción y su estado", async () => {
    meta.mockResolvedValueOnce({ data: [{ whatsapp_business_api_data: { id: cuenta.appId } }] })
      .mockResolvedValueOnce({ id: cuenta.phoneNumberId, webhook_configuration: { application: direccion.url } })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ id: cuenta.phoneNumberId,
        webhook_configuration: { phone_number: direccion.url, application: direccion.url } });

    await expect(registrarWebhookMultiempresa(cuenta, direccion)).resolves.toMatchObject({ ok: true });
    expect(meta.mock.calls.filter(([, opts]) => opts.method === "POST")).toEqual([
      [cuenta.phoneNumberId, {
        method: "POST", token: cuenta.token, fresh: true,
        body: { webhook_configuration: { override_callback_uri: direccion.url, verify_token: direccion.verifyToken } },
      }],
    ]);
  });
});

describe("webhook de WhatsApp por conexión", () => {
  const conexion = {
    id: "cred_00000000000000000001",
    organizationId: "org_a",
    wabaId: cuenta.wabaId,
    phoneNumberId: cuenta.phoneNumberId,
    appSecret: cuenta.appSecret,
    verifyToken: direccion.verifyToken,
  };
  const params = { params: Promise.resolve({ webhookToken: "segmento-a" }) };

  function paquete(...numbers: string[]) {
    return {
      object: "whatsapp_business_account",
      entry: [{
        id: cuenta.wabaId,
        changes: numbers.map((number) => ({ field: "messages", value: { metadata: { phone_number_id: number } } })),
      }],
    };
  }

  function entrega(payload: unknown, secret?: string) {
    const body = JSON.stringify(payload);
    const signature = secret ? `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` : "";
    return new Request(direccion.url, { method: "POST", body, headers: { "X-Hub-Signature-256": signature } });
  }

  beforeEach(() => {
    vi.stubEnv("MULTIEMPRESA_PRODUCCION", "on");
    vi.stubEnv("MULTIEMPRESA_CANALES", "on");
    vi.mocked(conexionParaWebhookWhatsapp).mockResolvedValue(conexion);
    vi.mocked(recibirEvento).mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("solo completa el desafío con el verify token de esa conexión", async () => {
    const url = `${direccion.url}?hub.mode=subscribe&hub.challenge=987&hub.verify_token=`;
    expect((await GET(new Request(`${url}otro`), params)).status).toBe(403);
    expect(await (await GET(new Request(`${url}${conexion.verifyToken}`), params)).text()).toBe("987");
  });

  it("rechaza firma ausente o de otra app antes de encolar", async () => {
    expect((await POST(entrega(paquete("456")), params)).status).toBe(401);
    expect((await POST(entrega(paquete("456"), "otra app"), params)).status).toBe(401);
    expect(recibirEvento).not.toHaveBeenCalled();
  });

  it("rechaza un lote firmado que mezcla el número autorizado con uno ajeno", async () => {
    expect((await POST(entrega(paquete("456", "567"), cuenta.appSecret), params)).status).toBe(403);
    expect(recibirEvento).not.toHaveBeenCalled();
  });

  it("encola solo la empresa y conexión que verificaron el evento", async () => {
    const payload = paquete("456");
    expect((await POST(entrega(payload, cuenta.appSecret), params)).status).toBe(200);
    expect(recibirEvento).toHaveBeenCalledWith(
      "whatsapp",
      { conexionWhatsappMultiempresa: conexion.id, payload },
      JSON.stringify(payload),
      "whatsapp",
      "org_a"
    );
    expect(leerEntregaWhatsappVerificada(payload)).toBeNull();
  });
});
