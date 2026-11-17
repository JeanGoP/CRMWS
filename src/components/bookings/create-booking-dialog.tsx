"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchEmpresa } from "@/lib/empresas-cliente";
import { groupSlotsByDay, longDayLabel, type DaySlot } from "@/lib/time/calendar";

type Contacto = { id: string; name: string; phone: string | null };
const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft disabled:opacity-50";

async function leer<T>(ruta: string, signal: AbortSignal): Promise<T> {
  const response = await fetchEmpresa(ruta, { signal, cache: "no-store" });
  if (!response.ok) throw new Error();
  return response.json() as Promise<T>;
}

export function CreateBookingDialog({
  initialDay,
  timezone,
  onCancel,
  onCreated,
}: {
  initialDay: string;
  timezone: string;
  onCancel: () => void;
  onCreated: (day: string, bookingId: string | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<Contacto[] | null>(null);
  const [contactId, setContactId] = useState("");
  const [contactsError, setContactsError] = useState(false);
  const [contactsAttempt, setContactsAttempt] = useState(0);
  const [slots, setSlots] = useState<DaySlot[] | null>(null);
  const [slotsError, setSlotsError] = useState(false);
  const [slotsAttempt, setSlotsAttempt] = useState(0);
  const [day, setDay] = useState(initialDay);
  const [startUtc, setStartUtc] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  useEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    return () => modal?.close();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ q: query.trim() });
    const timer = window.setTimeout(() => {
      void leer<{ contacts: Contacto[] }>(`/api/contacts?${params}`, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setContacts(data.contacts);
        })
        .catch(() => {
          if (!controller.signal.aborted) setContactsError(true);
        });
    }, query ? 220 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, contactsAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    void leer<{ slots: DaySlot[] }>("/api/calendar/availability", controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSlots(data.slots);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSlotsError(true);
      });
    return () => controller.abort();
  }, [slotsAttempt]);

  const days = useMemo(() => groupSlotsByDay(slots ?? []), [slots]);
  const dayEntry = days.find(([date]) => date === day) ?? days[0];
  const selectedDay = dayEntry?.[0] ?? "";
  const times = dayEntry?.[1] ?? [];
  const validContact = contacts?.some(({ id }) => id === contactId);
  const validTime = times.some((slot) => slot.startUtc === startUtc);

  function refreshSlots() {
    setStartUtc("");
    setSlots(null);
    setSlotsError(false);
    setSlotsAttempt((attempt) => attempt + 1);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validContact || !validTime || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const response = await fetchEmpresa("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "session", contactId, startUtc, notes: notes.trim() || null }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      booking?: { id: string };
      error?: { code?: string; message?: string };
    } | null | undefined;
    if (response?.status === 201) {
      onCreated(selectedDay, data?.booking?.id ?? null);
      return;
    }
    submitting.current = false;
    setBusy(false);
    setError(data?.error?.message ?? "No se pudo guardar la cita.");
    if (data?.error?.code === "slot_taken") refreshSlots();
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="nueva-cita-titulo"
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting.current) onCancel();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border bg-popover p-5 text-popover-foreground shadow-pop backdrop:bg-overlay"
    >
      <form onSubmit={save} className="space-y-4">
        <h3 id="nueva-cita-titulo" className="text-base font-bold">Nueva cita</h3>

        <fieldset disabled={busy} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cita-buscar-contacto">Buscar contacto</Label>
            <Input
              autoFocus
              id="cita-buscar-contacto"
              type="search"
              value={query}
              placeholder="Nombre o teléfono"
              onChange={(event) => {
                setQuery(event.target.value);
                setContactId("");
                setContacts(null);
                setContactsError(false);
              }}
            />
            <Label htmlFor="cita-contacto">Contacto</Label>
            <select id="cita-contacto" className={selectClass} value={contactId}
              onChange={(event) => setContactId(event.target.value)} disabled={!contacts?.length} required>
              <option value="">
                {contactsError ? "No se pudieron cargar los contactos" :
                  !contacts ? "Buscando…" :
                    contacts.length ? "Elige un contacto" : "Sin contactos encontrados"}
              </option>
              {contacts?.map(({ id, name, phone }) => (
                <option key={id} value={id}>{phone ? `${name} · ${phone}` : name}</option>
              ))}
            </select>
            {contactsError && (
              <Button type="button" variant="outline" size="sm" onClick={() => {
                setContactsError(false);
                setContactsAttempt((attempt) => attempt + 1);
              }}>
                Reintentar búsqueda
              </Button>
            )}
          </div>

          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cita-dia">Día</Label>
              <select id="cita-dia" className={selectClass} value={selectedDay}
                onChange={(event) => { setDay(event.target.value); setStartUtc(""); }} disabled={!days.length} required>
                {!days.length && <option value="">Sin horarios</option>}
                {days.map(([date]) => <option key={date} value={date}>{longDayLabel(date)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cita-hora">Hora disponible</Label>
              <select id="cita-hora" className={selectClass} value={startUtc}
                onChange={(event) => setStartUtc(event.target.value)} disabled={!times.length} required>
                <option value="">Elige una hora</option>
                {times.map((slot) => <option key={slot.startUtc} value={slot.startUtc}>{slot.time}</option>)}
              </select>
            </div>
          </div>
          {days.length > 0 && <p className="text-xs text-text-3">Hora del negocio ({timezone}).</p>}
          {!slots && !slotsError && <p role="status" className="text-sm text-text-3">Buscando horarios libres…</p>}
          {slots && !days.length && <p role="status" className="text-sm text-text-3">No hay horarios libres.</p>}
          {slotsError && (
            <p role="alert" className="text-sm text-danger-text">
              No se pudo comprobar la disponibilidad.{" "}
              <button type="button" className="font-semibold underline" onClick={refreshSlots}>Reintentar</button>
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cita-notas">Nota (opcional)</Label>
            <Textarea id="cita-notas" value={notes} rows={2}
              onChange={(event) => setNotes(event.target.value)} maxLength={4000} />
          </div>
        </fieldset>

        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={busy || !validContact || !validTime}>
            {busy ? "Guardando…" : "Guardar cita"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
