# 053 — Preparación de citas, recordatorios y aviso de datos

**Carril:** ciclo completo (migración 0028). Documento escrito después de iniciar la implementación; registra el comportamiento y las decisiones, no pretende ser una especificación previa.

## Problema

La guía inicial exige WhatsApp incluso cuando el negocio elige solo Telegram. La agenda no permite programar recordatorios ni registrar el enlace al aviso de tratamiento de datos. Para el consultorio, el aviso y la plantilla de Meta aún están pendientes.

## Comportamiento verificable

1. La guía muestra el canal elegido: WhatsApp, Telegram o ambos. Solo queda lista si están conectados todos los canales seleccionados.
2. El propietario o un administrador puede guardar en Ajustes → Agenda un enlace HTTPS al aviso aprobado del negocio. El campo comienza vacío.
3. Los recordatorios empiezan apagados. Al habilitarlos, Hilora exige el enlace al aviso y, si WhatsApp está activo, una plantilla de utilidad aprobada con tres variables (nombre, fecha, hora).
4. La cita real, agendada, con conversación de WhatsApp o Telegram recibe un solo intento de recordatorio en la primera hora de la ventana anterior a las 24 h de su inicio. Las citas de prueba, bloqueos y citas canceladas no reciben mensajes.
5. WhatsApp usa la plantilla aprobada. Telegram recibe un texto breve sin motivo de consulta. Un fallo queda visible en la cita para que el equipo contacte al paciente; no hay reintento automático que pueda duplicar un mensaje.
6. Reprogramar una cita restablece su estado de recordatorio para el nuevo horario.

## Límites deliberados

- El enlace al aviso no equivale a consentimiento individual. El consultorio debe aprobar su contenido y su proceso de autorización antes de habilitar avisos a pacientes reales.
- Las respuestas del paciente pidiendo cambio llegan a la Bandeja; el equipo reprograma desde Citas. No se crea un enlace público de autogestión en esta entrega.
- La confirmación de una reserva sigue a cargo del flujo que la crea o del equipo; este cambio añade el recordatorio previo.
