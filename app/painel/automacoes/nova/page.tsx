import { DEFAULT_PUBLIC_REPLIES } from "@/config/rules";
import { TEMPLATES } from "@/lib/flow";
import { getActivity, getConnection, getRecentMedia } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { Builder } from "../builder";
import { toMediaOption, toOther } from "../builder-data";

export default async function NovaAutomacao() {
  await requireSession();
  const [{ rules }, media, conn] = await Promise.all([getActivity(), getRecentMedia(), getConnection()]);
  return (
    <Builder
      initial={{ name: "Nova automação", posts: [], keywords: [], link: "", steps: TEMPLATES[0].build(DEFAULT_PUBLIC_REPLIES), active: false }}
      isNew
      media={media.items.map(toMediaOption)}
      mediaNext={media.next}
      connected={conn.state === "connected"}
      others={rules.map(toOther)}
      defaultReplies={DEFAULT_PUBLIC_REPLIES}
    />
  );
}
