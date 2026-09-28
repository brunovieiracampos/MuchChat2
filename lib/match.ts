import { RULES, type Rule } from "@/config/rules";

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/** A palavra-chave precisa aparecer como palavra inteira (letras/números em volta não contam). */
export function hasKeyword(text: string, keyword: string): boolean {
  const t = normalize(text);
  const k = normalize(keyword).trim();
  if (!k) return false;
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Z0-9])${esc}($|[^A-Z0-9])`).test(t);
}

/** Extrai o identificador de um post: shortcode a partir de URL, ou devolve o valor como veio. */
export function postKey(p: string): string {
  const m = p.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : p.trim();
}

export type MediaRef = { id: string; shortcode?: string };

/** Marcador de "próxima publicação": ainda não é um post; vira um quando o post sair (ver lib/next-post.ts). */
export const NEXT_POST = "@next";
export const isNextPost = (p: string) => p.trim() === NEXT_POST;
export const waitsNextPost = (r: Pick<Rule, "posts">) => r.posts.some(isNextPost);

/** Marcador de publicação agendada no Much Chat ("@post:{id}"): vira o link do post quando ele é publicado. */
export const isScheduledPostMarker = (p: string) => p.trim().startsWith("@post:");
export const scheduledPostIdOf = (r: Pick<Rule, "posts">) => r.posts.find(isScheduledPostMarker)?.trim().slice(6) ?? null;
/** Marcadores que ainda não são um post de verdade. */
export const isPlaceholderPost = (p: string) => isNextPost(p) || isScheduledPostMarker(p);

export function ruleAppliesToMedia(rule: Rule, media: MediaRef): boolean {
  return rule.posts.some((p) => {
    if (isPlaceholderPost(p)) return false;
    const k = postKey(p);
    return k === "*" || k === media.id || (!!media.shortcode && k === media.shortcode);
  });
}

export function findRule(text: string, media: MediaRef, rules: Rule[] = RULES): Rule | null {
  for (const r of rules) {
    if (r.active === false) continue;
    if (!ruleAppliesToMedia(r, media)) continue;
    if (r.keywords.some((k) => hasKeyword(text, k))) return r;
  }
  return null;
}

/** Algum post da regra precisa do shortcode (URL/shortcode em vez de ID/"*")? */
export function rulesNeedShortcode(rules: Rule[] = RULES): boolean {
  return rules.some((r) => r.posts.some((p) => { const k = postKey(p); return k !== "*" && !isPlaceholderPost(p) && !/^\d+$/.test(k); }));
}
