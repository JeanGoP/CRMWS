# Desplegar este fork en Coolify

Esta copia de Vocero CRM se despliega como **repositorio Git público** usando el
`Dockerfile` de la raíz. No selecciones la imagen publicada
`ghcr.io/kevinrivm/vocero-crm`: esa imagen contiene el código del proyecto
original y no los futuros cambios de este fork.

1. Crea una base PostgreSQL 16 en Coolify, con la base de datos `vocero`. Anota
   su host interno, usuario y contraseña.
2. Crea una aplicación desde `https://github.com/JeanGoP/CRMWS.git`, rama
   `main`, con build pack **Dockerfile** y puerto `3000`.
3. Asigna el dominio público con HTTPS en Coolify. Monta almacenamiento
   persistente en `/data` para conservar adjuntos, logo e icono.
4. Configura estas variables de entorno en la aplicación:

   | Variable | Valor |
   | --- | --- |
   | `APP_BASE_URL` | `https://<dominio-del-crm>` |
   | `DATABASE_URL` | `postgresql://<usuario>:<contraseña>@<host-interno>:5432/vocero` |
   | `BETTER_AUTH_SECRET` | Cadena aleatoria de al menos 16 caracteres |
   | `ENCRYPTION_KEY` | 32 bytes aleatorios codificados en base64 |
   | `META_WEBHOOK_VERIFY_TOKEN` | Cadena aleatoria para verificar el webhook |

   Genera secretos nuevos para Coolify. No copies el `.env` de desarrollo ni
   subas claves al repositorio. `DOMAIN` solo se usa con Docker Compose y Caddy;
   `MEDIA_DIR` ya está definido en la imagen como `/data/media`.
5. Despliega la aplicación. El contenedor aplica las migraciones al arrancar;
   no configures un comando previo de migración. Comprueba que
   `https://<dominio-del-crm>/api/health` responde con `"ok":true` y que
   `/login` carga.

El primer registro crea la organización propietaria. WhatsApp se conecta luego
desde **Configuración → WhatsApp**. Para usar un agente externo, consulta
[`docs/migrar-a-2.0.md`](docs/migrar-a-2.0.md). La guía completa de instalación
del proyecto está en [`INSTALL-IA.md`](INSTALL-IA.md).
