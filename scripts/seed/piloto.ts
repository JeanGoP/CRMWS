/** Crea las dos empresas ficticias en la base dedicada del piloto. */
import { hashPassword } from "better-auth/crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, getSql, schema } from "@/lib/db";
import { guardarMedia } from "@/lib/storage/medios";
import { sembrarEmpresa } from "@/server/auth/on-signup";
import { multiempresaActiva } from "@/server/empresas/flag";

type Transaccion = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

const OPERADOR = "hilora_piloto_operador";
const CONSULTORIO = {
  id: "org_piloto_consultorio",
  nombre: "Consultorio Demo",
  slug: "consultorio-demo",
  miembro: "mem_piloto_01_consultorio",
  acento: "#0d5bff",
};
const TURISMO = {
  id: "org_piloto_turismo",
  nombre: "Turismo Demo",
  slug: "turismo-demo",
  miembro: "mem_piloto_02_turismo",
  acento: "#367466",
};
const TOURS = [
  {
    clave: "cartagena",
    nombre: "Recorrido por Cartagena histórica",
    precio: 120_000,
    precioVisible: "$120.000 COP",
    telefono: "12025550101",
    viajero: "Viajero de prueba",
    confirmada: false,
  },
  {
    clave: "rosario",
    nombre: "Excursión a Islas del Rosario",
    precio: 280_000,
    precioVisible: "$280.000 COP",
    telefono: "12025550102",
    viajero: "Viajera de prueba",
    confirmada: true,
  },
] as const;

class ErrorSemilla extends Error {}

function validarEntorno() {
  if (!multiempresaActiva()) {
    throw new ErrorSemilla("La semilla requiere MULTIEMPRESA_PILOTO=on.");
  }
  const destino = z.string().url().transform((valor) => new URL(valor)).safeParse(process.env.DATABASE_URL);
  const url = destino.success ? destino.data : null;
  const postgres = url?.protocol === "postgresql:" || url?.protocol === "postgres:";
  if (!url || !postgres || url.hostname !== "piloto-db" || url.pathname !== "/hilora_piloto" ||
      (url.port && url.port !== "5432") || url.search || url.hash) {
    throw new ErrorSemilla("La semilla requiere la base hilora_piloto en el servicio piloto-db.");
  }
  if ((process.env.MEDIA_STORE || "disco").trim().toLowerCase() !== "disco") {
    throw new ErrorSemilla("La semilla requiere almacenamiento de adjuntos en disco.");
  }
  const correo = z.string().email().safeParse(process.env.MULTIEMPRESA_ADMIN_EMAIL?.trim().toLowerCase());
  if (!correo.success) throw new ErrorSemilla("Define MULTIEMPRESA_ADMIN_EMAIL con el correo del operador.");
  const clave = process.env.PILOTO_ADMIN_PASSWORD ?? "";
  if (clave.length < 24 || clave.length > 128) {
    throw new ErrorSemilla("PILOTO_ADMIN_PASSWORD debe tener entre 24 y 128 caracteres.");
  }
  return { correo: correo.data, clave };
}

async function crearEmpresaDemo(tx: Transaccion, empresa: typeof CONSULTORIO) {
  await tx.insert(schema.organization).values({
    id: empresa.id,
    name: empresa.nombre,
    slug: empresa.slug,
    metadata: JSON.stringify({
      branding: { name: empresa.nombre, accent: empresa.acento, currency: "COP", favicon: null },
    }),
  });
  await tx.insert(schema.member).values({
    id: empresa.miembro,
    organizationId: empresa.id,
    userId: OPERADOR,
    role: "owner",
  });
  await sembrarEmpresa(tx, empresa.id);
}

function proximoDiaHabilBogota(): Date {
  // A las 10:00 de Bogotá son las 15:00 UTC durante todo el año.
  const fecha = new Date(Date.now() - 5 * 3_600_000);
  fecha.setUTCHours(15, 0, 0, 0);
  do {
    fecha.setUTCDate(fecha.getUTCDate() + 1);
  } while (fecha.getUTCDay() === 0 || fecha.getUTCDay() === 6);
  return fecha;
}

async function cargarCalendarioDemo(tx: Transaccion, organizationId: string, slotMinutes: number) {
  const horario = [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }];
  await tx.insert(schema.calendarSettings).values({
    id: `cal_${organizationId}`,
    organizationId,
    weeklyHours: { mon: horario, tue: horario, wed: horario, thu: horario, fri: horario },
    timezone: "America/Bogota",
    slotMinutes,
    connector: "enlace-fijo",
  });
}

async function cargarConsultorio(tx: Transaccion) {
  const organizationId = CONSULTORIO.id;
  const contactId = "ct_piloto_consultorio";

  await tx.insert(schema.contact).values({
    id: contactId,
    organizationId,
    name: "Contacto del consultorio ficticio",
    nameSource: "manual",
    phone: "12025550101",
    waIdentity: "12025550101",
  });
  await cargarCalendarioDemo(tx, organizationId, 50);
  await tx.insert(schema.booking).values({
    id: "bk_piloto_consultorio",
    organizationId,
    contactId,
    scheduledAt: proximoDiaHabilBogota(),
    durationMinutes: 50,
    connector: "enlace-fijo",
    notes: "Cita ficticia del Consultorio Demo.",
  });
}

