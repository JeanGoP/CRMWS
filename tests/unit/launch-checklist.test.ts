import { describe, expect, it } from "vitest";
import { launchChecklistFrom } from "@/server/onboarding/launch-checklist";

describe("preparación del negocio en la guía", () => {
  it("muestra aviso, recordatorios y prueba cuando hay agenda", () => {
    const checks = launchChecklistFrom({
      agenda: true, privacyNoticeUrl: null, reminderEnabled: false, labTested: true,
    });
    expect(checks.map((c) => [c.key, c.done])).toEqual([
      ["privacy", false], ["reminder", false], ["lab", true],
    ]);
    expect(checks[0]?.description).toMatch(/Falta el enlace/);
  });

  it("sin agenda no ofrece enlaces a una pantalla inexistente", () => {
    const checks = launchChecklistFrom({
      agenda: false, privacyNoticeUrl: null, reminderEnabled: false, labTested: false,
    });
    expect(checks.map((c) => c.key)).toEqual(["lab"]);
  });
});
