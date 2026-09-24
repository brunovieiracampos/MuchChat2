import { listAutomations } from "@/lib/automations";
import { ruleAppliesToMedia } from "@/lib/match";
import { listComments, listRecentMedia } from "@/lib/instagram";
import { processComment, type Result } from "@/lib/processor";

/** Varre posts dos últimos 7 dias e processa comentários que o webhook não pegou. */
export async function sweep(): Promise<{ media: number; comments: number; results: Partial<Record<Result, number>>; errors: string[] }> {
  const since = Date.now() - 7 * 864e5;
  const media = (await listRecentMedia(25)).filter((m) => !m.timestamp || Date.parse(m.timestamp) >= since);
  const active = (await listAutomations()).filter((r) => r.active !== false);
  const results: Partial<Record<Result, number>> = {};
  const errors: string[] = [];
  let count = 0;
  for (const m of media) {
    if (!active.some((r) => ruleAppliesToMedia(r, { id: m.id, shortcode: m.shortcode }))) continue;
    let comments;
    try { comments = await listComments(m.id); } catch (e) { errors.push(`${m.id}: ${String(e)}`); continue; }
    for (const c of comments) {
      count++;
      try {
        const r = await processComment({
          id: c.id,
          text: c.text ?? "",
          mediaId: m.id,
          fromId: c.from?.id,
          username: c.username ?? c.from?.username,
          timestamp: c.timestamp ? Date.parse(c.timestamp) : undefined,
        }, "sweep");
        results[r] = (results[r] ?? 0) + 1;
      } catch (e) { errors.push(`${c.id}: ${String(e)}`); }
    }
  }
  return { media: media.length, comments: count, results, errors };
}
