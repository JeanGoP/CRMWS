/** Prueba de integración. Requiere una base nueva y una app de ensayo en loopback. */
import assert from "node:assert/strict";

const base = new URL(process.env.APP_BASE_URL ?? "http://127.0.0.1:3139");
assert.equal(base.protocol, "http:", "Usa una app de prueba local");
assert.equal(base.hostname, "127.0.0.1", "La prueba solo puede llamar a loopback");
assert.notEqual(base.port, "", "Usa un puerto de prueba explícito");
assert.equal(process.env.MULTIEMPRESA_PILOTO, "on", "Habilita el piloto local");
const operador = "operador@example.test";
assert.equal(process.env.MULTIEMPRESA_ADMIN_EMAIL, operador, "Usa la cuenta ficticia del piloto");

const clavePrueba = "Prueba-local-Hilora-2026!";
const telefono = "12025550101";
const credencialBot = process.env.BOT_API_KEY || "llave-local-de-bot-que-debe-rechazarse";
const catalogoDemo = [
  "Catálogo de Turismo Demo. Precios ficticios en pesos colombianos.",
  "Recorrido por Cartagena histórica: $120.000 COP por persona.",
  "Excursión a Islas del Rosario: $280.000 COP por persona.",
  "Simulación de pago por consignación o transferencia. Usa la referencia ficticia DEMO-RESERVA y registra el comprobante de prueba.",
  "Deja la reserva en Pago por verificar. Un operador coteja el comprobante simulado y autoriza moverla a Reserva confirmada.",
].join("\n");

