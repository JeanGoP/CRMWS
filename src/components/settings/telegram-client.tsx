"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { fetchEmpresa } from "@/lib/empresas-cliente";

type Connection = { botId: string; username: string; status: string; tokenLast4: string } | null;

export function TelegramClient({ gestionManual = false }: { gestionManual?: boolean }) {
  const [connection, setConnection] = useState<Connection>(null);
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetchEmpresa("/api/settings/telegram", { signal, cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo cargar la conexión");
    const data = await response.json() as { connection: Connection; canManage: boolean };
    if (!signal?.aborted) {
      setConnection(data.connection ?? null);
      setCanManage(data.canManage);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted) setMessage("No se pudo cargar la conexión");
    });
    return () => controller.abort();
  }, [load]);

  async function connect() {
    if (!canManage || busy) return;
    setBusy(true);
    setMessage(null);
    const response = await fetchEmpresa("/api/settings/telegram", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setMessage(data?.error?.message ?? "No se pudo conectar el bot");
      if (gestionManual) void load().catch(() => undefined);
      return;
    }
    setConnection(data.connection);
    setToken("");
    setMessage("Bot conectado. Activa Telegram en Ajustes → Canales.");
  }

  return <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>Telegram</CardTitle>
      <CardDescription>
        Conecta un bot propio para recibir y responder mensajes desde la bandeja.
        {!gestionManual && " Nea también podrá contestarlos si el agente está encendido."}
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-text-2">Crea el bot con @BotFather en Telegram. Copia su token y pégalo aquí; Hilora verificará el bot y registrará el webhook automáticamente. El cliente debe escribirle primero al bot.</p>
      {connection && <p className="text-sm">Bot: <strong>@{connection.username}</strong> · {connection.status === "connected" ? "conectado" : "requiere reconexión"} · token terminado en {connection.tokenLast4}</p>}
      {canManage && <div className="space-y-2">
        <label htmlFor="telegram-token" className="text-sm font-medium">Token de @BotFather</label>
        <Input id="telegram-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        {gestionManual && connection && <p className="text-sm text-text-2">Para reconectar, usa el token de este mismo bot.</p>}
      </div>}
      {canManage === false && <p className="text-sm text-text-2">El propietario de esta empresa puede conectar o reconectar el bot.</p>}
      <div className="flex items-center gap-3">
        {canManage && <Button disabled={busy || !token.trim()} onClick={() => void connect()}>{busy ? "Conectando…" : connection ? "Reconectar bot" : "Conectar bot"}</Button>}
        <Link href="/settings/channels" className="text-sm underline">Elegir canales</Link>
      </div>
      {message && <p role="status" className="text-sm text-text-2">{message}</p>}
    </CardContent>
  </Card>;
}
