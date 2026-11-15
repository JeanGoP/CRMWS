#!/bin/sh
set -eu

APP_BASE_URL="$(node <<'NODE'
function leerUrl(nombre) {
  try { return new URL(process.env[nombre]); }
  catch { throw new Error("Falta una URL valida en " + nombre); }
}
const db = leerUrl("DATABASE_URL");
const base = leerUrl("APP_BASE_URL");
if (process.env.MULTIEMPRESA_PRODUCCION !== "on" ||
    process.env.MULTIEMPRESA_PILOTO === "on" ||
    db.protocol !== "postgresql:" ||
    db.hostname !== "hilora-db" ||
    db.port !== "5432" ||
    db.username !== "hilora_multiempresa" ||
    db.pathname !== "/hilora_multiempresa" || db.search || db.hash) {
  throw new Error("La instalacion requiere su base propia hilora-db/hilora_multiempresa.");
}
if (base.protocol === "https:" && base.port === "3000") base.port = "";
const local = process.env.HILORA_PRUEBA_LOCAL === "on" && base.origin === "http://127.0.0.1:3141";
if ((!local && base.protocol !== "https:") || base.username || base.password ||
    base.pathname !== "/" || base.search || base.hash) {
  throw new Error("Configura el origen HTTPS publico de Hilora.");
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((process.env.MULTIEMPRESA_ADMIN_EMAIL ?? "").trim())) {
  throw new Error("Configura MULTIEMPRESA_ADMIN_EMAIL antes de arrancar.");
}
for (const key of ["HILORA_ADMIN_PASSWORD", "HILORA_LLAVE_CIFRADO", "BETTER_AUTH_SECRET"]) {
  if ((process.env[key] ?? "").length < 32) throw new Error("Falta un valor seguro para " + key);
}
process.stdout.write(base.origin);
NODE
)"
export APP_BASE_URL

ENCRYPTION_KEY="$(node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(process.env.HILORA_LLAVE_CIFRADO).digest("base64"))')"
export ENCRYPTION_KEY
unset HILORA_LLAVE_CIFRADO
node /app/migrate.mjs
node /app/seed-multiempresa.mjs
unset HILORA_ADMIN_PASSWORD
exec node /app/server.js
