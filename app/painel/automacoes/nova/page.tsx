import { DEFAULT_PUBLIC_REPLIES } from "@/config/rules";
import { getActivity, getConnection, getRecentMedia } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { Builder } from "../builder";
import { toMediaOption, toOther } from "../builder-data";

export default async function NovaAutomacao() {
  await requireSession();
  const [{ rules }, media, conn] = await Promise.all([getActivity(), getRecentMedia(), getConnection()]);
  return (
    <Builder
      initial={{ name: "Nova automação", posts: [], keywords: [], link: "", dm: "Oi! Aqui está o material que você pediu 👇\n\n{link}", publicReplies: [], active: false }}
      isNew
      media={media.map(toMediaOption)}
      connected={conn.state === "connected"}
      others={rules.map(toOther)}
      defaultReplies={DEFAULT_PUBLIC_REPLIES}
    />
  );
}
