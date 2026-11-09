"use client";

import { cloneElement, useEffect, useId, useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CarteraConfig } from "@/server/cartera/settings";

type State = { apiUrl: string; hasToken: boolean; tokenLast4: string | null; config: CarteraConfig; updatedAt: string | null };
type StageKey = keyof CarteraConfig["stages"];
const stages: { key: StageKey; label: string }[] = [
  { key: "upcoming", label: "Por vencer" },
  { key: "days1to30", label: "1 a 30 días" },
  { key: "days31to60", label: "31 a 60 días" },
  { key: "days61to90", label: "61 a 90 días" },
  { key: "days91plus", label: "Más de 90 días" },
];
const weekdays = [
  { n: 1, label: "Lun" }, { n: 2, label: "Mar" }, { n: 3, label: "Mié" },
  { n: 4, label: "Jue" }, { n: 5, label: "Vie" }, { n: 6, label: "Sáb" }, { n: 7, label: "Dom" },
];
const paymentFields: { key: keyof CarteraConfig["payment"]; label: string; type?: string; placeholder?: string }[] = [
  { key: "beneficiary", label: "Titular o beneficiario" },
  { key: "bank", label: "Banco o entidad" },
  { key: "accountType", label: "Tipo de cuenta" },
  { key: "accountNumber", label: "Número de cuenta" },
  { key: "paymentUrl", label: "Enlace de pago HTTPS", type: "url", placeholder: "https://..." },
  { key: "referenceInstructions", label: "Referencia que debe escribir el cliente" },
  { key: "otherInstructions", label: "Otras instrucciones de pago" },
];

