import { notFound } from "next/navigation";
import { TelegramClient } from "@/components/settings/telegram-client";
import { multiempresaCanales } from "@/server/empresas/flag";
import { telegramDisponible } from "@/server/telegram/disponible";

export const dynamic = "force-dynamic";
export default function TelegramSettingsPage() {
  if (!telegramDisponible()) notFound();
  return <TelegramClient gestionManual={multiempresaCanales()} />;
}
