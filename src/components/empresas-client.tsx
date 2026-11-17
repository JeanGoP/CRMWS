"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchEmpresa } from "@/lib/empresas-cliente";

type Empresa = { id: string; nombre: string; rol: string };
type Panel = { empresaActivaId: string; puedeCrear: boolean; empresas: Empresa[] };

const roles: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  member: "Miembro",
};

async function cargarEmpresas(signal?: AbortSignal): Promise<Panel> {
  const response = await fetchEmpresa("/api/empresas", { signal, cache: "no-store" });
  if (!response.ok) throw new Error("No se pudieron cargar las empresas.");
  return response.json() as Promise<Panel>;
}

async function enviarFormulario(ruta: string, datos: object, mensaje: string) {
  const response = await fetchEmpresa(ruta, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(datos),
  });
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  throw new Error(body?.error?.message ?? mensaje);
}

export function EmpresasClient({ piloto = false }: { piloto?: boolean }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [intento, setIntento] = useState(0);
  const ocupado = creando || abriendo !== null;

  useEffect(() => {
    const controller = new AbortController();
    void cargarEmpresas(controller.signal)
      .then(setPanel)
      .catch(() => {
        if (!controller.signal.aborted) setError("No se pudieron cargar las empresas.");
      });
    return () => controller.abort();
  }, [intento]);

  async function crear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nuevoNombre = nombre.trim();
    if (!nuevoNombre || ocupado) return;
    setCreando(true);
    setError("");
    setAviso("");
    try {
      await enviarFormulario("/api/empresas", { nombre: nuevoNombre }, "No se pudo crear la empresa.");
      setNombre("");
      setAviso(`Se creó ${nuevoNombre}.`);
      setPanel(await cargarEmpresas());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la empresa.");
    } finally {
      setCreando(false);
    }
  }

  async function abrir(empresaId: string) {
    if (ocupado) return;
    setAbriendo(empresaId);
    setError("");
    setAviso("");
    try {
      await enviarFormulario("/api/empresas/activa", { empresaId }, "No se pudo abrir la empresa.");
      // Carga un documento nuevo para desechar los datos de la empresa anterior.
      window.location.assign("/inbox");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la empresa.");
      setAbriendo(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Empresas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {piloto ? "Piloto con datos ficticios. Elige la empresa en la que quieres trabajar." : "Elige la empresa en la que quieres trabajar."}
          </p>
        </header>

        {error && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-danger-soft bg-danger-tint px-4 py-3">
            <p role="alert" className="text-sm text-danger-text">{error}</p>
            {!panel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError("");
                  setIntento((n) => n + 1);
                }}
              >
                Reintentar
              </Button>
            )}
          </div>
        )}
        {aviso && <p role="status" className="text-sm text-success-text">{aviso}</p>}
        {!panel && !error && (
          <p role="status" className="text-sm text-muted-foreground">Cargando empresas…</p>
        )}

        {panel && (
          <div className={panel.puedeCrear ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]" : ""}>
            <section aria-label="Mis empresas">
              <ul className="divide-y overflow-hidden rounded-lg border border-border-strong bg-card">
                {panel.empresas.map((empresa) => {
                  const activa = empresa.id === panel.empresaActivaId;
                  return (
                    <li key={empresa.id} className="flex flex-wrap items-center gap-3 px-4 py-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
                        <Building2 className="h-5 w-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h2 className="break-words text-sm font-semibold">{empresa.nombre}</h2>
                          {activa && <Badge variant="success">Activa</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {roles[empresa.rol] ?? "Miembro"}
                        </p>
                      </div>
                      <div className="ml-auto flex flex-wrap items-center gap-1">
                        {activa ? (
                          <>
                            {empresa.rol === "owner" && (
                              <Link href="/settings/team" className={buttonVariants({ size: "sm", variant: "ghost" })}>
                                <Users className="h-4 w-4" aria-hidden /> Equipo
                              </Link>
                            )}
                            <Link href="/inbox" className={buttonVariants({ size: "sm", variant: "outline" })}>
                              Bandeja <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Abrir empresa ${empresa.nombre}`}
                            disabled={ocupado}
                            onClick={() => void abrir(empresa.id)}
                          >
                            {abriendo === empresa.id ? "Abriendo…" : "Abrir"}
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
                {panel.empresas.length === 0 && (
                  <li className="p-4 text-sm text-muted-foreground">Todavía no tienes empresas asignadas.</li>
                )}
              </ul>
            </section>

            {panel.puedeCrear && (
              <section className="self-start rounded-lg border border-border-strong bg-card p-5">
                <h2 className="text-base font-bold tracking-tight">Nueva empresa</h2>
                <form onSubmit={crear} className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="empresa-nombre">Nombre de la empresa</Label>
                    <Input
                      id="empresa-nombre"
                      value={nombre}
                      onChange={(event) => setNombre(event.target.value)}
                      required
                      maxLength={120}
                      disabled={ocupado}
                    />
                  </div>
                  <Button type="submit" disabled={ocupado || !nombre.trim()}>
                    <Plus className="h-4 w-4" aria-hidden />
                    {creando ? "Creando…" : "Crear empresa"}
                  </Button>
                </form>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
