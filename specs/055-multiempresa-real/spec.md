# Hilora multiempresa en producción manual

Carril ligero. La instalación se prepara en un proyecto independiente con su propia base PostgreSQL y volumen de adjuntos. Arranca solo con una cuenta de operador y el espacio **Mi empresa**, con agenda en la zona horaria de Bogotá y etapas para verificar pagos y confirmar reservas. La contraseña inicial se genera en tiempo de ejecución. El alta pública permanece cerrada y las cuentas de equipo se crean desde el espacio de su empresa.

El panel Empresas permite abrir cada espacio con una sola sesión. Citas permite registrar reservas desde el calendario interno, elegir un contacto y tomar un horario disponible. El operador puede registrar la cotización, la referencia del pago y el estado en el pipeline. Catálogo permite guardar servicios y precios.

La barra lateral ofrece **Guía de inicio** y **Agente** a quienes administran la empresa activa. La guía muestra el avance de su perfil, sus canales y su agenda interna. En Agente se guardan su nombre, comportamiento, herramientas y base de conocimiento. La atención se hace desde la Bandeja.

En producción, `MULTIEMPRESA_CANALES=on` ofrece WhatsApp Cloud API y Telegram para atención manual. Cada empresa activa sus conexiones desde **Ajustes → Canales** y puede operar con ambos canales apagados. Una empresa conecta su número de WhatsApp con las credenciales de su app de Meta y su propio bot de Telegram. Las entregas se autentican y conservan el vínculo con la empresa que las recibió para los reintentos.

En Coolify usa `/docker-compose.real.yml` en un recurso separado, con HTTPS para `hilora`, `MULTIEMPRESA_ADMIN_EMAIL` y las cinco credenciales generadas disponibles solo durante la ejecución. Copia la contraseña inicial desde `SERVICE_PASSWORD_64_HILORAACCESO`. Mantén el despliegue manual. La restauración y cualquier migración de organizaciones existentes requieren un proceso distinto.

La aceptación exige comprobar una base vacía sin datos demo, el inicio de sesión, una cita creada desde Citas y el aislamiento entre dos empresas. En desarrollo se permite usar `HILORA_PRUEBA_LOCAL=on` solo con `http://127.0.0.1:3141` y la base dedicada del compose.
