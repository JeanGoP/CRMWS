import { NextResponse, type NextRequest } from "next/server";
import { CABECERA_EMPRESA } from "@/lib/empresas-contexto";
import { AJUSTES_DEL_PILOTO } from "@/lib/empresas-piloto";
import { multiempresaActiva, multiempresaProduccion } from "@/server/empresas/flag";

const AUTH = new Set([
  "/api/auth/sign-in/email", "/api/auth/sign-up/email", "/api/auth/sign-out", "/api/auth/get-session",
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

function apiDisponible(path: string, lectura: boolean, produccion: boolean): boolean {
  if (produccion && (path === "/api/auth/sign-up/email" || path.startsWith("/api/agent/"))) return false;
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
  const path = req.nextUrl.pathname.replace(/\/$/, "");
  if (!path.startsWith("/api/")) {
    if (produccion && path === "/register") return NextResponse.redirect(new URL("/login", req.url));
    if (path.startsWith("/settings/")) {
      return AJUSTES_DEL_PILOTO.has(path)
        ? NextResponse.next()
        : NextResponse.redirect(new URL("/settings", req.url));
    }
    if (path === "/lab" || path === "/onboarding") {
      return NextResponse.redirect(new URL("/empresas", req.url));
    }
    return new NextResponse(null, { status: 404 });
  }

  const lectura = req.method === "GET" || req.method === "HEAD";
  if (!apiDisponible(path, lectura, produccion)) {
    return NextResponse.json({ error: {
      code: produccion ? "no_disponible" : "no_disponible_piloto",
      message: produccion ? "Esta función no está habilitada en la gestión manual." : "Esta función está reservada para una fase posterior del piloto",
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
