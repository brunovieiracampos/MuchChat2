import { getStore } from "@/lib/store";

/**
 * Post impulsionado: para o Instagram o anúncio é outra publicação (id e link próprios, tipo "AD").
 * Comentários feitos nele chegam com o id do anúncio e não aparecem nos comentários do post original,
 * e o anúncio não aparece na lista de posts do perfil. Aqui fica a ligação anúncio → post original.
 */

/** Post do perfil que pode ser o original de um anúncio. */
export type AdCandidate = { id: string; shortcode?: string; timestamp?: string; caption?: string };
export type OriginalPost = { id: string; shortcode?: string };
type KnownAd = OriginalPost & { at: number };

const ADS_KEY = "ads";
/** Anúncio sem comentário novo há mais tempo que isso sai da varredura. */
const KNOWN_MS = 30 * 864e5;

const sameCaption = (a?: string, b?: string) => !!a?.trim() && a.trim() === b?.trim();

/** O impulsionamento copia a legenda: o original é o post mais recente com a mesma legenda, publicado antes do anúncio. */
export function pickOriginal(ad: { caption?: string; timestamp?: string }, posts: AdCandidate[]): AdCandidate | null {
  const adTime = ad.timestamp ? Date.parse(ad.timestamp) : NaN;
  const time = (p: AdCandidate) => (p.timestamp ? Date.parse(p.timestamp) : NaN);
  const before = posts
    .filter((p) => sameCaption(p.caption, ad.caption))
    .filter((p) => Number.isNaN(adTime) || Number.isNaN(time(p)) || time(p) <= adTime)
    .sort((a, b) => (time(b) || 0) - (time(a) || 0));
  return before[0] ?? null;
}

// O Redis devolve o valor já convertido; a memória (testes e dev sem Redis) devolve o que foi gravado.
function parse(v: unknown): KnownAd | null {
  let o = v;
  if (typeof v === "string") { try { o = JSON.parse(v); } catch { return null; } }
  if (!o || typeof o !== "object") return null;
  const k = o as Partial<KnownAd>;
  return typeof k.id === "string" && k.id ? { id: k.id, shortcode: k.shortcode || undefined, at: Number(k.at) || 0 } : null;
}

export async function knownAd(adId: string): Promise<OriginalPost | null> {
  const k = parse(await getStore().hget(ADS_KEY, adId));
  return k ? { id: k.id, shortcode: k.shortcode } : null;
}

/** Guarda (ou renova) a ligação; `now` marca o último comentário visto no anúncio. */
export async function rememberAd(adId: string, original: OriginalPost, now: number): Promise<void> {
  await getStore().hset(ADS_KEY, { [adId]: JSON.stringify({ id: original.id, shortcode: original.shortcode ?? "", at: now }) });
}

/** Anúncios com comentário recente, para a varredura ler os comentários deles também. */
export async function activeAds(now: number): Promise<string[]> {
  const all = (await getStore().hgetall<Record<string, unknown>>(ADS_KEY)) ?? {};
  return Object.entries(all).filter(([, v]) => { const k = parse(v); return !!k && now - k.at <= KNOWN_MS; }).map(([id]) => id);
}
