"use client";

import { useCallback, useEffect, useState } from "react";
import { KbSection, type KbEntry } from "@/components/agent/agent-client";
import { fetchEmpresa } from "@/lib/empresas-cliente";

export function CatalogoClient() {
  const [entries, setEntries] = useState<KbEntry[] | null>(null);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      const response = await fetchEmpresa("/api/kb", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo cargar el catálogo.");
      const data = (await response.json()) as { entries: KbEntry[] };
      setEntries(data.entries);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b px-4 py-3 sm:px-6 sm:py-4">
        <h1 className="text-[17px] font-bold tracking-tight">Catálogo</h1>
      </header>
      <div className="max-w-3xl px-4 py-5 sm:px-6">
        {error && <p role="alert" className="mb-3 text-sm text-destructive">No se pudo cargar el catálogo.</p>}
        {entries ? <KbSection catalogo entries={entries} kbSize={null} onChanged={() => void cargar()} />
          : !error && <p role="status" className="text-sm text-muted-foreground">Cargando catálogo…</p>}
      </div>
    </div>
  );
}
