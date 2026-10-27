"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NoticeDetails } from "@/server/privacy-notice";

const EMPTY: NoticeDetails = {
  responsibleName: "", responsibleDocument: "", contactEmail: "",
  contactPhone: "", retention: "", policyUrl: "",
};

const FIELDS: { key: keyof NoticeDetails; label: string; hint: string; type?: string }[] = [
  { key: "responsibleName", label: "Nombre completo o razón social", hint: "Profesional o consultorio responsable" },
  { key: "responsibleDocument", label: "NIT o documento del responsable", hint: "Se mostrará en la página pública" },
  { key: "contactEmail", label: "Correo para solicitudes de privacidad", hint: "Se mostrará en la página pública", type: "email" },
  { key: "contactPhone", label: "Teléfono de contacto", hint: "Se mostrará en la página pública", type: "tel" },
  { key: "retention", label: "Plazo o criterio de conservación", hint: "Ejemplo: según la política y las obligaciones aplicables" },
  { key: "policyUrl", label: "Enlace HTTPS a la política completa", hint: "https://…", type: "url" },
];

export function PrivacyNoticeCard({
  currentUrl, onPublished,
}: { currentUrl: string | null; onPublished: (url: string) => void }) {
  const [draft, setDraft] = useState<NoticeDetails>(EMPTY);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings/privacy-notice").catch(() => null);
      if (!res?.ok) { setError("No se pudo cargar el aviso"); return; }
      const state = (await res.json()) as { draft: NoticeDetails; publishedAt: string | null };
      setDraft(state.draft);
      setPublishedAt(state.publishedAt);
      setLoaded(true);
    })();
  }, []);

  function update(key: keyof NoticeDetails, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setConfirmed(false);
    setError("");
  }

  async function saveDraft() {
    setBusy(true); setError("");
    const res = await fetch("/api/settings/privacy-notice", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "No se pudo guardar el borrador");
      return;
    }
    const body = (await res.json()) as { draft: NoticeDetails };
    setDraft(body.draft);
    setSaved(true);
  }

  async function publish() {
    setBusy(true); setError("");
    const res = await fetch("/api/settings/privacy-notice", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "No se pudo publicar el aviso");
      return;
    }
    const body = (await res.json()) as { publishedAt: string; url: string };
    setPublishedAt(body.publishedAt);
    setConfirmed(false);
    onPublished(body.url);
  }

  const complete = Object.values(draft).every((value) => value.trim().length > 0);
  return <Card>
    <CardHeader>
      <CardTitle>Aviso de tratamiento de datos</CardTitle>
      <CardDescription>
        Completa el aviso de tu consultorio. Guardar el borrador no lo publica.
        Al publicarlo, el nombre, documento y contactos quedarán visibles para quien tenga el enlace.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(({ key, label, hint, type }) => <div key={key} className="space-y-1">
          <Label htmlFor={`notice-${key}`}>{label}</Label>
          <Input id={`notice-${key}`} type={type ?? "text"} value={draft[key]}
            placeholder={hint} maxLength={key === "policyUrl" ? 2048 : key === "retention" ? 500
              : key === "responsibleDocument" ? 60 : key === "contactPhone" ? 50
              : key === "responsibleName" ? 180 : 254}
            onChange={(event) => update(key, event.target.value)} />
        </div>)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => void saveDraft()} disabled={busy || saved}>
          Guardar borrador
        </Button>
        {saved && loaded ? <Link href="/aviso-datos?vista=borrador" target="_blank" rel="noopener noreferrer"
          className="text-sm text-brand-text underline underline-offset-2">Vista previa privada</Link>
          : <span className="text-sm text-muted-foreground">Guarda para ver la vista previa</span>}
        <Link href="/aviso-datos" target="_blank" rel="noopener noreferrer"
          className="text-sm text-brand-text underline underline-offset-2">Ver página pública</Link>
      </div>
      {saved && loaded && <p className="text-sm text-success-text">Borrador guardado</p>}
      <p className="text-sm text-muted-foreground">
        {publishedAt ? "Hay una versión publicada. Los cambios nuevos no la modifican hasta volver a publicar."
          : "Aún no hay una versión publicada del aviso interno."}
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>Revisé el texto y autorizo publicar estos datos del responsable en el enlace del consultorio.</span>
      </label>
      <Button type="button" onClick={() => void publish()} disabled={busy || !loaded || !saved || !complete || !confirmed}>
        {publishedAt ? "Publicar nueva versión" : "Publicar aviso"}
      </Button>
      {!saved && <p className="text-sm text-warning-text">Guarda el borrador antes de publicarlo.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {currentUrl && <details className="text-sm text-muted-foreground">
        <summary>Enlace de aviso configurado en Agenda</summary>
        <p className="mt-1 break-all">{currentUrl}</p>
      </details>}
    </CardContent>
  </Card>;
}
