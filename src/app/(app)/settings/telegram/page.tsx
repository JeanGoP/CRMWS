import { notFound } from "next/navigation";
import { isChannelEnabled } from "@/server/channels/enabled";
import { TelegramClient } from "@/components/settings/telegram-client";

export const dynamic = "force-dynamic";
export default function TelegramSettingsPage() {
  if (!isChannelEnabled("telegram")) notFound();
  return <TelegramClient />;
}
