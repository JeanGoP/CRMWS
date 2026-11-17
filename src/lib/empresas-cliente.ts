import { CABECERA_EMPRESA, DOM_EMPRESA, EVENTO_EMPRESA } from "@/lib/empresas-contexto";

/** La empresa del documento se envía para detectar pestañas anteriores a un cambio. */
export async function fetchEmpresa(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window === "undefined") return fetch(input, init);

  const empresaId = document.getElementById(DOM_EMPRESA)?.dataset.empresaId;
  if (!empresaId) return fetch(input, init);

  const url = new URL(input instanceof Request ? input.url : input, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
    return fetch(input, init);
  }

  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set(CABECERA_EMPRESA, empresaId);
  const respuesta = await fetch(input, { ...init, headers });
  if (respuesta.ok && url.pathname === "/api/empresas/activa") {
    try {
      localStorage.setItem(EVENTO_EMPRESA, crypto.randomUUID());
    } catch {
      // La comprobación del servidor sigue activa si el navegador bloquea el almacenamiento.
    }
  }
  return respuesta;
}
