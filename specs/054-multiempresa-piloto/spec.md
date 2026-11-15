# Hilora multiempresa · Piloto

Carril ligero. El piloto reutiliza las tablas de organizaciones, membresías y sesiones. La instalación habitual conserva su flujo de un negocio con la bandera apagada.

- `MULTIEMPRESA_PILOTO=on` habilita Empresas en un entorno de prueba con PostgreSQL y archivos propios. `MULTIEMPRESA_ADMIN_EMAIL` identifica al operador que puede crear empresas.
- El operador crea una empresa con su propio equipo, pipeline y perfil. Cada cuenta puede abrir únicamente empresas en las que tiene membresía y su rol se obtiene en esa empresa.
- Las mutaciones exigen el identificador de empresa de la pantalla y lo comparan con la sesión. Cambiar de empresa recarga la aplicación y actualiza las demás pestañas abiertas.
- En el piloto se prueban bandeja, contactos, citas internas y ajustes locales con datos ficticios. Las conexiones externas, Nea y el aviso público quedan fuera del piloto.
- La aceptación requiere dos empresas, cuentas con permisos distintos y pruebas de que los identificadores de una empresa no dan acceso a la otra. La activación en una instalación con datos reales queda fuera de este piloto.

## Copia local

Usa una copia de los archivos sin el `.env`, la base ni los adjuntos del consultorio. Guarda en `.env.piloto` del piloto una URL de PostgreSQL de pruebas, una clave de sesión, una clave de cifrado de 32 bytes en base64, un token de verificación ficticio y las banderas `MULTIEMPRESA_PILOTO=on`, `AGENDA=on` y `CARTERA=on`. Usa `APP_BASE_URL=http://127.0.0.1:3139` y define el correo del operador en `MULTIEMPRESA_ADMIN_EMAIL`.

En una base nueva, define `MIGRATIONS_DIR=./drizzle` y aplica las migraciones con `node --env-file=.env.piloto scripts/migrate.mjs`. Inicia la aplicación con `node --env-file=.env.piloto node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3139`. El registro inicial solo acepta el correo del operador. El flujo de prueba en `scripts/e2e-multiempresa.mjs` requiere una base vacía y crea el consultorio ficticio y Turismo Demo. Se ejecuta en CI contra una base desechable.

En Turismo Demo el catálogo vive en Agente → Knowledge base. La tarjeta de venta lleva el valor cotizado en el Pipeline. El operador revisa el comprobante de prueba en **Pago por verificar** y mueve la tarjeta a **Reserva confirmada** después de verificarlo.

Con la semilla cargada en la copia local, `node --env-file=.env.piloto scripts/e2e-multiempresa-medios.mjs` verifica el aislamiento del hilo y comprobante ficticio de Turismo Demo.
