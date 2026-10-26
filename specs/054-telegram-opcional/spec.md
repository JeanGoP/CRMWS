# 054 — Telegram como canal opcional por empresa

## Necesidad

El propietario de cada empresa elige dentro de Hilora si atiende WhatsApp,
Telegram o ambos. Telegram usa la Bot API oficial y comparte bandeja, contactos,
pipeline y despacho a Nea con los demás canales.

## Comportamiento

- `CHANNELS` habilita la disponibilidad de Telegram en la instalación. Sin
  `telegram`, sus pantallas y webhook responden 404.
- La elección de cada empresa vive en Ajustes → Canales. Por defecto WhatsApp
  sigue activo y Telegram apagado. No se pueden apagar ambos; Telegram necesita
  primero un bot conectado.
- En Ajustes → Telegram, el propietario pega el token de BotFather. Hilora
  verifica el bot, registra un webhook HTTPS con secreto y cifra el token y el
  secreto en PostgreSQL. Un bot solo puede pertenecer a una empresa.
- El webhook comprueba el secreto antes de guardar el evento durable. Solo
  procesa mensajes de texto en chats privados iniciados por el cliente.
- Los mensajes aparecen en la bandeja; el equipo y Nea responden por el mismo
  flujo de envío. Los canales desactivados no reciben ni envían mensajes.
- La primera entrega es de texto. Adjuntos y grupos quedan pendientes.

## Datos y contrato

La migración `0027_telegram_channel.sql` crea `telegram_credentials` y
`channel_preference`. Los contactos y mensajes usan el canal `telegram` y una
identidad `tg:<botId>:<chatId>` para impedir cruces entre bots. El despacho a
Nea conserva el cuerpo actual y añade `telegram` como valor de `channel`.

## Comprobación

Pruebas de normalización, firma del webhook, elección de canales y regresión
de citas de WhatsApp. En una instancia de prueba: conectar un bot, enviarle
un mensaje privado, responder desde la bandeja, probar Nea y comprobar que
apagar cada canal detiene su recepción sin borrar el historial.
