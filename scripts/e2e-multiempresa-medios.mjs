/** Usa la copia local después de ejecutar e2e-multiempresa.mjs. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import postgres from "postgres";

const app = "http://127.0.0.1:3139";
assert.equal(new URL(process.env.APP_BASE_URL).origin, app);
assert.equal(process.env.MULTIEMPRESA_PILOTO, "on");
assert.equal(process.env.MULTIEMPRESA_ADMIN_EMAIL, "operador@example.test");
const dbUrl = new URL(process.env.DATABASE_URL);
assert.match(dbUrl.protocol, /^postgres(?:ql)?:$/);
assert.equal(dbUrl.host, "127.0.0.1:55439");
assert.equal(dbUrl.pathname, "/hilora_multiempresa");
assert.equal(dbUrl.search, "");
const media = resolve(process.env.MEDIA_DIR ?? ".dev-media");
assert.equal(media, resolve(".dev-media"));

const cookies = new Map();
async function pedir(path, { body, empresa, status = 200 } = {}) {
  const method = body ? "POST" : "GET";
  const res = await fetch(`${app}${path}`, {
    method, redirect: "manual", signal: AbortSignal.timeout(45_000),
    headers: {
      origin: app,
      cookie: [...cookies.values()].join("; "),
      ...(empresa ? { "X-Hilora-Empresa": empresa } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const cookie of res.headers.getSetCookie()) {
    const valor = cookie.split(";", 1)[0];
    cookies.set(valor.split("=", 1)[0], valor);
  }
  assert.equal(res.status, status, `${method} ${path}`);
  return res;
}

await pedir("/api/auth/sign-in/email", {
  body: { email: "operador@example.test", password: "Prueba-local-Hilora-2026!" },
});
const { empresaActivaId, empresas } = await (await pedir("/api/empresas")).json();
assert.equal(empresas.length, 2, "Se necesitan las dos empresas ficticias de la prueba principal");
const turismo = empresas.find(({ nombre }) => nombre === "Turismo Demo");
const consultorio = empresas.find(({ nombre }) => nombre === "Negocio de Consultorio Demo");
assert.ok(turismo?.rol === "owner" && consultorio?.rol === "owner");
assert.match(turismo.id, /^[\w-]+$/);
if (empresaActivaId !== turismo.id) {
  await pedir("/api/empresas/activa", {
    body: { empresaId: turismo.id }, empresa: empresaActivaId, status: 204,
  });
}

const archivo = "comprobante-ficticio.txt";
const leyenda = "Pago simulado de una reserva en Cartagena histórica. Referencia DEMO-RESERVA.";
const contenido = `${leyenda}\nEste comprobante solo pertenece a Turismo Demo.\n`;
const assetId = `med_piloto_recibo_${turismo.id}`;
const mensajeId = `msg_piloto_recibo_${turismo.id}`;
const sql = postgres(dbUrl.href, { max: 1, connect_timeout: 10 });
let conversacionId;

try {
  conversacionId = await sql.begin(async (tx) => {
    const [viajero] = await tx`
      SELECT id FROM contact
      WHERE organization_id = ${turismo.id} AND name = 'Viajero de prueba' AND phone = '12025550101'
    `;
    assert.ok(viajero, "Falta el contacto ficticio de la prueba principal");
    const [conversacion] = await tx`
      INSERT INTO conversation (id, organization_id, contact_id, is_test, ai_enabled, last_message_at)
      VALUES (${`conv_piloto_recibo_${turismo.id}`}, ${turismo.id}, ${viajero.id}, false, false, now())
      ON CONFLICT (organization_id, contact_id) WHERE is_test = false
      DO UPDATE SET last_message_at = now()
      RETURNING id
    `;
    await tx`
      INSERT INTO media_asset (id, organization_id, kind, mime_type, file_name, file_size, storage_path, fetch_status)
      VALUES (${assetId}, ${turismo.id}, 'document', 'text/plain', ${archivo},
        ${Buffer.byteLength(contenido)}, ${`${turismo.id}/${assetId}`}, 'available')
      ON CONFLICT (id) DO NOTHING
    `;
    await tx`
      INSERT INTO message (id, organization_id, conversation_id, direction, type, text, status, media_asset_id)
      VALUES (${mensajeId}, ${turismo.id}, ${conversacion.id}, 'in', 'document', ${leyenda}, 'delivered', ${assetId})
      ON CONFLICT (id) DO NOTHING
    `;
    return conversacion.id;
  });
} finally {
  await sql.end();
}
const carpeta = join(media, turismo.id);
await mkdir(carpeta, { recursive: true });
await writeFile(join(carpeta, assetId), contenido);

const rutaHilo = `/api/conversations/${conversacionId}/messages`;
const rutaAdjunto = `/api/media/${assetId}`;
const bandeja = async () => (await (await pedir("/api/conversations")).json()).conversations;
assert.ok((await bandeja()).some(({ id }) => id === conversacionId));
const { messages } = await (await pedir(rutaHilo)).json();
const mensaje = messages.find(({ id }) => id === mensajeId);
assert.equal(mensaje?.text, leyenda);
assert.equal(mensaje.media?.assetId, assetId);
assert.equal(mensaje.media?.fileName, archivo);
const adjunto = await pedir(rutaAdjunto);
assert.equal(adjunto.headers.get("cache-control"), "no-store");
assert.equal(await adjunto.text(), contenido);

await pedir("/api/empresas/activa", {
  body: { empresaId: consultorio.id }, empresa: turismo.id, status: 204,
});
assert.ok(!(await bandeja()).some(({ id }) => id === conversacionId));
await pedir(rutaHilo, { status: 404 });
await pedir(rutaAdjunto, { status: 404 });
console.log("OK Turismo ve el mensaje y su comprobante; Consultorio no los lista y recibe 404 por enlace directo");
