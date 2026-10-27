import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Borrador de aviso de tratamiento de datos",
  robots: { index: false, follow: false },
};

/** Página pública sin enlace de navegación: un enlace oculto no es privado. */
export default function AvisoDatosPage() {
  return (
    <main className="min-h-screen bg-subtle px-4 py-10 text-foreground sm:py-16">
      <article className="mx-auto max-w-3xl rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-text">Consultorio psicológico · Cartagena</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Borrador de aviso de tratamiento de datos</h1>
        <div className="mt-6 rounded-lg border border-warning-soft bg-warning-tint p-4 text-sm text-warning-text">
          <strong>Borrador pendiente de aprobación.</strong> Faltan los datos del responsable y el enlace a su política completa.
          Este texto no debe enviarse a pacientes ni utilizarse como autorización para tratar datos sensibles.
        </div>

        <div className="mt-8 space-y-7 leading-7">
          <section>
            <h2 className="text-lg font-semibold">¿Quién es responsable de tus datos?</h2>
            <p className="mt-2">[Nombre completo o razón social del profesional o consultorio], identificado con [NIT o documento],
              con domicilio en Cartagena, Colombia, y dirección de atención en CR 68 D 1-6, es el responsable del tratamiento.
              Para consultas sobre tus datos: [correo de privacidad] y [teléfono de contacto].</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">¿Qué datos usamos y para qué?</h2>
            <p className="mt-2">Podemos recibir tu nombre, datos de contacto, mensajes y la información necesaria para solicitar,
              confirmar, reprogramar o cancelar citas, atender tus consultas y enviarte recordatorios si este servicio está activo.
              Solo solicitaremos la información necesaria para cada finalidad.</p>
            <p className="mt-2">La información sobre salud o motivos de consulta es sensible. Responder preguntas sobre datos sensibles
              es facultativo. No necesitas contar detalles clínicos para pedir una cita. Si compartes información sensible,
              te informaremos la finalidad y solicitaremos la autorización que corresponda antes de tratarla, salvo una excepción legal.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Canales y conservación</h2>
            <p className="mt-2">Podemos comunicarnos por el canal que elijas entre los habilitados por el consultorio.
              Las conversaciones y los datos de citas pueden pasar por los proveedores de mensajería y alojamiento necesarios
              para prestar el servicio. Conservaremos los datos durante [plazo o criterio de conservación aprobado]
              y aplicaremos las medidas de seguridad definidas en la política del responsable.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Tus derechos</h2>
            <p className="mt-2">Puedes conocer, actualizar y rectificar tus datos; solicitar prueba de la autorización;
              pedir información sobre su uso; presentar quejas ante la Superintendencia de Industria y Comercio;
              y, cuando proceda, revocar la autorización o solicitar la supresión. Envía tus consultas o reclamos a
              [correo de privacidad].</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Política completa y cambios</h2>
            <p className="mt-2">La política de tratamiento de datos del responsable estará disponible en
              [enlace a la política completa]. Allí se explicarán con mayor detalle las finalidades, los destinatarios,
              los procedimientos para ejercer tus derechos y los cambios importantes de esta información.</p>
          </section>
        </div>

        <p className="mt-10 border-t pt-5 text-sm text-muted-foreground">
          Este borrador informativo no reemplaza la autorización previa, expresa e informada que pueda requerirse,
          en especial para datos sensibles.
        </p>
      </article>
    </main>
  );
}
