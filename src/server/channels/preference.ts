import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { isChannelEnabled } from "@/server/channels/enabled";

export type ChannelPreference = { whatsapp: boolean; telegram: boolean };

/** Compatibilidad: toda organización existente conserva WhatsApp encendido. */
export async function channelPreferenceFor(organizationId: string): Promise<ChannelPreference> {
  const [row] = await getDb().select().from(schema.channelPreference)
    .where(eq(schema.channelPreference.organizationId, organizationId)).limit(1);
  return {
    whatsapp: row?.whatsappEnabled ?? true,
    telegram: isChannelEnabled("telegram") && (row?.telegramEnabled ?? false),
  };
}

export async function saveChannelPreference(
  organizationId: string,
  value: ChannelPreference
): Promise<void> {
  await getDb().insert(schema.channelPreference).values({
    organizationId,
    whatsappEnabled: value.whatsapp,
    telegramEnabled: value.telegram,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: schema.channelPreference.organizationId,
    set: {
      whatsappEnabled: value.whatsapp,
      telegramEnabled: value.telegram,
      updatedAt: new Date(),
    },
  });
}

export async function isChannelActiveForOrg(
  channel: "whatsapp" | "telegram",
  organizationId: string
): Promise<boolean> {
  if (!isChannelEnabled(channel)) return false;
  if (channel === "whatsapp" && !isChannelEnabled("telegram")) return true;
  return (await channelPreferenceFor(organizationId))[channel];
}
