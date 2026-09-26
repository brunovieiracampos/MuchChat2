import type { Rule } from "@/config/rules";
import { isNextPost, waitsNextPost } from "@/lib/match";

/**
 * "Próxima publicação": a automação fica armada (armedAt) e se prende ao primeiro post publicado depois disso.
 * Funções puras; quem busca os posts e grava a automação é o processador (webhook) e a varredura.
 */

export type PostInfo = { id: string; timestamp?: string; permalink?: string; shortcode?: string };

/** Automação ativa esperando a próxima publicação. */
export const isArmed = (r: Rule) => r.active !== false && waitsNextPost(r) && !!r.armedAt;

/** O post mais antigo publicado a partir de `armedAt` (ou null se ainda não saiu nenhum). */
export function pickNextPost(armedAt: number, media: PostInfo[]): PostInfo | null {
  const after = media
    .map((m) => ({ m, t: m.timestamp ? Date.parse(m.timestamp) : NaN }))
    .filter((x) => !Number.isNaN(x.t) && x.t >= armedAt)
    .sort((a, b) => a.t - b.t);
  return after[0]?.m ?? null;
}

/** A automação presa ao post: o marcador vira o link do post. */
export function bindToPost(rule: Rule, post: PostInfo, now: number): Rule {
  const ref = post.permalink ?? post.id;
  const posts = rule.posts.map((p) => (isNextPost(p) ? ref : p));
  return { ...rule, posts: [...new Set(posts)], armedAt: undefined, boundAt: now, updatedAt: now };
}

/**
 * Prende as automações armadas ao post certo, se ele já saiu. Devolve só as que mudaram.
 * `media` pode vir em qualquer ordem (a API lista do mais novo para o mais antigo).
 */
export function resolveArmed(rules: Rule[], media: PostInfo[], now: number): Rule[] {
  const out: Rule[] = [];
  for (const r of rules) {
    if (!isArmed(r)) continue;
    const post = pickNextPost(r.armedAt!, media);
    if (post) out.push(bindToPost(r, post, now));
  }
  return out;
}
