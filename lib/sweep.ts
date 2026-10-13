import { listAutomations, storeAutomation } from "@/lib/automations";
import { resolveArmed } from "@/lib/next-post";
import { ruleAppliesToMedia } from "@/lib/match";
import { listComments, listRecentMedia } from "@/lib/instagram";
import { processComment, type Result } from "@/lib/processor";
import { activeAds } from "@/lib/ad-posts";

/** Varre posts dos últimos 7 dias e processa comentários que o webhook não pegou. */
export async function sweep(): Promise<{ media: number; comments: number; results: Partial<Record<Result, number>>; errors: string[] }> {
  const since = Date.now() - 7 * 864e5;
  const media = (await listRecentMedia(25)).filter((m) => !m.timestamp || Date.parse(m.timestamp) >= since);
  // "Próxima publicação": prende as automações armadas ao post que já saiu, antes de filtrar.
  const all = await listAutomations();
  const bound = resolveArmed(all, media, Date.now());
  for (const r of bound) await storeAutomation(r);
  const active = all.map((r) => bound.find((b) => b.id === r.id) ?? r).filter((r) => r.active !== false);
  const results: Partial<Record<Result, number>> = {};
  const errors: string[] = [];
  let count = 0;
  const sweepMedia = async (mediaId: string) => {
    let comments;
    try { comments = await listComments(mediaId); } catch (e) { errors.push(`${mediaId}: ${String(e)}`); return; }
    for (const c of comments) {
      count++;
      try {
        const r = await processComment({
          id: c.id,
          text: c.text ?? "",
          mediaId,
          fromId: c.from?.id,
          username: c.username ?? c.from?.username,
          timestamp: c.timestamp ? Date.parse(c.timestamp) : undefined,
        }, "sweep");
        results[r] = (results[r] ?? 0) + 1;
      } catch (e) { errors.push(`${c.id}: ${String(e)}`); }
    }
  };
  for (const m of media) {
    if (!active.some((r) => ruleAppliesToMedia(r, { id: m.id, shortcode: m.shortcode }))) continue;
    await sweepMedia(m.id);
  }
  // Anúncios (posts impulsionados) não aparecem na lista de posts: lê os que já receberam comentário.
  let ads: string[] = [];
  try { ads = await activeAds(Date.now()); } catch (e) { errors.push(`anúncios: ${String(e)}`); }
  for (const adId of ads) await sweepMedia(adId);
  return { media: media.length, comments: count, results, errors };
}
