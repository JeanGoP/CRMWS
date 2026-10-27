import { describe, expect, it } from "vitest";
import { reminderText, reminderWindow } from "@/server/agenda/reminders";

describe("recordatorios de citas", () => {
  it("solo considera la primera hora de la ventana de 24 h", () => {
    const now = new Date("2026-10-27T15:00:00.000Z");
    const { earliest, latest } = reminderWindow(now);
    expect(earliest.toISOString()).toBe("2026-10-28T14:00:00.000Z");
    expect(latest.toISOString()).toBe("2026-10-28T15:00:00.000Z");
  });

  it("el aviso no divulga motivo clínico ni modalidad", () => {
    const text = reminderText("Ana", "28 oct 2026", "10:00");
    expect(text).toContain("Ana");
    expect(text).toContain("28 oct 2026");
    expect(text).toContain("10:00");
    expect(text).not.toMatch(/psicolog|terapia|diagnóstico|consulta/i);
  });
});
