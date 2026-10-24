# 053 — Ocupación de Google Calendar al agendar

## Necesidad

Un profesional que lleva su agenda en Google Calendar necesita que el agente
ofrezca solo huecos que estén libres tanto en el CRM como en ese calendario.

## Comportamiento

- Con el conector Google seleccionado, la disponibilidad descuenta eventos
  ocupados, recurrentes y de día completo del calendario conectado.
- Un evento marcado como libre y uno cancelado no bloquean horarios.
- La consulta se repite al confirmar una cita o reprogramarla. Al mover una
  cita, su propio evento de Google no la bloquea.
- Si faltan credenciales o Google no responde, no se ofrecen ni reservan
  nuevos horarios. Las citas ya confirmadas permanecen en el CRM.
- El cálculo usa solo identificadores y rangos de tiempo; no guarda ni entrega
  al agente títulos, descripciones o asistentes de eventos externos.
- Los conectores de enlace fijo y Zoom conservan la disponibilidad local.

## Pruebas

- Consulta paginada, evento de día completo, evento libre, cancelado y evento
  propio excluido al reprogramar.
- Error del proveedor no produce una lista falsa de horarios disponibles.