function todayLocal(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function Field({ label, children, hint }: { label: string; children: ReactElement<{ id?: string }>; hint?: string }) {
  const id = useId();
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{cloneElement(children, { id })}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>;
}

export function CarteraClient() {
  const [state, setState] = useState<State | null>(null);
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [testIdentification, setTestIdentification] = useState("");
  const [testDate, setTestDate] = useState(todayLocal);
  const [testResult, setTestResult] = useState<{
    records: number; customers: number; invoices: number; openBalance: number; overdueBalance: number; overdueRecords: number;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void fetch("/api/settings/cartera").then(async (res) => {
      if (!res.ok) throw new Error();
      setState(await res.json() as State);
    }).catch(() => setError("No se pudo cargar la configuración de cartera"));
  }, []);

  function edit(change: (old: State) => State) {
    setState((old) => old ? change(old) : old);
    setDirty(true); setNotice(""); setError(""); setTestResult(null);
  }
  function editConfig(change: (old: CarteraConfig) => CarteraConfig) {
    edit((old) => ({ ...old, config: change(old.config) }));
  }
  function editStage(key: StageKey, patch: Partial<CarteraConfig["stages"][StageKey]>) {
    editConfig((old) => ({ ...old, stages: { ...old.stages, [key]: { ...old.stages[key], ...patch } } }));
  }
  function editPayment(key: keyof CarteraConfig["payment"], value: string) {
    editConfig((old) => ({ ...old, payment: { ...old.payment, [key]: value } }));
  }
  async function save() {
    if (!state) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/settings/cartera", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiUrl: state.apiUrl, token: token || undefined, clearToken, config: state.config }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "No se pudo guardar");
      setState(body as State); setToken(""); setClearToken(false); setDirty(false);
      setNotice("Borrador guardado. No se enviaron mensajes.");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar"); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setError(""); setNotice(""); setTestResult(null);
    try {
      const res = await fetch("/api/settings/cartera/test", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identification: testIdentification.trim(), cutDate: testDate }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Falló la consulta");
      setTestResult(body);
    } catch (err) { setError(err instanceof Error ? err.message : "Falló la consulta"); }
    finally { setBusy(false); }
  }

  if (!state) return <p className="text-sm text-muted-foreground">Cargando cartera…</p>;
  const config = state.config;
  const fieldClass = "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";
  return <div className="mx-auto max-w-4xl space-y-5 pb-12">
    <div><h1 className="text-2xl font-bold">Cartera</h1>
      <p className="mt-1 text-sm text-muted-foreground">Prepara cómo consultará Hilora los saldos y cómo deberá hablar de pagos tu agente.</p></div>
    <div className="rounded-md border border-warning-soft bg-warning-tint p-4 text-sm text-warning-text">
      Esta versión guarda un borrador y permite probar la consulta. Los cobros automáticos y la consulta de deuda por Nea aún no están activados.
    </div>
    <Card><CardHeader><CardTitle>1. Conexión de solo lectura</CardTitle><CardDescription>La credencial se guarda cifrada. No incluyas el token en la URL.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="URL HTTPS del endpoint de cartera"><Input value={state.apiUrl} type="url" maxLength={2048}
          placeholder="https://.../api/ObtenerCarteraFianncieraIden" onChange={(e) => edit((old) => ({ ...old, apiUrl: e.target.value }))} /></Field></div>
        <Field label="Token de la API" hint={state.hasToken ? `Hay un token guardado que termina en ${state.tokenLast4}. Déjalo vacío para conservarlo.` : "Pégalo aquí; después de guardar no volverá a mostrarse."}>
          <Input type="password" autoComplete="off" value={token} maxLength={500} onChange={(e) => { setToken(e.target.value); setClearToken(false); setDirty(true); }} /></Field>
        <Field label="Identificación para consulta completa" hint="Déjalo vacío si la API devuelve toda la cartera con Identificacion vacía; confirma esta regla con el proveedor.">
          <Input value={config.queryIdentifier} maxLength={30} onChange={(e) => editConfig((old) => ({ ...old, queryIdentifier: e.target.value }))} /></Field>
        {state.hasToken && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={clearToken} onChange={(e) => { setClearToken(e.target.checked); setToken(""); setDirty(true); }} />Borrar el token guardado al guardar</label>}
      </CardContent></Card>
    <Card><CardHeader><CardTitle>2. Cuándo contactar</CardTitle><CardDescription>Estas reglas no inician envíos por sí solas. La edad de la deuda viene del campo dias de la API.</CardDescription></CardHeader>
      <CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Zona horaria"><Input value={config.timezone} onChange={(e) => editConfig((old) => ({ ...old, timezone: e.target.value }))} /></Field>
        <Field label="Canal"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={config.channel}
          onChange={(e) => editConfig((old) => ({ ...old, channel: e.target.value as CarteraConfig["channel"] }))}>
          <option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option></select></Field>
        <Field label="Plantilla aprobada de WhatsApp" hint="Necesaria para iniciar conversaciones por WhatsApp."><Input value={config.templateId} maxLength={500} onChange={(e) => editConfig((old) => ({ ...old, templateId: e.target.value }))} /></Field>
        <Field label="Desde"><Input type="time" value={config.startTime} onChange={(e) => editConfig((old) => ({ ...old, startTime: e.target.value }))} /></Field>
        <Field label="Hasta"><Input type="time" value={config.endTime} onChange={(e) => editConfig((old) => ({ ...old, endTime: e.target.value }))} /></Field>
        <Field label="Máximo de avisos por mes y cliente"><Input type="number" min={1} max={31} value={config.maxMessagesPerMonth} onChange={(e) => editConfig((old) => ({ ...old, maxMessagesPerMonth: Number(e.target.value) }))} /></Field>
        <Field label="Días mínimos entre avisos"><Input type="number" min={1} max={365} value={config.minDaysBetween} onChange={(e) => editConfig((old) => ({ ...old, minDaysBetween: Number(e.target.value) }))} /></Field>
      </div><Field label="Días permitidos"><div className="flex flex-wrap gap-3">{weekdays.map((day) => <label key={day.n} className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={config.allowedDays.includes(day.n)} onChange={(e) => editConfig((old) => ({ ...old, allowedDays: e.target.checked
          ? [...old.allowedDays, day.n].sort() : old.allowedDays.filter((n) => n !== day.n) }))} />{day.label}</label>)}</div></Field></CardContent></Card>
    <Card><CardHeader><CardTitle>3. Mensajes según la edad de la deuda</CardTitle><CardDescription>Deja apagado cada tramo hasta revisar su texto y su monto mínimo.</CardDescription></CardHeader>
      <CardContent className="space-y-4">{stages.map(({ key, label }) => <div key={key} className="rounded-md border p-3 space-y-3">
        <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={config.stages[key].enabled}
          onChange={(e) => editStage(key, { enabled: e.target.checked })} />{label}</label>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]"><Field label="Saldo mínimo"><Input type="number" min={0} step="0.01" value={config.stages[key].minBalance}
          onChange={(e) => editStage(key, { minBalance: Number(e.target.value) })} /></Field>
          <Field label="Texto o instrucciones para este tramo"><textarea className={fieldClass} maxLength={4000} value={config.stages[key].message}
            onChange={(e) => editStage(key, { message: e.target.value })} /></Field></div>
      </div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>4. Cómo pagar</CardTitle><CardDescription>Solo se entregarán los datos oficiales que guardes aquí. No escribas claves bancarias.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{paymentFields.map(({ key, label, type, placeholder }) => <Field key={key} label={label}>
        {key === "referenceInstructions" || key === "otherInstructions" ? <textarea className={fieldClass} value={config.payment[key]}
          maxLength={4000} onChange={(e) => editPayment(key, e.target.value)} /> : <Input type={type ?? "text"} placeholder={placeholder} value={config.payment[key]}
          maxLength={key === "paymentUrl" ? 2048 : 500} onChange={(e) => editPayment(key, e.target.value)} />}</Field>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>5. Cómo responde el agente</CardTitle><CardDescription>Antes de mostrar una deuda debe comprobar que habla con el titular.</CardDescription></CardHeader>
      <CardContent className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">
        <Field label="Verificación del titular"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={config.identityMode}
          onChange={(e) => editConfig((old) => ({ ...old, identityMode: e.target.value as CarteraConfig["identityMode"] }))}>
          <option value="human">Revisión por una persona</option><option value="phone_and_document">Teléfono registrado y documento</option></select></Field>
        <Field label="Tono"><Input value={config.tone} maxLength={500} onChange={(e) => editConfig((old) => ({ ...old, tone: e.target.value }))} /></Field></div>
        <Field label="Cuándo pasar la conversación a una persona"><textarea className={fieldClass} value={config.escalationInstructions} maxLength={4000}
          onChange={(e) => editConfig((old) => ({ ...old, escalationInstructions: e.target.value }))} /></Field>
      </CardContent></Card>
    <div className="flex flex-wrap items-center gap-3"><Button type="button" onClick={() => void save()} disabled={busy || !dirty}>Guardar borrador</Button>
      <span className="text-xs text-muted-foreground">{state.updatedAt ? `Último guardado: ${new Date(state.updatedAt).toLocaleString("es-CO")}` : "Sin guardar"}</span></div>
    <Card><CardHeader><CardTitle>Probar consulta</CardTitle><CardDescription>Usa una identificación autorizada. Hilora solo muestra conteos y totales, sin nombres ni teléfonos.</CardDescription></CardHeader>
      <CardContent className="space-y-3"><div className="grid gap-3 sm:grid-cols-2">
        <Field label="Identificación de prueba"><Input inputMode="numeric" value={testIdentification} onChange={(e) => setTestIdentification(e.target.value)} /></Field>
        <Field label="Fecha de corte"><Input type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} /></Field></div>
        <Button type="button" variant="outline" onClick={() => void test()} disabled={busy || dirty || !state.apiUrl || !state.hasToken || !testIdentification.trim()}>
          Consultar API</Button>
        {dirty && <p className="text-xs text-muted-foreground">Guarda los cambios antes de probar.</p>}
        {testResult && <div role="status" className="rounded-md bg-brand-tint p-3 text-sm text-brand-text">
          Consulta correcta: {testResult.records} filas, {testResult.customers} clientes, {testResult.invoices} facturas.
          Saldo pendiente: {testResult.openBalance.toLocaleString("es-CO")}; vencido: {testResult.overdueBalance.toLocaleString("es-CO")} en {testResult.overdueRecords} cuotas.
        </div>}</CardContent></Card>
    {notice && <p role="status" className="text-sm text-success-text">{notice}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
