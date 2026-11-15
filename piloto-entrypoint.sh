#!/bin/sh
set -eu

APP_BASE_URL="$(node <<'NODE'
const source = new URL(process.env.DATABASE_URL);
const base = new URL(process.env.APP_BASE_URL);
if (process.env.MULTIEMPRESA_PILOTO !== "on" ||
    source.protocol !== "postgresql:" ||
    source.hostname !== "piloto-db" ||
    source.port !== "5432" ||
    source.username !== "hilora_piloto" ||
    source.pathname !== "/hilora_piloto" || source.search) {
  throw new Error("El arranque piloto requiere su propia base piloto-db/hilora_piloto.");
}
if (base.protocol !== "https:" && base.origin !== "http://127.0.0.1:3140") {
  throw new Error("Configura el dominio HTTPS del piloto en Coolify.");
}
// Coolify incluye el puerto interno del servicio en SERVICE_URL_HILORA_3000.
// Better Auth necesita el mismo origen público HTTPS que usa el navegador.
if (base.protocol === "https:" && base.port === "3000") base.port = "";
for (const key of ["PILOTO_ADMIN_PASSWORD", "PILOTO_LLAVE_CIFRADO", "BETTER_AUTH_SECRET"]) {
  if ((process.env[key] ?? "").length < 24) throw new Error("Falta un valor seguro para " + key);
}
process.stdout.write(base.origin);
NODE
)"
export APP_BASE_URL

ENCRYPTION_KEY="$(node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(process.env.PILOTO_LLAVE_CIFRADO).digest("base64"))')"
export ENCRYPTION_KEY
unset PILOTO_LLAVE_CIFRADO
node /app/migrate.mjs
node /app/seed-piloto.mjs
unset PILOTO_ADMIN_PASSWORD
exec node /app/server.js
