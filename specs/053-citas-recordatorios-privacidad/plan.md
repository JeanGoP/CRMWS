# Plan de implementación (registro posterior)

1. Conservar la clave interna del paso `whatsapp` para compatibilidad y resolver el nombre, enlace y estado a partir de las preferencias de canales.
2. Ampliar `calendar_settings` con enlace de aviso, interruptor y plantilla. Ampliar `booking` con intento, éxito y error. Migración aditiva 0028, sin activar nada existente.
3. Validar el encendido en el servidor y exponerlo en Ajustes → Agenda.
4. Barrer las citas próximas cada minuto desde el proceso Node. Reclamar cada cita con actualización condicional antes de enviar para evitar duplicados entre réplicas.
5. Mostrar éxito/fallo en Citas; restablecer el intento al mover la cita. Verificar con TypeScript, lint, pruebas y construcción.

## Riesgo aceptado

Si el proceso cae después de reclamar una cita y antes de enviar, queda un intento sin éxito. Se prefiere un aviso perdido, visible para el operador, a un doble mensaje automático al paciente. Una futura cola con conciliación del proveedor puede mejorar esa garantía.