function usuario() {
  const cookies = new Map();
  return async function pedir(path, { method = "GET", body, empresa, status = 200, headers = {} } = {}) {
    const response = await fetch(new URL(path, base.origin), {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(90_000),
      headers: {
        origin: base.origin,
        cookie: [...cookies.values()].join("; "),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(empresa ? { "X-Hilora-Empresa": empresa } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [valor] = cookie.split(";");
      const nombre = valor.slice(0, valor.indexOf("="));
      cookies.set(nombre, valor);
    }
    const contenido = await response.text();
    assert.equal(response.status, status, `${method} ${path}: ${contenido.slice(0, 240)}`);
    if (!contenido) return null;
    return response.headers.get("content-type")?.includes("application/json")
      ? JSON.parse(contenido)
      : contenido;
  };
}

async function probar() {
  const admin = usuario();
  const invitado = usuario();
  const correoInvitado = "miembro@example.test";
  const inicioAgenda = new Date(Date.now() + 7 * 86_400_000).toISOString();

  await invitado("/api/auth/sign-up/email", {
    method: "POST", status: 403,
    body: { name: "Registro ajeno", email: correoInvitado, password: clavePrueba },
  });

  await admin("/api/auth/sign-up/email", {
    method: "POST", body: { name: "Consultorio Demo", email: operador, password: clavePrueba },
  });
  const inicio = await admin("/api/empresas");
  assert.equal(inicio.empresas.length, 1, "La base debe ser nueva");
  assert.equal(inicio.puedeCrear, true);
  const empresaA = inicio.empresaActivaId;
  assert.ok(empresaA);
  await admin("/api/settings/branding", {
    method: "PUT", empresa: empresaA, body: { name: "Consultorio Demo", accent: "#0d5bff", currency: "COP" },
  });

  await admin("/api/settings/team", {
    method: "POST", empresa: empresaA, status: 201,
    body: { name: "Miembro ficticio", email: correoInvitado, password: clavePrueba },
  });
  const creadoA = await admin("/api/contacts", {
    method: "POST", empresa: empresaA, status: 201, body: { name: "Contacto del consultorio ficticio", phone: telefono },
  });
  const bloqueA = await admin("/api/bookings", {
    method: "POST", empresa: empresaA, status: 201,
    body: { kind: "block", startUtc: inicioAgenda, durationMinutes: 50, notes: "Bloqueo ficticio del consultorio" },
  });
  const carteraInicial = await admin("/api/settings/cartera");
  const apiA = "https://cartera-a.example.test/api/saldos";
  const carteraA = await admin("/api/settings/cartera", {
    method: "PUT", empresa: empresaA,
    body: {
      apiUrl: apiA,
      token: "credencial-ficticia-4A01",
      config: { ...carteraInicial.config, payment: { ...carteraInicial.config.payment, beneficiary: "Beneficiario A de prueba" } },
    },
  });
  assert.equal(carteraA.hasToken, true);
  assert.equal(carteraA.tokenLast4, "4A01");

  const nombreB = "Turismo Demo";
  const { id: empresaB } = await admin("/api/empresas", {
    method: "POST", empresa: empresaA, status: 201, body: { nombre: nombreB },
  });
  assert.ok(empresaB);
  assert.notEqual(empresaA, empresaB);
  const listado = await admin("/api/empresas");
  assert.equal(listado.empresaActivaId, empresaA);
  assert.deepEqual(new Set(listado.empresas.map(({ id }) => id)), new Set([empresaA, empresaB]));
  assert.equal(listado.empresas.find(({ id }) => id === empresaB)?.nombre, nombreB);
  assert.equal(listado.empresas.find(({ id }) => id === empresaB)?.rol, "owner");
  const panel = await admin("/empresas");
  assert.match(panel, />Empresas<\/h1>/, "El panel de Empresas responde al operador");

  await invitado("/api/auth/sign-in/email", {
    method: "POST", body: { email: correoInvitado, password: clavePrueba },
  });
  const empresasInvitado = await invitado("/api/empresas");
  assert.equal(empresasInvitado.empresaActivaId, empresaA);
  assert.equal(empresasInvitado.puedeCrear, false);
  assert.deepEqual(empresasInvitado.empresas.map(({ id, rol }) => ({ id, rol })), [{ id: empresaA, rol: "member" }]);
  await invitado("/api/empresas", {
    method: "POST", empresa: empresaA, status: 403, body: { nombre: "Alta sin permiso" },
  });
  await invitado("/api/empresas/activa", {
    method: "POST", empresa: empresaA, status: 403, body: { empresaId: empresaB },
  });
  await invitado("/api/settings/cartera", { status: 403 });
  await invitado("/api/contacts", {
    method: "POST", empresa: empresaB, status: 409, body: { name: "Mutación cruzada", phone: telefono },
  });
  console.log("OK creación centralizada y permisos de miembro");

  await admin("/api/empresas/activa", {
    method: "POST", empresa: empresaA, status: 204, body: { empresaId: empresaB },
  });
  assert.equal((await admin("/api/empresas")).empresaActivaId, empresaB);
  await admin("/api/settings/branding", {
    method: "PUT", empresa: empresaB, body: { name: nombreB, accent: "#367466", currency: "COP" },
  });
  assert.deepEqual((await admin("/api/contacts")).contacts, []);
  await admin(`/api/contacts/${creadoA.contact.id}`, { status: 404 });
  await admin(`/api/contacts/${creadoA.contact.id}`, {
    method: "PATCH", empresa: empresaB, status: 404, body: { name: "Cambio cruzado no permitido" },
  });
  assert.deepEqual((await admin("/api/bookings")).bookings, []);
  await admin("/api/bookings", {
    method: "POST", empresa: empresaB, status: 404,
    body: { kind: "session", contactId: creadoA.contact.id, startUtc: inicioAgenda },
  });
  const carteraVaciaB = await admin("/api/settings/cartera");
  assert.equal(carteraVaciaB.apiUrl, "");
  assert.equal(carteraVaciaB.hasToken, false);
  assert.equal(carteraVaciaB.config.payment.beneficiary, "");
  await admin("/api/contacts", {
    method: "POST", empresa: empresaA, status: 409,
    body: { name: "Pestaña obsoleta", phone: "12025550102" },
  });
  await admin("/api/contacts", {
    method: "POST", status: 409, body: { name: "Petición sin empresa", phone: "12025550102" },
  });
  const creadoB = await admin("/api/contacts", {
    method: "POST", empresa: empresaB, status: 201, body: { name: "Viajero de prueba", phone: telefono },
  });
  assert.notEqual(creadoB.contact.id, creadoA.contact.id);
  const conocimiento = await admin("/api/kb", {
    method: "POST", empresa: empresaB, status: 201, body: { kind: "block", content: catalogoDemo },
  });
  assert.equal((await admin("/api/kb")).entries[0]?.content, catalogoDemo);
  const { stage: porVerificar } = await admin("/api/pipeline/stages", {
    method: "POST", empresa: empresaB, status: 201, body: { name: "Pago por verificar" },
  });
  const tableroTurismo = await admin("/api/pipeline/stages");
  const ganada = tableroTurismo.stages.find(({ kind }) => kind === "won");
  assert.ok(ganada, "La empresa nueva tiene un tablero inicial");
  const { stage: confirmada } = await admin(`/api/pipeline/stages/${ganada.id}`, {
    method: "PATCH", empresa: empresaB,
    body: { name: "Reserva confirmada", position: porVerificar.position + 1 },
  });
  assert.equal(confirmada.kind, "won");
  await admin(`/api/pipeline/leads/${creadoB.lead.id}`, {
    method: "PATCH", empresa: empresaB,
    body: { stageId: porVerificar.id, position: 0, amountCents: 12_000_000, currency: "COP" },
  });
  const estadoViajero = async () => {
    const { leads, currency } = await admin("/api/pipeline/board");
    assert.equal(currency, "COP");
    return leads.find(({ id }) => id === creadoB.lead.id);
  };
  assert.equal((await estadoViajero())?.stageId, porVerificar.id);
  assert.equal((await estadoViajero())?.amountCents, 12_000_000);
  await admin(`/api/pipeline/leads/${creadoB.lead.id}`, {
    method: "PATCH", empresa: empresaB,
    body: { stageId: confirmada.id, position: 0 },
  });
  assert.equal((await estadoViajero())?.stageId, confirmada.id);
  const { slots } = await admin("/api/calendar/availability");
  assert.ok(slots[0], "Turismo tiene disponibilidad en su agenda interna");
  const reservaTurismo = await admin("/api/bookings", {
    method: "POST", empresa: empresaB, status: 201,
    body: {
      kind: "session", contactId: creadoB.contact.id, startUtc: slots[0].startUtc,
      notes: "Reserva ficticia de Cartagena histórica después de verificar el pago simulado",
    },
  });
  assert.deepEqual((await admin("/api/bookings")).bookings.map(({ id }) => id), [reservaTurismo.booking.id]);
  const apiB = "https://cartera-b.example.test/api/saldos";
  const carteraB = await admin("/api/settings/cartera", {
    method: "PUT", empresa: empresaB,
    body: { apiUrl: apiB, token: "credencial-ficticia-4B02", config: carteraVaciaB.config },
  });
  assert.equal(carteraB.tokenLast4, "4B02");
  assert.equal((await admin("/api/settings/team")).members.some(({ email }) => email === correoInvitado), false);
  await invitado(`/api/contacts/${creadoB.contact.id}`, { status: 404 });

  await admin("/api/empresas/activa", {
    method: "POST", empresa: empresaB, status: 204, body: { empresaId: empresaA },
  });
  assert.equal((await admin("/api/empresas")).empresaActivaId, empresaA);
  assert.equal((await admin("/api/settings/branding")).branding.name, "Consultorio Demo");
  assert.deepEqual((await admin("/api/contacts")).contacts.map(({ id }) => id), [creadoA.contact.id]);
  assert.deepEqual((await invitado("/api/contacts")).contacts.map(({ id }) => id), [creadoA.contact.id]);
  assert.deepEqual((await admin("/api/bookings")).bookings.map(({ id }) => id), [bloqueA.booking.id]);
  await admin(`/api/contacts/${creadoB.contact.id}`, { status: 404 });
  assert.deepEqual((await admin("/api/kb")).entries, []);
  await admin(`/api/kb/${conocimiento.entry.id}`, {
    method: "DELETE", empresa: empresaA, status: 404,
  });
  assert.ok(!(await admin("/api/pipeline/stages")).stages.some(({ id }) => id === confirmada.id));
  const carteraConservada = await admin("/api/settings/cartera");
  assert.equal(carteraConservada.apiUrl, apiA);
  assert.equal(carteraConservada.tokenLast4, "4A01");
  assert.equal(carteraConservada.config.payment.beneficiary, "Beneficiario A de prueba");
  console.log("OK aislamiento de contactos, equipo, Agenda, Cartera y catálogo con flujo de reservas de Turismo Demo");

  await admin("/api/empresas/activa", {
    method: "POST", empresa: empresaA, status: 204, body: { empresaId: empresaB },
  });
  await admin("/api/empresas/equipo", {
    method: "POST", empresa: empresaB, status: 201, body: { email: correoInvitado },
  });
  const empresasAutorizadas = await invitado("/api/empresas");
  assert.deepEqual(new Set(empresasAutorizadas.empresas.map(({ id }) => id)), new Set([empresaA, empresaB]));
  assert.ok(empresasAutorizadas.empresas.every(({ rol }) => rol === "member"));
  await invitado("/api/empresas/activa", {
    method: "POST", empresa: empresaA, status: 204, body: { empresaId: empresaB },
  });
  assert.deepEqual((await invitado("/api/contacts")).contacts.map(({ id }) => id), [creadoB.contact.id]);
  await invitado(`/api/contacts/${creadoA.contact.id}`, { status: 404 });
  const pagoPendiente = await admin("/api/contacts", {
    method: "POST", empresa: empresaB, status: 201,
    body: { name: "Viajera con pago pendiente", phone: "12025550103" },
  });
  await admin(`/api/pipeline/leads/${pagoPendiente.lead.id}`, {
    method: "PATCH", empresa: empresaB,
    body: { stageId: porVerificar.id, position: 0, amountCents: 28_000_000, currency: "COP" },
  });
  console.log("OK acceso a una segunda empresa solo tras asignación explícita");

  const bot = await fetch(new URL("/api/bot/profile", base.origin), {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: { "X-API-Key": credencialBot },
  });
  assert.ok([401, 403, 404].includes(bot.status), `La llave global debe quedar bloqueada, respuesta ${bot.status}`);
  console.log("OK bloqueo de la entrada de Nea con llave global");
}

try {
  await probar();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
