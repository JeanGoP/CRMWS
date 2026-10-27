"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CONNECTOR_META,
  CONNECTOR_ORDER,
  type ConnectorId,
} from "@/lib/agenda-connectors";
import { ConnectorCredentials } from "@/components/settings/connector-credentials";
import { countVariables } from "@/lib/templates";

/**
 * 015 — Ajustes → Agenda: cuándo atiende el negocio y cómo se entrega la
 * reunión.
 */

type Interval = { start: string; end: string };
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type WeeklyHours = Partial<Record<DayKey, Interval[]>>;

type Settings = {
  weeklyHours: WeeklyHours;
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  timezone: string;
  connector: ConnectorId;
  meetingLink: string | null;
  privacyNoticeUrl: string | null;
  reminderEnabled: boolean;
  reminderTemplateId: string | null;
};

type ReminderTemplate = { id: string; name: string; body: string; status: string; category: string };

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Lunes" },
  { key: "tue", label: "Martes" },
  { key: "wed", label: "Miércoles" },
  { key: "thu", label: "Jueves" },
  { key: "fri", label: "Viernes" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

const DEFAULT_INTERVAL: Interval = { start: "09:00", end: "18:00" };

export function AgendaClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [slots, setSlots] = useState<{ label: string }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [whatsappActive, setWhatsappActive] = useState(true);
  const [telegramActive, setTelegramActive] = useState(false);

  useEffect(() => {
    void (async () => {
      const [cfg, avail] = await Promise.all([
        fetch("/api/calendar/settings").catch(() => null),
        fetch("/api/calendar/availability").catch(() => null),
      ]);
      if (cfg?.ok) {
        const data = (await cfg.json()) as { settings: Settings };
        setSettings(data.settings);
      }
      if (avail?.ok) {
        const data = (await avail.json()) as { slots: { label: string }[] };
        setSlots(data.slots.slice(0, 5));
      } else {
        setSlots([]);
      }
      const templateRes = await fetch("/api/templates").catch(() => null);
      if (templateRes?.ok) {
        const data = (await templateRes.json()) as { templates: ReminderTemplate[] };
        setTemplates(data.templates.filter((t) => t.status === "approved" && t.category === "UTILITY" && countVariables(t.body) === 3));
      }
      const channelRes = await fetch("/api/settings/channel-preference").catch(() => null);
      if (channelRes?.ok) {
        const data = (await channelRes.json()) as { preference: { whatsapp: boolean; telegram: boolean } };
        setWhatsappActive(data.preference.whatsapp);
        setTelegramActive(data.preference.telegram);
      }
    })();
  }, []);

  async function refreshPreview() {
    const res = await fetch("/api/calendar/availability").catch(() => null);
    if (!res?.ok) return setSlots([]);
    const data = (await res.json()) as { slots: { label: string }[] };
    setSlots(data.slots.slice(0, 5));
  }

  function patch(next: Partial<Settings>) {
    setSettings((s) => (s ? { ...s, ...next } : s));
    setSaved(false);
  }

  function toggleDay(day: DayKey) {
    if (!settings) return;
    const current = settings.weeklyHours[day];
    const weeklyHours = { ...settings.weeklyHours };
    if (current && current.length > 0) delete weeklyHours[day];
    else weeklyHours[day] = [{ ...DEFAULT_INTERVAL }];
    patch({ weeklyHours });
  }

  function setIntervalAt(day: DayKey, index: number, next: Partial<Interval>) {
    if (!settings) return;
    const intervals = [...(settings.weeklyHours[day] ?? [])];
    const current = intervals[index];
    if (!current) return;
    intervals[index] = { ...current, ...next };
    patch({ weeklyHours: { ...settings.weeklyHours, [day]: intervals } });
  }

  function addInterval(day: DayKey) {
    if (!settings) return;
    const intervals = [...(settings.weeklyHours[day] ?? [])];
    intervals.push({ start: "16:00", end: "18:00" });
    patch({ weeklyHours: { ...settings.weeklyHours, [day]: intervals } });
  }

  function removeInterval(day: DayKey, index: number) {
    if (!settings) return;
    const intervals = (settings.weeklyHours[day] ?? []).filter(
      (_, i) => i !== index
    );
    const weeklyHours = { ...settings.weeklyHours };
    if (intervals.length === 0) delete weeklyHours[day];
    else weeklyHours[day] = intervals;
    patch({ weeklyHours });
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/calendar/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        weeklyHours: settings.weeklyHours,
        slotMinutes: settings.slotMinutes,
        bufferMinutes: settings.bufferMinutes,
        minNoticeHours: settings.minNoticeHours,
        maxDaysAhead: settings.maxDaysAhead,
        timezone: settings.timezone.trim(),
        connector: settings.connector,
        meetingLink: settings.meetingLink?.trim()
          ? settings.meetingLink.trim()
          : null,
        privacyNoticeUrl: settings.privacyNoticeUrl?.trim() || null,
        reminderEnabled: settings.reminderEnabled,
        reminderTemplateId: settings.reminderTemplateId,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo guardar");
      return;
    }
    const data = (await res.json()) as { settings: Settings };
    setSettings(data.settings);
    setSaved(true);
    void refreshPreview();
  }

  if (!settings) return <p className="text-sm text-text-3">Cargando…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Horario de atención</CardTitle>
          <CardDescription>
            En qué franjas puede agendarte un cliente. Las horas son las de tu
            zona; un día sin franjas está cerrado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {DAYS.map((day) => {
            const intervals = settings.weeklyHours[day.key] ?? [];
            const open = intervals.length > 0;
            return (
              <div key={day.key} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
                <button
                  type="button"
                  onClick={() => toggleDay(day.key)}
                  className={cn(
                    "w-24 shrink-0 rounded-sm px-2 py-1 text-left text-sm font-medium transition-colors sm:mt-1",
                    open
                      ? "bg-brand-tint text-brand-text"
                      : "text-text-3 hover:bg-accent"
                  )}
                >
                  {day.label}
                </button>
                <div className="flex-1 space-y-1.5">
                  {!open && <span className="text-sm text-text-3">Cerrado</span>}
                  {intervals.map((iv, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={iv.start}
                        onChange={(e) =>
                          setIntervalAt(day.key, i, { start: e.target.value })
                        }
                        className="min-w-0 flex-1 sm:w-36 sm:flex-none"
                      />
                      <span className="text-text-3">a</span>
                      <Input
                        type="time"
                        value={iv.end}
                        onChange={(e) =>
                          setIntervalAt(day.key, i, { end: e.target.value })
                        }
                        className="min-w-0 flex-1 sm:w-36 sm:flex-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeInterval(day.key, i)}
                        className="text-sm text-text-3 hover:text-foreground"
                        aria-label="Quitar franja"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {open && (
                    <button
                      type="button"
                      onClick={() => addInterval(day.key)}
                      className="text-xs text-brand-text hover:underline"
                    >
                      + otra franja
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cómo se generan los huecos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="slot">Duración de la cita (min)</Label>
            <Input
              id="slot"
              type="number"
              min={10}
              max={240}
              value={settings.slotMinutes}
              onChange={(e) => patch({ slotMinutes: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="buffer">Respiro entre citas (min)</Label>
            <Input
              id="buffer"
              type="number"
              min={0}
              max={120}
              value={settings.bufferMinutes}
              onChange={(e) => patch({ bufferMinutes: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notice">Aviso mínimo (horas)</Label>
            <Input
              id="notice"
              type="number"
              min={0}
              max={72}
              value={settings.minNoticeHours}
              onChange={(e) => patch({ minNoticeHours: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ahead">Agenda abierta (días)</Label>
            <Input
              id="ahead"
              type="number"
              min={1}
              max={60}
              value={settings.maxDaysAhead}
              onChange={(e) => patch({ maxDaysAhead: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="tz">Zona horaria</Label>
            <Input
              id="tz"
              value={settings.timezone}
              onChange={(e) => patch({ timezone: e.target.value })}
              placeholder="America/Mexico_City"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calendario para las citas</CardTitle>
          <CardDescription>
            Elige dónde consultar la disponibilidad y guardar nuevas citas. El
            calendario interno funciona sin conectar cuentas externas. Google
            y Microsoft son opcionales y requieren conectar la cuenta de cada negocio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {CONNECTOR_ORDER.map((id) => {
            const meta = CONNECTOR_META[id];
            const active = settings.connector === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => patch({ connector: id })}
                className={cn(
                  "block w-full rounded-sm border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-brand bg-brand-tint"
                    : "border-border hover:bg-accent"
                )}
              >
                <span
                  className={cn(
                    "block text-sm font-semibold",
                    active && "text-brand-text"
                  )}
                >
                  {meta.label}
                  {!meta.external && (
                    <span className="ml-2 text-[11px] font-normal text-text-3">
                      sin dependencias
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-text-2">
                  {meta.description}
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {settings.connector === "enlace-fijo" && (
        <Card>
          <CardHeader>
            <CardTitle>Enlace fijo opcional</CardTitle>
            <CardDescription>
              Se comparte tal cual al confirmar una cita. Si lo dejas vacío, las
              citas se agendan igual y sin enlace — nadie promete un enlace que
              no existe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              value={settings.meetingLink ?? ""}
              onChange={(e) => patch({ meetingLink: e.target.value })}
              placeholder="https://…  (opcional)"
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Aviso de tratamiento de datos</CardTitle>
          <CardDescription>
            Pega aquí el enlace al aviso aprobado por tu consultorio.
            Hilora no redacta ni envía un aviso legal por su cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="privacy-notice">Enlace HTTPS del aviso</Label>
          <Input id="privacy-notice" type="url" placeholder="https://…" value={settings.privacyNoticeUrl ?? ""}
            onChange={(e) => patch({ privacyNoticeUrl: e.target.value })} />
          {!settings.privacyNoticeUrl && <p className="text-sm text-warning-text">Pendiente: completa el aviso antes de activar recordatorios para pacientes.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recordatorio de citas</CardTitle>
          <CardDescription>
            Un aviso breve 24 horas antes de la cita, sin mencionar motivos de consulta.
            El cliente puede responder para pedir un cambio; el equipo gestiona la reprogramación en Citas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.reminderEnabled}
              onChange={(e) => patch({ reminderEnabled: e.target.checked })} />
            Enviar recordatorios automáticamente
          </label>
          {whatsappActive && <div className="space-y-1.5">
            <Label htmlFor="reminder-template">Plantilla aprobada para WhatsApp</Label>
            <select id="reminder-template" className="w-full rounded-md border bg-background p-2 text-sm"
              value={settings.reminderTemplateId ?? ""}
              onChange={(e) => patch({ reminderTemplateId: e.target.value || null })}>
              <option value="">Sin plantilla</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {templates.length === 0 && <p className="text-sm text-muted-foreground">
              Aún no tienes una plantilla de utilidad aprobada con nombre, fecha y hora.
              {telegramActive ? " Telegram puede enviar sus recordatorios mientras tanto; WhatsApp esperará la plantilla. " : " "}
              <Link href="/settings/templates" className="underline">Crear plantilla</Link>
            </p>}
          </div>}
          {telegramActive && <p className="text-sm text-muted-foreground">Telegram enviará un mensaje de texto breve sin plantilla de Meta.</p>}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        {saved && <span className="text-sm text-brand-text">Guardado</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {/* Las credenciales se guardan por su cuenta, no con el botón de arriba:
          se validan contra el proveedor antes de tocar la base. */}
      {settings.connector !== "enlace-fijo" && (
        <ConnectorCredentials connector={settings.connector} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Próximos huecos</CardTitle>
          <CardDescription>
            Lo que se le ofrecería a un cliente ahora mismo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {slots === null && <p className="text-sm text-text-3">Calculando…</p>}
          {slots?.length === 0 && (
            <p className="text-sm text-text-3">
              Sin huecos: revisa el horario, el aviso mínimo o si ya está todo
              ocupado.
            </p>
          )}
          {slots && slots.length > 0 && (
            <ul className="space-y-1 text-sm">
              {slots.map((s, i) => (
                <li key={i}>{s.label}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