async function cargarTurismo(tx: Transaccion) {
  const organizationId = TURISMO.id;
  const porVerificar = {
    id: "stg_piloto_pago",
    name: "Pago por verificar",
    kind: "open",
  } as const;
  const [ganada] = await tx.update(schema.pipelineStage).set({ name: "Reserva confirmada" })
    .where(and(eq(schema.pipelineStage.organizationId, organizationId), eq(schema.pipelineStage.kind, "won")))
    .returning();
  if (!ganada) throw new ErrorSemilla("Falta la etapa de reservas en Turismo Demo.");
  await tx.update(schema.pipelineStage).set({ position: sql`${schema.pipelineStage.position} + 1` })
    .where(and(eq(schema.pipelineStage.organizationId, organizationId), gte(schema.pipelineStage.position, ganada.position)));
  await tx.insert(schema.pipelineStage).values({ ...porVerificar, organizationId, position: ganada.position });

  await tx.insert(schema.kbEntry).values({
    id: "kb_piloto_tours",
    organizationId,
    kind: "block",
    content: [
      "Catálogo ficticio de Turismo Demo.",
      ...TOURS.map((tour) => `${tour.nombre}: ${tour.precioVisible} por persona.`),
      "Para simular una transferencia usa la referencia ficticia DEMO-RESERVA. " +
        "El operador coteja el comprobante de muestra en Pago por verificar antes de mover la tarjeta a Reserva confirmada.",
    ].join("\n"),
  });

  await cargarCalendarioDemo(tx, organizationId, 30);
  for (const [posicion, tour] of TOURS.entries()) {
    const contactId = `ct_piloto_${tour.clave}`;
    const leadId = `ld_piloto_${tour.clave}`;
    const etapa = tour.confirmada ? ganada : porVerificar;
    await tx.insert(schema.contact).values({
      id: contactId,
      organizationId,
      name: tour.viajero,
      nameSource: "manual",
      phone: tour.telefono,
      waIdentity: tour.telefono,
      notes: `Solicitud ficticia: ${tour.nombre}.`,
    });
    await tx.insert(schema.lead).values({
      id: leadId,
      organizationId,
      contactId,
      stageId: etapa.id,
      position: posicion,
      amountCents: tour.precio * 100,
      currency: "COP",
    });
    await tx.insert(schema.leadStageEvent).values({
      id: `lse_piloto_${tour.clave}`,
      organizationId,
      leadId,
      contactId,
      toStageId: etapa.id,
      toStageName: etapa.name,
      toStageKind: etapa.kind,
      occurredAt: new Date(),
      source: "sistema",
    });
    if (tour.confirmada) {
      await tx.insert(schema.booking).values({
        id: `bk_piloto_${tour.clave}`,
        organizationId,
        contactId,
        leadId,
        scheduledAt: proximoDiaHabilBogota(),
        durationMinutes: 30,
        connector: "enlace-fijo",
        notes: `Reserva ficticia: ${tour.nombre}.`,
      });
    }
  }

  const assetId = "ma_piloto_recibo";
  const conversacionId = "cv_piloto_cartagena";
  const leyenda = "Comprobante ficticio de una reserva en Cartagena histórica.";
  const contenido = Buffer.from(`${leyenda}\nImporte simulado: $120.000 COP.\nReferencia ficticia: DEMO-RESERVA.\n`);
  const ahora = new Date();
  await tx.insert(schema.conversation).values({
    id: conversacionId,
    organizationId,
    contactId: "ct_piloto_cartagena",
    aiEnabled: false,
    lastMessageAt: ahora,
  });
  const storagePath = await guardarMedia(organizationId, assetId, contenido, "text/plain");
  await tx.insert(schema.mediaAsset).values({
    id: assetId,
    organizationId,
    kind: "document",
    mimeType: "text/plain",
    fileName: "comprobante-ficticio.txt",
    fileSize: contenido.length,
    storagePath,
    fetchStatus: "available",
  });
  await tx.insert(schema.message).values({
    id: "msg_piloto_recibo",
    organizationId,
    conversationId: conversacionId,
    direction: "in",
    type: "document",
    text: leyenda,
    status: "delivered",
    mediaAssetId: assetId,
    waTimestamp: ahora,
  });
}

async function ejecutar() {
  const { correo, clave } = validarEntorno();
  const db = getDb();
  try {
    const creada = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(874201)`);
      const [operador] = await tx.select({ email: schema.user.email }).from(schema.user)
        .where(eq(schema.user.id, OPERADOR)).limit(1);
      if (operador) {
        if (operador.email !== correo) {
          throw new ErrorSemilla("MULTIEMPRESA_ADMIN_EMAIL difiere de la cuenta inicial del piloto.");
        }
        return false;
      }
      const [empresaExistente] = await tx.select({ id: schema.organization.id }).from(schema.organization).limit(1);
      const [cuentaExistente] = await tx.select({ id: schema.user.id }).from(schema.user).limit(1);
      if (empresaExistente || cuentaExistente) {
        throw new ErrorSemilla("La carga inicial del piloto requiere una base sin usuarios ni empresas.");
      }
      await tx.insert(schema.user).values({ id: OPERADOR, name: "Operador del piloto", email: correo });
      await tx.insert(schema.account).values({
        id: "hilora_piloto_credencial",
        accountId: OPERADOR,
        providerId: "credential",
        userId: OPERADOR,
        password: await hashPassword(clave),
      });
      await crearEmpresaDemo(tx, CONSULTORIO);
      await crearEmpresaDemo(tx, TURISMO);
      await cargarConsultorio(tx);
      await cargarTurismo(tx);
      return true;
    });
    console.log(creada
      ? "[piloto] Consultorio Demo y Turismo Demo preparados."
      : "[piloto] La carga inicial ya está aplicada.");
  } finally {
    await getSql().end();
  }
}

try {
  await ejecutar();
} catch (error) {
  console.error(error instanceof ErrorSemilla
    ? `[piloto] ${error.message}`
    : "[piloto] No se pudo completar la carga inicial. Revisa la base y el volumen del piloto.");
  process.exitCode = 1;
}
