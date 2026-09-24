import type { IncomingClick, IncomingComment } from "@/lib/processor";

/**
 * Extrai comentários do payload de webhook do Instagram (campo "comments").
 * Tolerante aos formatos documentados: entry.changes[] ou entry.field/value direto;
 * id do comentário em value.id ou value.comment_id; payload solto ou dentro de array.
 */
export function extractComments(payload: any): IncomingComment[] {
  const out: IncomingComment[] = [];
  const payloads = Array.isArray(payload) ? payload : [payload];
  for (const p of payloads) {
    if (!p || !Array.isArray(p.entry)) continue;
    for (const entry of p.entry) {
      const t = typeof entry?.time === "number" ? (entry.time > 1e12 ? entry.time : entry.time * 1000) : undefined;
      const changes = Array.isArray(entry?.changes) ? entry.changes : entry?.field ? [{ field: entry.field, value: entry.value }] : [];
      for (const ch of changes) {
        if (ch?.field !== "comments" && ch?.field !== "live_comments") continue;
        const v = ch.value ?? {};
        const id = v.id ?? v.comment_id;
        if (!id || !v.media?.id) continue;
        out.push({
          id: String(id),
          text: String(v.text ?? ""),
          mediaId: String(v.media.id),
          fromId: v.from?.id ? String(v.from.id) : undefined,
          username: v.from?.username,
          parentId: v.parent_id,
          timestamp: t,
        });
      }
    }
  }
  return out;
}

/**
 * Extrai cliques em botões (messaging_postbacks), respostas rápidas e mensagens de texto
 * (campo "messages") — o texto serve de alternativa quando o Instagram não aceita o botão.
 * Ignora ecos (mensagens enviadas pela própria conta).
 */
export function extractClicks(payload: any): IncomingClick[] {
  const out: IncomingClick[] = [];
  const payloads = Array.isArray(payload) ? payload : [payload];
  for (const p of payloads) {
    if (!p || !Array.isArray(p.entry)) continue;
    for (const entry of p.entry) {
      for (const m of Array.isArray(entry?.messaging) ? entry.messaging : []) {
        const igsid = m?.sender?.id ? String(m.sender.id) : "";
        if (!igsid || m.message?.is_echo) continue;
        if (m.postback?.payload) out.push({ igsid, payload: String(m.postback.payload) });
        else if (m.message?.quick_reply?.payload) out.push({ igsid, payload: String(m.message.quick_reply.payload) });
        else if (typeof m.message?.text === "string") out.push({ igsid, text: m.message.text });
      }
    }
  }
  return out;
}
