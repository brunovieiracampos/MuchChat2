import "server-only";
import { TEMPLATES } from "@/lib/flow";
import { mediaPrefix, signedUrls } from "@/lib/media-store";
import { getAccount, getConnection, inAccount } from "@/lib/panel";
import type { ScheduledPost } from "@/lib/posts";
import { linkableAutomations } from "@/lib/scheduling";

/** Tudo o que o editor precisa: prefixo de envio, pré-visualizações assinadas, automações que podem ser ligadas. */
export async function editorProps(post?: ScheduledPost) {
  const [account, conn] = await Promise.all([getAccount(), getConnection()]);
  if (!account) return null;
  const [previews, automations] = await Promise.all([
    post && !post.mediaDeletedAt ? signedUrls(account.accountId, post.media.map((m) => m.path), 3600e3) : Promise.resolve({}),
    inAccount(() => linkableAutomations(post?.id)),
  ]);
  return {
    post,
    previews,
    prefix: mediaPrefix(account.accountId),
    username: conn.state === "connected" ? conn.username : account.username,
    automations: automations.map((a) => ({ id: a.id, name: a.name ?? a.id })),
    templates: TEMPLATES.map((t) => ({ id: t.id, name: t.name, desc: t.desc })),
  };
}
