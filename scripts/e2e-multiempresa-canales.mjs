/**
 * E2E HTTP de WhatsApp y Telegram. Usar PostgreSQL desechable en loopback:
 * DATABASE_URL=postgresql://...@127.0.0.1:55447/hilora_canales
 * node scripts/e2e-multiempresa-canales.mjs
 * Ejecuta el build existente. HILORA_E2E_DEV=on usa Next dev para iterar.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";

const origen = "https://hilora-canales.example.test";
const rutaLocal = new URL(import.meta.url);
const esRunner = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(rutaLocal);

// El proceso de Next se inicia con --import y solo puede hacer HTTP a loopback.
if (process.env.HILORA_E2E_MOCK_ORIGIN) {
  const mock = new URL(process.env.HILORA_E2E_MOCK_ORIGIN);
  assert.equal(mock.hostname, "127.0.0.1");
  assert.equal(mock.protocol, "http:");
  assert.equal(process.env.APP_BASE_URL, origen);
  assert.equal(process.env.MULTIEMPRESA_CANALES, "on");
  const fetchReal = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const proveedor = {
      "https://graph.facebook.com": "meta",
      "https://api.telegram.org": "telegram",
    }[url.origin];
    if (proveedor) return fetchReal(new URL(`/${proveedor}${url.pathname}${url.search}`, mock), init);
    if (url.hostname === "127.0.0.1") return fetchReal(input, init);
    throw new Error("El ensayo no permite conexiones HTTP fuera de loopback");
  };
}

const WA = [
  { wabaId: "51001", phoneNumberId: "61001", appId: "71001", appSecret: "a".repeat(32), token: "token-wa-a-solo-para-ensayo" },
  { wabaId: "51002", phoneNumberId: "61002", appId: "71002", appSecret: "b".repeat(32), token: "token-wa-b-solo-para-ensayo" },
];
const telefonoAlterno = "61003";
const TG = [
  { botId: 81001, token: "81001:telegramA_solo_para_ensayo" },
  { botId: 81002, token: "81002:telegramB_solo_para_ensayo" },
];
const cuenta = [
  { id: "e2e_canales_a", org: "org_e2e_canales_a", email: "canales-a@example.test" },
  { id: "e2e_canales_b", org: "org_e2e_canales_b", email: "canales-b@example.test" },
];
const miembro = { id: "e2e_canales_miembro", org: cuenta[0].org, email: "canales-miembro@example.test" };
const clave = "Credencial-No-Publicar-De-E2E-Canales!";
const chat = 12025550111;
const baseDePruebas = /^hilora_(e2e_)?canales$/;

function proveedorSimulado() {
  const waHooks = new Map();
  const tgHooks = new Map();
  const salientes = [];
  const cambios = [];
  let altaEnCurso = false;
  let soltarAlta;
  const esperarAlta = new Promise((resolve) => { soltarAlta = resolve; });
  const servidor = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : null;
      const [, proveedor, _version, id, accion] = url.pathname.split("/");
      let respuesta;
      if (proveedor === "meta") {
        const credencial = WA.find(({ token }) => req.headers.authorization === `Bearer ${token}`);
        if (id === "debug_token") {
          const cred = WA.find(({ token }) => url.searchParams.get("input_token") === token);
          assert.ok(cred);
          assert.equal(req.headers.authorization, `Bearer ${cred.appId}|${cred.appSecret}`);
          respuesta = { data: { app_id: cred.appId, is_valid: true,
            scopes: ["whatsapp_business_management", "whatsapp_business_messaging"] } };
        } else {
          assert.ok(credencial, "Se llamó Meta con una credencial no ficticia");
          if (accion === "phone_numbers") {
            assert.equal(id, credencial.wabaId);
            const telefonos = credencial === WA[0] ? [credencial.phoneNumberId, telefonoAlterno] : [credencial.phoneNumberId];
            respuesta = { data: telefonos.map((id) => ({ id, display_phone_number: `+1202555${id.slice(-4)}` })) };
          } else if (accion === "subscribed_apps") {
            assert.equal(id, credencial.wabaId);
            respuesta = { data: [{ whatsapp_business_api_data: { id: credencial.appId } }] };
          } else {
            assert.ok(id === credencial.phoneNumberId || (credencial === WA[0] && id === telefonoAlterno));
            if (accion === "messages") {
              salientes.push({ canal: "whatsapp", conexion: id, texto: body.text?.body, destino: body.to });
              respuesta = { messages: [{ id: `wamid.e2e.out.${salientes.length}` }] };
            } else if (req.method === "POST") {
              cambios.push({ canal: "whatsapp", conexion: id });
              waHooks.set(id, body.webhook_configuration);
              respuesta = { success: true };
            } else {
              respuesta = { id, webhook_configuration: { phone_number: waHooks.get(id)?.override_callback_uri } };
            }
          }
        }
      } else {
        assert.equal(proveedor, "telegram");
        const [, , bot, accionBot] = url.pathname.split("/");
        const cred = TG.find(({ token }) => bot === `bot${token}`);
        assert.ok(cred, "Se llamó Telegram con una credencial no ficticia");
        let result;
        if (accionBot === "getMe") {
          result = { id: cred.botId, username: `hilora_prueba_${cred.botId}`, is_bot: true };
        } else if (accionBot === "getWebhookInfo") {
          result = { url: tgHooks.get(cred.botId)?.url ?? "" };
        } else if (accionBot === "setWebhook") {
          if (cred === TG[0] && !tgHooks.has(cred.botId)) {
            altaEnCurso = true;
            await esperarAlta;
          }
          cambios.push({ canal: "telegram", conexion: cred.botId });
          tgHooks.set(cred.botId, body);
          result = true;
        } else {
          assert.equal(accionBot, "sendMessage");
          salientes.push({ canal: "telegram", conexion: cred.botId, texto: body.text, destino: body.chat_id });
          result = { message_id: 1000 + salientes.length };
        }
        respuesta = { ok: true, result };
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(respuesta));
    } catch (error) {
      console.error("El simulador rechazó una llamada inesperada", error.message);
      res.writeHead(500).end("{}");
    }
  });
  return { servidor, waHooks, tgHooks, salientes, cambios, altaEnCurso: () => altaEnCurso, soltarAlta };
}

function cliente(base, org) {
  const cookies = new Map();
  return async (path, { method = "GET", body, status = 200, empresa = org, headers = {} } = {}) => {
    const res = await fetch(new URL(path, base), {
      method, redirect: "manual", signal: AbortSignal.timeout(45_000),
      headers: {
        origin: origen,
        cookie: [...cookies.values()].join("; "),
        ...(empresa ? { "X-Hilora-Empresa": empresa } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
    for (const cookie of res.headers.getSetCookie()) {
      const valor = cookie.split(";", 1)[0];
      cookies.set(valor.split("=", 1)[0], valor);
    }
    const text = await res.text();
    const json = res.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : null;
    assert.ok([status].flat().includes(res.status), `${method} ${path.split("?")[0]} devolvió ${res.status} (${json?.error?.code ?? "sin código"})`);
    return { status: res.status, json, text };
  };
}

async function hasta(condicion, mensaje) {
  for (let i = 0; i < 100; i++) {
    const resultado = await condicion();
    if (resultado) return resultado;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(mensaje);
}

async function sembrar(sql) {
  const password = await hashPassword(clave);
  await sql.begin(async (tx) => {
    const [guard] = await tx`select current_database() as nombre, exists(select from "user") as usuarios,
      exists(select from organization) as empresas`;
    assert.match(guard.nombre, baseDePruebas);
    assert.ok(!guard.usuarios && !guard.empresas, "El ensayo requiere una base desechable vacía");
    for (const c of cuenta) {
      await tx`insert into "user" (id, name, email) values (${c.id}, ${c.id}, ${c.email})`;
      await tx`insert into account (id, account_id, provider_id, user_id, password)
        values (${`cred_${c.id}`}, ${c.id}, 'credential', ${c.id}, ${password})`;
      await tx`insert into organization (id, name, slug) values (${c.org}, ${c.org}, ${c.org})`;
      await tx`insert into member (id, organization_id, user_id, role)
        values (${`mem_${c.id}`}, ${c.org}, ${c.id}, 'owner')`;
      await tx`insert into pipeline_stage (id, organization_id, name, position, kind)
        values (${`stg_${c.id}`}, ${c.org}, 'Nuevo', 0, 'open')`;
      await tx`insert into agent_profile (id, organization_id) values (${`agp_${c.id}`}, ${c.org})`;
    }
    await tx`insert into "user" (id, name, email) values (${miembro.id}, ${miembro.id}, ${miembro.email})`;
    await tx`insert into account (id, account_id, provider_id, user_id, password)
      values (${`cred_${miembro.id}`}, ${miembro.id}, 'credential', ${miembro.id}, ${password})`;
    await tx`insert into member (id, organization_id, user_id, role)
      values (${`mem_${miembro.id}`}, ${miembro.org}, ${miembro.id}, 'member')`;
  });
}

function cambioWa(i, texto, id = `wamid.e2e.${randomUUID()}`) {
  return {
    id: WA[i].wabaId, changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: WA[i].phoneNumberId },
        contacts: [{ wa_id: String(chat), profile: { name: "Contacto ficticio WA" } }],
        messages: [{
          id, from: String(chat), timestamp: String(Math.floor(Date.now() / 1000)),
          type: "text", text: { body: texto },
        }],
      },
    }],
  };
}

async function probarAgenteYGuia(base, a, b) {
  const perfil = "/api/agent/profile";
  const contenido = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  const guiaA = contenido((await a("/onboarding")).text);
  assert.match(guiaA, /Prepara el perfil del agente/);
  assert.match(guiaA, /Configura tus canales/);
  assert.match(guiaA, /Configura la agenda interna/);
  assert.doesNotMatch(guiaA, /Listo · revisar/);
  const agenteA = contenido((await a("/agent")).text);
  assert.match(agenteA, /href="\/agent"/);
  assert.match(agenteA, /href="\/onboarding"/);
  assert.match(agenteA, /href="\/catalogo"/);

  await a(perfil, { empresa: cuenta[1].org, status: 409 });
  await a(perfil, { method: "PUT", body: { name: "Cruce denegado" }, empresa: cuenta[1].org, status: 409 });
  await a(perfil, { method: "PUT", body: { enabled: true }, status: 409 });
  await a(perfil, { method: "PUT", body: { name: "Agente de empresa A", instructions: "Perfil ficticio de la empresa A." } });
  const [perfilA, perfilB, guiaActualizada, guiaB] = await Promise.all([
    a(perfil), b(perfil), a("/onboarding"), b("/onboarding"),
  ]);
  assert.equal(perfilA.json.profile.name, "Agente de empresa A");
  assert.equal(perfilA.json.profile.enabled, false);
  assert.equal(perfilB.json.profile.name, "Asistente");
  assert.match(contenido(guiaActualizada.text), /Listo · revisar/);
  assert.doesNotMatch(contenido(guiaB.text), /Listo · revisar/);

  const equipo = cliente(base, miembro.org);
  await equipo("/api/auth/sign-in/email", { method: "POST", body: { email: miembro.email, password: clave } });
  await equipo(perfil, { status: 403 });
  await equipo(perfil, { method: "PUT", body: { name: "Cambio de miembro" }, status: 403 });
  const catalogo = contenido((await equipo("/catalogo")).text);
  assert.match(catalogo, /Catálogo/);
  assert.doesNotMatch(catalogo, /href="\/(agent|onboarding)"/);
  console.log("OK guía y perfil actualizados solo para la empresa activa; permisos del equipo comprobados");
}

async function probarCambioDeClave(base, sql, a, b) {
  const [propietario, otraEmpresa] = cuenta;
  const rutaCambio = "/api/auth/change-password";
  const rutaLogin = "/api/auth/sign-in/email";
  const claveNueva = "Credencial-Modificada-Solo-En-E2E-Canales!";
  const otroDispositivo = cliente(base, propietario.org);
  const anonimo = cliente(base, null);
  const paginaVisible = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");

  // La membresía posterior hace que un login nuevo elija A, mientras la sesión
  // que cambia su contraseña parte de B. Así se detecta perder la empresa activa.
  await sql`insert into member (id, organization_id, user_id, role, created_at)
    select 'mem_e2e_cuenta_empresa_secundaria_a', ${otraEmpresa.org}, user_id, 'member', created_at + interval '1 minute'
    from member where user_id = ${propietario.id} and organization_id = ${propietario.org}`;
  await otroDispositivo(rutaLogin, {
    method: "POST", body: { email: propietario.email, password: clave }, headers: { "x-forwarded-for": "192.0.2.141" },
  });
  assert.equal((await otroDispositivo("/api/empresas")).json.empresaActivaId, propietario.org);
  await a("/api/empresas/activa", { method: "POST", body: { empresaId: otraEmpresa.org }, status: 204 });
  const empresaActiva = { empresa: otraEmpresa.org };
  assert.equal((await a("/api/empresas", empresaActiva)).json.empresaActivaId, otraEmpresa.org);
  assert.match(paginaVisible((await a("/cuenta", empresaActiva)).text), /Cambiar contraseña/i);
  await anonimo("/cuenta", { status: 307 });

  const cambio = { currentPassword: clave, newPassword: claveNueva, revokeOtherSessions: true };
  await anonimo(rutaCambio, {
    method: "POST", body: cambio, status: 401, headers: { "x-forwarded-for": "192.0.2.143" },
  });
  await a(rutaCambio, {
    method: "POST", body: cambio, empresa: null, status: 403,
    headers: { origin: "https://otro-sitio.example.test", "x-forwarded-for": "192.0.2.144" },
  });
  await a(rutaCambio, {
    ...empresaActiva, method: "POST", body: { ...cambio, currentPassword: "Clave-actual-ficticia-incorrecta" }, status: 400,
  });
  assert.equal((await otroDispositivo("/api/empresas")).json.empresaActivaId, propietario.org);

  await a(rutaCambio, { ...empresaActiva, method: "POST", body: cambio });
  assert.equal((await a("/api/empresas", empresaActiva)).json.empresaActivaId, otraEmpresa.org);
  await otroDispositivo("/api/empresas", { status: 401 });
  assert.equal((await b("/api/empresas")).json.empresaActivaId, otraEmpresa.org);

  const loginNuevo = cliente(base, propietario.org);
  const ipLogin = { "x-forwarded-for": "192.0.2.142" };
  await loginNuevo(rutaLogin, {
    method: "POST", body: { email: propietario.email, password: clave }, headers: ipLogin, status: 401,
  });
  await loginNuevo(rutaLogin, {
    method: "POST", body: { email: propietario.email, password: claveNueva }, headers: ipLogin,
  });
  assert.equal((await loginNuevo("/api/empresas")).json.empresaActivaId, propietario.org);
  console.log("OK cambio privado de contraseña conserva la empresa activa y solo revoca las otras sesiones propias");
}

async function probar(base, mock, sql) {
  const [a, b] = cuenta.map(({ org }) => cliente(base, org));
  const publico = cliente(base, null);
  const operadores = [a, b];
  for (const [i, api] of operadores.entries()) {
    await api("/api/auth/sign-in/email", { method: "POST", body: { email: cuenta[i].email, password: clave } });
    const empresas = await api("/api/empresas");
    assert.deepEqual(empresas.json.empresas.map(({ id }) => id), [cuenta[i].org]);
    const pagina = (await api("/settings/channels")).text;
    assert.match(pagina, /Canales/);
    assert.match(pagina, /href="\/settings\/whatsapp"/);
    assert.match(pagina, /href="\/settings\/telegram"/);
    const prefs = await api("/api/settings/channel-preference");
    assert.deepEqual(prefs.json.preference, { whatsapp: false, telegram: false });
  }
  await probarAgenteYGuia(base, a, b);
  await publico("/api/bot/profile", { status: 404 });
  await publico("/api/settings/ai", { status: 404 });
  await publico("/api/webhooks/ig/prohibido", { method: "POST", body: {}, status: 404 });
  await a("/api/settings/channels", { method: "POST", body: {}, status: 404 });
  await a("/api/settings/channel-preference", { method: "PUT", body: { whatsapp: true, telegram: true }, status: 409 });
  await a("/api/settings/whatsapp", { method: "PUT", body: WA[0], empresa: null, status: 409 });
  const llamarWa = (api, body, status = 200) => api("/api/settings/whatsapp", { method: "PUT", body, status });
  const llamarTg = (api, token, status = 200) => api("/api/settings/telegram", { method: "PUT", body: { token }, status });
  await llamarWa(a, WA[0]);
  const altaBotA = llamarTg(a, TG[0].token);
  // El resultado se comprueba en finally, incluso si falla antes de llegar al simulador.
  void altaBotA.catch(() => {});
  try {
    await hasta(mock.altaEnCurso, "Telegram no recibió el alta de A");
    const concurrente = await llamarTg(b, TG[0].token, 409);
    assert.ok(["bot_in_use", "connection_busy"].includes(concurrente.json.error.code));
  } finally {
    mock.soltarAlta();
    await altaBotA;
  }
  assert.equal(mock.cambios.length, 2);
  assert.equal((await llamarWa(b, { ...WA[0], phoneNumberId: telefonoAlterno }, 409)).json.error.code, "whatsapp_in_use");
  assert.equal((await llamarTg(b, TG[0].token, 409)).json.error.code, "bot_in_use");
  assert.equal(mock.cambios.length, 2, "Un intento ajeno no cambia webhooks en el proveedor");
  await llamarWa(b, WA[1]);
  await llamarTg(b, TG[1].token);
  assert.equal(mock.cambios.length, 4);
  for (const api of operadores) {
    await api("/api/settings/channel-preference", { method: "PUT", body: { whatsapp: true, telegram: true } });
  }
  const metaA = mock.waHooks.get(WA[0].phoneNumberId);
  const metaB = mock.waHooks.get(WA[1].phoneNumberId);
  const desafioMeta = (token) => new URLSearchParams({
    "hub.mode": "subscribe", "hub.challenge": "ensayo-desafio", "hub.verify_token": token,
  });
  const rutaMetaA = new URL(metaA.override_callback_uri).pathname;
  assert.equal((await publico(`${rutaMetaA}?${desafioMeta(metaA.verify_token)}`)).text, "ensayo-desafio");
  await publico(`${rutaMetaA}?${desafioMeta(metaB.verify_token)}`, { status: 403 });

  async function wa(i, entry, status = 200, firma = WA[i].appSecret) {
    const webhook = mock.waHooks.get(WA[i].phoneNumberId);
    assert.equal(new URL(webhook.override_callback_uri).origin, origen);
    const body = JSON.stringify({ object: "whatsapp_business_account", entry });
    return publico(new URL(webhook.override_callback_uri).pathname, {
      method: "POST", body, status,
      headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", firma).update(body).digest("hex")}` },
    });
  }
  async function telegram(i, texto, status = 200, secreto = mock.tgHooks.get(TG[i].botId).secret_token) {
    const webhook = mock.tgHooks.get(TG[i].botId);
    assert.equal(new URL(webhook.url).origin, origen);
    return publico(new URL(webhook.url).pathname, {
      method: "POST", status, headers: { "x-telegram-bot-api-secret-token": secreto },
      body: { message: { message_id: 1, chat: { id: chat, type: "private" },
        from: { id: chat, first_name: "Contacto ficticio TG" }, text: texto } },
    });
  }
  await wa(0, [cambioWa(0, "firma ajena")], 401, WA[1].appSecret);
  await telegram(0, "bot ajeno", 401, mock.tgHooks.get(TG[1].botId).secret_token);
  const idExternoCompartido = "wamid.e2e.mismo-id-dos-empresas";
  const cambioA = cambioWa(0, "WA empresa A", idExternoCompartido);
  const cambioB = cambioWa(1, "WA empresa B", idExternoCompartido);
  const cambioCruzado = cambioWa(1, "cambio extranjero en lote A");
  await wa(0, [cambioA, cambioCruzado], 403);
  for (const [i, cambio] of [cambioA, cambioB].entries()) {
    await wa(i, [cambio]);
    await wa(i, [cambio]);
    await telegram(i, `TG empresa ${i ? "B" : "A"}`);
  }
  const conversaciones = [];
  for (const [i, api] of operadores.entries()) {
    const rows = await hasta(async () => {
      const { json } = await api("/api/conversations");
      return json.conversations.length >= 2 ? json.conversations : null;
    }, "No llegaron WA y TG a la propia empresa");
    assert.equal(rows.length, 2);
    const hilos = {};
    for (const hilo of rows) {
      const { json } = await api(`/api/conversations/${hilo.id}/messages`);
      const esperado = `${hilo.channel === "telegram" ? "TG" : "WA"} empresa ${i ? "B" : "A"}`;
      assert.deepEqual(json.messages.map(({ text }) => text), [esperado]);
      hilos[hilo.channel] = hilo.id;
    }
    conversaciones.push(hilos);
  }
  const [fuga] = await sql`select count(*)::int as total from message where text in ('cambio extranjero en lote A', 'bot ajeno', 'firma ajena')`;
  assert.equal(fuga.total, 0);
  const filasConMismoId = await sql`select organization_id from message where wa_message_id = ${idExternoCompartido} order by organization_id`;
  assert.deepEqual(filasConMismoId.map(({ organization_id }) => organization_id), cuenta.map(({ org }) => org));

  // Simula dos filas reclamables que quedaron en cola con una cuenta ajena.
  const [waA] = await sql`select id from meta_credentials where organization_id = ${cuenta[0].org}`;
  const [tgB] = await sql`select id from telegram_credentials where organization_id = ${cuenta[1].org}`;
  assert.ok(waA && tgB);
  const pruebas = [
    { id: randomUUID(), fuente: "whatsapp", texto: "retry WA cruzado",
      payload: { conexionWhatsappMultiempresa: waA.id,
        payload: { object: "whatsapp_business_account", entry: [cambioWa(1, "retry WA cruzado")] } } },
    { id: randomUUID(), fuente: "telegram", texto: "retry TG cruzado", payload: {
      botId: String(TG[1].botId), credentialId: tgB.id, update: { message: { message_id: 2,
        chat: { id: chat, type: "private" }, from: { id: chat, first_name: "Contacto ficticio" }, text: "retry TG cruzado" } },
    } },
  ];
  for (const fila of pruebas) {
    await sql`insert into webhook_event (id, organization_id, fuente, payload, huella, status, attempts, leased_until)
      values (${fila.id}, ${cuenta[0].org}, ${fila.fuente}, ${sql.json(fila.payload)}, ${fila.id}, 'en_proceso', 1, now() - interval '10 seconds')`;
  }
  await hasta(async () => {
    const filas = await sql`select status, attempts from webhook_event where id in ${sql(pruebas.map(({ id }) => id))}`;
    return filas.length === pruebas.length && filas.every(({ status, attempts }) => status === "procesado" && attempts === 2);
  }, "El worker no descartó los dos eventos cruzados");
  const [retry] = await sql`select count(*)::int as total from message where text in ${sql(pruebas.map(({ texto }) => texto))}`;
  assert.equal(retry.total, 0, "Un reintento no puede adoptar la cuenta de otra empresa");
  const rutaHiloA = `/api/conversations/${conversaciones[0].whatsapp}/messages`;
  await b(rutaHiloA, { status: 404 });
  await b(rutaHiloA, { method: "POST", empresa: cuenta[0].org, body: { text: "empresa obsoleta" }, status: 409 });
  await b(rutaHiloA, { method: "POST", body: { text: "hilo ajeno" }, status: [404, 422] });
  assert.deepEqual(mock.salientes, []);
  for (const [i, api] of operadores.entries()) {
    for (const [canal, id] of Object.entries(conversaciones[i])) {
      await api(`/api/conversations/${id}/messages`, {
        method: "POST", body: { text: `Respuesta ${canal} empresa ${i}` },
      });
    }
  }
  assert.deepEqual(mock.salientes.map(({ canal, conexion, texto }) => [canal, conexion, texto]).sort(), [
    ["telegram", TG[0].botId, "Respuesta telegram empresa 0"],
    ["telegram", TG[1].botId, "Respuesta telegram empresa 1"],
    ["whatsapp", WA[0].phoneNumberId, "Respuesta whatsapp empresa 0"],
    ["whatsapp", WA[1].phoneNumberId, "Respuesta whatsapp empresa 1"],
  ].sort());
  await a("/api/settings/channel-preference", { method: "PUT", body: { whatsapp: false, telegram: false } });
  assert.deepEqual((await b("/api/settings/channel-preference")).json.preference, { whatsapp: true, telegram: true });
  await a(rutaHiloA, { method: "POST", body: { text: "canal desactivado" }, status: 409 });
  assert.equal(mock.salientes.length, 4);
  console.log("OK dos empresas aisladas en alta, webhooks, preferencias, bandeja y envíos simulados WA/Telegram");
  await probarCambioDeClave(base, sql, a, b);
}

async function ejecutar() {
  assert.ok(!process.env.HILORA_E2E_MOCK_ORIGIN, "El origen simulado lo establece el arnés");
  const db = new URL(process.env.DATABASE_URL);
  assert.match(db.protocol, /^postgres(?:ql)?:$/);
  assert.equal(db.hostname, "127.0.0.1");
  assert.ok(db.port && !db.search && !db.hash);
  assert.match(db.pathname.slice(1), baseDePruebas);
  const puerto = Number(process.env.HILORA_E2E_PORT ?? "3157");
  assert.ok(Number.isInteger(puerto) && puerto > 1024 && puerto < 65536);
  const base = `http://127.0.0.1:${puerto}`;
  assert.ok(!await fetch(base, { signal: AbortSignal.timeout(800) }).catch(() => null), "El puerto de ensayo ya tiene un servidor");
  const env = {
    ...process.env, APP_BASE_URL: origen, MULTIEMPRESA_PRODUCCION: "on", MULTIEMPRESA_CANALES: "on",
    MULTIEMPRESA_PILOTO: "off", MULTIEMPRESA_ADMIN_EMAIL: cuenta[0].email, CHANNELS: "whatsapp,telegram",
    BETTER_AUTH_SECRET: "secreto-de-sesiones-solo-e2e-de-canales",
    ENCRYPTION_KEY: Buffer.alloc(32, 73).toString("base64"), META_WEBHOOK_VERIFY_TOKEN: "solo-prueba-de-canales",
    META_GRAPH_BASE_URL: "https://graph.facebook.com", WA_MOCK_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1",
    BOT_API_KEY: "llave-de-ensayo-que-no-debe-permitir-bot", BRAIN_DISPATCH_URL: "",
  };
  const migrador = spawn(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...env, MIGRATIONS_DIR: resolve("drizzle") }, stdio: "inherit",
  });
  assert.equal((await once(migrador, "exit"))[0], 0, "Falló la migración de la base ficticia");
  const sql = postgres(db.href, { max: 1, connect_timeout: 5 });
  const mock = proveedorSimulado();
  let servidor;
  try {
    await sembrar(sql);
    mock.servidor.listen(0, "127.0.0.1");
    await once(mock.servidor, "listening");
    const modo = process.env.HILORA_E2E_DEV === "on" ? "dev" : "start";
    servidor = spawn(process.execPath, [
      "--import", rutaLocal.href, "node_modules/next/dist/bin/next", modo, "--hostname", "127.0.0.1", "--port", String(puerto),
    ], {
      stdio: "inherit", env: { ...env, HILORA_E2E_MOCK_ORIGIN: `http://127.0.0.1:${mock.servidor.address().port}` },
    });
    await hasta(async () => {
      assert.equal(servidor.exitCode, null, "Next terminó antes de empezar la prueba");
      const res = await fetch(base + "/api/health", { signal: AbortSignal.timeout(1000) }).catch(() => null);
      return res?.ok;
    }, "No arrancó Next en el puerto local");
    await probar(base, mock, sql);
  } finally {
    servidor?.kill();
    if (mock.servidor.listening) {
      mock.servidor.closeAllConnections();
      await new Promise((r) => mock.servidor.close(r));
    }
    await sql.end();
  }
}

if (esRunner) await ejecutar();
