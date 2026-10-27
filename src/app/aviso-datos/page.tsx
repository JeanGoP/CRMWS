import type { Metadata } from "next";
import { getSessionOrNull } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import { getBrandingContext } from "@/server/branding";
import { getPrivacyNotice, type NoticeDetails } from "@/server/privacy-notice";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Aviso de tratamiento de datos",
  robots: { index: false, follow: false },
};

/** La página sin publicar nunca revela los datos guardados en el borrador. */
function NoticeArticle({ details, status }: {
  details: NoticeDetails | null;
  status: "draft" | "preview" | "published";
}) {
  const name = details?.responsibleName || "[Nombre completo o razón social del profesional o consultorio]";
  const document = details?.responsibleDocument || "[NIT o documento]";
  const email = details?.contactEmail || "[correo de privacidad]";
  const phone = details?.contactPhone || "[teléfono de contacto]";
  const retention = details?.retention || "[plazo o criterio de conservación aprobado]";
  const policyUrl = details?.policyUrl || "[enlace a la política completa]";
  const policyLink = details?.policyUrl?.startsWith("https://") ? details.policyUrl : null;
  return (
    <main className="min-h-screen bg-subtle px-4 py-10 text-foreground sm:py-16">
      <article className="mx-auto max-w-3xl rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-text">Consultorio psicológico · Cartagena</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          {status === "published" ? "Aviso de tratamiento de datos" : "Borrador de aviso de tratamiento de datos"}
        </h1>
        {status !== "published" && (
          <div className="mt-6 rounded-lg border border-warning-soft bg-warning-tint p-4 text-sm text-warning-text">
            <strong>{status === "preview" ? "Vista previa privada." : "Borrador pendiente de aprobación."}</strong>{" "}
            {status === "preview"
              ? "Revisa los datos antes de publicar. Esta vista no sustituye la autorización del paciente."
              : "Faltan los datos del responsable y el enlace a su política completa. Este texto no debe enviarse a pacientes ni utilizarse como autorización para tratar datos sensibles."}
          </div>
        )}

        <div className="mt-8 space-y-7 leading-7">
          <section>
            <h2 className="text-lg font-semibold">¿Quién es responsable de tus datos?</h2>
            <p className="mt-2">{name}, identificado con {document}, con domicilio en Cartagena, Colombia,
              y dirección de atención en CR 68 D 1-6, es el responsable del tratamiento.
              Para consultas sobre tus datos: {email} y {phone}.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">¿Qué datos usamos y para qué?</h2>
            <p className="mt-2">Podemos recibir tu nombre, datos de contacto, mensajes y la información necesaria para solicitar,
              confirmar, reprogramar o cancelar citas, atender tus consultas y enviarte recordatorios si este servicio está activo.
              Solo solicitaremos la información necesaria para cada finalidad.</p>
            <p className="mt-2">La información sobre salud o motivos de consulta es sensible. Responder preguntas sobre datos sensibles
              es facultativo. No necesitas contar detalles clínicos para pedir una cita; evita enviarlos por este canal.
              Para tratar datos sensibles se informará la finalidad y se solicitará la autorización que corresponda,
              salvo una excepción legal.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Canales y conservación</h2>
            <p className="mt-2">Podemos comunicarnos por el canal que elijas entre los habilitados por el consultorio.
              Las conversaciones y los datos de citas pueden pasar por los proveedores de mensajería y alojamiento necesarios
              para prestar el servicio. Conservaremos los datos durante {retention}
              y aplicaremos las medidas de seguridad definidas en la política del responsable.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Tus derechos</h2>
            <p className="mt-2">Puedes conocer, actualizar y rectificar tus datos; solicitar prueba de la autorización;
              pedir información sobre su uso; presentar quejas ante la Superintendencia de Industria y Comercio;
              y, cuando proceda, revocar la autorización o solicitar la supresión. Envía tus consultas o reclamos a {email}.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Política completa y cambios</h2>
            <p className="mt-2">La política de tratamiento de datos del responsable estará disponible en{" "}
              {policyLink ? <a href={policyLink} className="text-brand-text underline underline-offset-2">{policyUrl}</a> : policyUrl}.
              Allí se explicarán con mayor detalle las finalidades, los destinatarios,
              los procedimientos para ejercer tus derechos y los cambios importantes de esta información.</p>
          </section>
        </div>

        <p className="mt-10 border-t pt-5 text-sm text-muted-foreground">
          Este aviso informativo no reemplaza la autorización previa, expresa e informada que pueda requerirse,
          en especial para datos sensibles.
        </p>
      </article>
    </main>
  );
}

/** Ruta pública de la organización de esta instancia; vista previa solo con sesión administradora. */
export default async function AvisoDatosPage({ searchParams }: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const { organizationId } = await getBrandingContext();
  const state = organizationId ? await getPrivacyNotice(organizationId) : null;
  const params = await searchParams;
  const session = params.vista === "borrador" ? await getSessionOrNull() : null;
  const preview = Boolean(session && canConfigure(session.role) && session.organizationId === organizationId);
  const status = preview ? "preview" : state?.published ? "published" : "draft";
  const details = preview ? state?.draft ?? null : state?.published ?? null;
  return <NoticeArticle details={details} status={status} />;
}
