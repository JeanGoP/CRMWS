import { multiempresaActiva, multiempresaCanales } from "@/server/empresas/flag";

/**
 * Hook de arranque de Next. El trabajo real vive en instrumentation-node.ts
 * (import dinámico condicionado al runtime para que el bundler edge no
 * intente resolver dependencias de Node como `postgres`).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const {
      checkMediaDir,
      cleanupOrphanRuns,
      encryptLegacySecrets,
      resumeDispatch,
      resumeWebhooks,
      resumeReminders,
    } = await import("./instrumentation-node");
    await checkMediaDir();
    if (multiempresaActiva()) {
      if (multiempresaCanales()) resumeWebhooks();
      return;
    }
    await cleanupOrphanRuns();
    await encryptLegacySecrets();
    resumeDispatch();
    resumeWebhooks();
    resumeReminders();
  }
}
