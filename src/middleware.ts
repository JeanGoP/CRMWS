import { NextResponse, type NextRequest } from "next/server";
import { CABECERA_EMPRESA } from "@/lib/empresas-contexto";
import { ajusteMultiempresaDisponible } from "@/lib/empresas-piloto";
import { multiempresaActiva, multiempresaCanales, multiempresaProduccion } from "@/server/empresas/flag";

const AUTH = new Set([
  "/api/auth/sign-in/email", "/api/auth/sign-up/email", "/api/auth/sign-out", "/api/auth/get-session",
  "/api/auth/change-password",
]);

const LOCALES = [
  "/api/empresas", "/api/agent", "/api/analytics", "/api/bookings",
  "/api/calendar", "/api/contacts", "/api/kb", "/api/media",
  "/api/pipeline", "/api/quick-replies", "/api/settings/branding",
  "/api/settings/team", "/api/settings/channel-preference",
];

const LECTURAS = new Set([
  "/api/events", "/api/health", "/api/templates",
  "/api/branding/favicon", "/api/branding/app-icon",
]);

const API_CANALES = new Map<string, readonly string[]>([
  ["/api/settings/channels", ["GET", "HEAD"]],
  ["/api/settings/whatsapp", ["GET", "HEAD", "PUT", "DELETE"]],
  ["/api/settings/whatsapp/test", ["POST"]],
  ["/api/settings/telegram", ["GET", "HEAD", "PUT"]],
  ["/api/settings/webhook", ["GET", "HEAD", "POST"]],
  ["/api/templates", ["POST"]],
  ["/api/templates/sync", ["POST"]],
]);

function apiCanalesDisponible(path: string, method: string): boolean {
  if (API_CANALES.get(path)?.includes(method)) return true;
  return method === "POST" &&
    /^\/api\/conversations\/[^/]+\/messages(?:\/(?:template|media|forward-image))?$/.test(path);
}

function esWebhookDeCanal(path: string, method: string): boolean {
  // Cada handler verifica las credenciales del proveedor, fuera de la sesión de Hilora.
  return (/^\/api\/webhooks\/wa\/[^/]+$/.test(path) && (method === "GET" || method === "POST")) ||
    (/^\/api\/webhooks\/telegram\/[^/]+$/.test(path) && method === "POST");
}

function apiDisponible(path: string, method: string, lectura: boolean, produccion: boolean): boolean {
  if (produccion) {
    if (path === "/api/auth/sign-up/email") return false;
    if (path === "/api/agent/profile") return lectura || method === "PUT";
    if (path === "/api/agent/profile/preset") return method === "POST";
    if (path === "/api/agent" || path.startsWith("/api/agent/")) return false;
  }
  if (path === "/api/auth/change-password") return method === "POST";
  if (AUTH.has(path)) return true;
  if (LECTURAS.has(path)) return lectura;
  if (path === "/api/settings/cartera") return true;
  if (path.endsWith("/start-conversation")) return false;
  if (path === "/api/conversations" || path.startsWith("/api/conversations/")) {
    // Se permite trabajar el hilo y sus notas. El envío de mensajes queda cerrado.
    return lectura || !path.includes("/messages");
  }
  return LOCALES.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}

export function middleware(req: NextRequest) {
  if (!multiempresaActiva()) return NextResponse.next();
  const produccion = multiempresaProduccion();
  const canales = multiempresaCanales();
  const path = req.nextUrl.pathname.replace(/\/$/, "");
  if (!path.startsWith("/api/")) {
    if (produccion && path === "/register") return NextResponse.redirect(new URL("/login", req.url));
    if (path.startsWith("/settings/")) {
      return ajusteMultiempresaDisponible(path, canales)
        ? NextResponse.next()
        : NextResponse.redirect(new URL("/settings", req.url));
    }
    if (path === "/onboarding" && produccion) return NextResponse.next();
    if (path === "/lab" || path === "/onboarding") {
      return NextResponse.redirect(new URL("/empresas", req.url));
    }
    return new NextResponse(null, { status: 404 });
  }

  if (canales && esWebhookDeCanal(path, req.method)) return NextResponse.next();
  const lectura = req.method === "GET" || req.method === "HEAD";
  if (!apiDisponible(path, req.method, lectura, produccion) && !(canales && apiCanalesDisponible(path, req.method))) {
    return NextResponse.json({ error: {
      code: produccion ? "no_disponible" : "no_disponible_piloto",
      message: produccion ? "Esta función no está habilitada en esta instalación." : "Esta función está reservada para una fase posterior del piloto",
    } }, { status: 404 });
  }
  if (!lectura && !AUTH.has(path) && !req.headers.get(CABECERA_EMPRESA)) {
    return NextResponse.json({ error: {
      code: "empresa_cambio", message: "Recarga la página para confirmar la empresa activa",
    } }, { status: 409 });
  }

  const response = NextResponse.next();
  if (!AUTH.has(path) && !path.startsWith("/api/branding/") && path !== "/api/events") {
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/settings/:path+", "/lab", "/onboarding", "/aviso-datos", "/register"],
};
