import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { estadoIaDe, mensajeDeEstado } from "@/lib/ai/provider";
import {
  CLAVES_HERRAMIENTA,
  herramientasEfectivas,
  rolDe,
  type ClaveHerramienta,
} from "@/lib/agent-roles";
import { agendaEnabled } from "@/server/agenda/flag";
import { leerConfigDespacho, urlSaludCerebro } from "@/server/brains/config";
import { getBrainHealth } from "@/server/bot/status";
import { multiempresaProduccion } from "@/server/empresas/flag";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, _req: Request) => {
  const soloConfiguracion = multiempresaProduccion();
  if (soloConfiguracion && !canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra puede ver el perfil del agente");
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, session.organizationId))
    .limit(1);
  const p = rows[0];
  if (!p) return apiError(404, "not_found", "Perfil del agente no encontrado");
  const estado = soloConfiguracion ? null : await estadoIaDe(session.organizationId);
  return Response.json({
    profile: {
      enabled: !soloConfiguracion && p.enabled,
      name: p.name,
      tone: p.tone,
      instructions: p.instructions,
      escalationRules: p.escalationRules,
      greeting: p.greeting,
      // 034
      role: rolDe(p.role).clave,
      tools: herramientasEfectivas(p.tools),
    },
    // 034 — Sin la bandera, la pantalla no ofrece agendar ni reprogramar.
    agendaEnabled: agendaEnabled(),
    aiConfigured: estado?.activa ?? false,
    // Por qué no (sin configurar, llave rechazada, sin saldo): la pantalla
    // Agente lo dice con el enlace a Ajustes → IA.
    aiMensaje: estado ? mensajeDeEstado(estado) : null,
  });
});

const putSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().trim().min(1).max(60).optional(),
  tone: z.string().max(500).nullable().optional(),
  instructions: z.string().max(8000).nullable().optional(),
  escalationRules: z.string().max(4000).nullable().optional(),
  greeting: z.string().max(1000).nullable().optional(),
  // 034 — Solo claves del catálogo; `escalar` se guarda siempre.
  tools: z
    .array(z.enum(CLAVES_HERRAMIENTA as [ClaveHerramienta, ...ClaveHerramienta[]]))
    .max(CLAVES_HERRAMIENTA.length)
    .optional(),
});

export const PUT = withAuth(async (session, req: Request) => {
  const soloConfiguracion = multiempresaProduccion();
  if (soloConfiguracion && !canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra puede editar el perfil del agente");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  // 036 — El interruptor decide si el CRM le despacha al cerebro. Encenderlo
  // sin un cerebro que conteste dejaría a los clientes sin respuesta creyendo
  // que la tienen; apagarlo siempre se puede.
  if (body.data.enabled === true) {
    if (soloConfiguracion) {
      return apiError(409, "agente_solo_configuracion", "En esta instalación el equipo atiende desde la Bandeja.");
    }
    const problema = await problemaDelCerebro();
    if (problema) return apiError(409, "sin_cerebro", problema);
  }

  const db = getDb();
  const { tools, ...resto } = body.data;
  const updated = await db
    .update(schema.agentProfile)
    .set({
      ...resto,
      ...(tools ? { tools: herramientasEfectivas(tools) } : {}),
      updatedAt: new Date(),
    })
    .where(scoped(schema.agentProfile.organizationId, session.organizationId))
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Perfil no encontrado");
  return Response.json({ ok: true });
});

/** Por qué no se puede encender el agente, o `null` si hay cerebro sano. */
async function problemaDelCerebro(): Promise<string | null> {
  const despacho = leerConfigDespacho();
  if (!despacho.active) {
    return despacho.problem === "sin_llave"
      ? "Falta BOT_API_KEY: sin ella el CRM no puede despacharle a tu agente."
      : despacho.problem === "url"
        ? "BRAIN_DISPATCH_URL no es una dirección válida."
        : "No hay un agente conectado. Conéctalo (BRAIN_DISPATCH_URL) y vuelve a encenderlo.";
  }
  const salud = await getBrainHealth(urlSaludCerebro() ?? undefined);
  if (salud && !salud.reachable) {
    return `Tu agente (${despacho.host}) no contesta. Revisa que esté corriendo y vuelve a intentar.`;
  }
  return null;
}
