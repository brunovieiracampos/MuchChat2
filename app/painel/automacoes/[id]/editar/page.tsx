import { notFound } from "next/navigation";
import { DEFAULT_PUBLIC_REPLIES } from "@/config/rules";
import { toInput } from "@/lib/automations";
import { getActivity, getConnection, getRecentMedia } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { Builder } from "../../builder";
import { toMediaOption, toOther } from "../../builder-data";

export default async function EditarAutomacao({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const [{ rules }, media, conn] = await Promise.all([getActivity(), getRecentMedia(), getConnection()]);
  const rule = rules.find((r) => r.id === id);
  if (!rule) notFound();
  return (
    <Builder
      initial={toInput(rule)}
      updatedAt={rule.updatedAt}
      media={media.map(toMediaOption)}
      connected={conn.state === "connected"}
      others={rules.map(toOther)}
      defaultReplies={DEFAULT_PUBLIC_REPLIES}
    />
  );
}
