# Recordatorios de citas y aviso de datos

## Preparación

Instancia con `AGENDA=on`, una organización, Telegram conectado o WhatsApp conectado con plantilla de utilidad aprobada `Hola {{1}}, te recordamos tu cita del {{2}} a las {{3}}…`.

## Camino feliz

1. Abrir Ajustes → Agenda. Confirmar que el aviso de datos está vacío y el interruptor de recordatorios apagado.
2. Intentar encenderlo sin aviso: el servidor responde 422 y no guarda el encendido.
3. Guardar un enlace HTTPS al aviso aprobado. En WhatsApp, intentar encender sin plantilla aprobada: 422.
4. Elegir la plantilla, encender y guardar. Crear una cita real con conversación para más de 24 h en el futuro.
5. Al entrar en la ventana anterior a las 24 h, comprobar un solo mensaje con nombre, fecha y hora, sin motivo de consulta. Correr otra pasada: no hay un segundo mensaje.
6. Reprogramar otra cita antes de su ventana de aviso y comprobar que la nueva hora gobierna el recordatorio.

## Caminos que no envían

- Una cita cancelada, un bloqueo o una cita del Laboratorio no produce mensaje.
- Si el proveedor rechaza el envío, Citas muestra «Recordatorio no enviado» y el equipo puede abrir la conversación. El worker no reintenta automáticamente.
- Con Telegram como único canal elegido, la guía de inicio no exige WhatsApp y Ajustes → Agenda no exige plantilla de Meta.
