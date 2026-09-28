/**
 * Publicações agendadas: tipos e regras. Sem dependências de servidor: roda também no navegador (editor).
 * Limites vêm da API de publicação do Instagram (verificados na etapa 0 em 2026-09-28).
 */

export type PostKind = "image" | "carousel" | "story";
export type PostStatus = "draft" | "scheduled" | "preparing" | "publishing" | "published" | "failed" | "canceled";

export type PostMedia = { path: string; width: number; height: number; size: number };

export type ScheduledPost = {
  id: string;
  kind: PostKind;
  caption: string;
  media: PostMedia[];
  scheduledAt: number | null;
  status: PostStatus;
  scheduleToken: string | null;
  runId: string | null;
  containerId: string | null;
  igMediaId: string | null;
  permalink: string | null;
  publishedAt: number | null;
  automationId: string | null;
  attempts: number;
  error: string | null;
  mediaDeletedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export const CAPTION_MAX = 2200;
export const HASHTAGS_MAX = 30;
export const MENTIONS_MAX = 20;
export const CAROUSEL_MAX = 10;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Feed: de 4:5 (retrato) a 1,91:1 (paisagem). */
export const FEED_RATIO = { min: 4 / 5, max: 1.91 };
/** Story: vertical (9:16 recomendado); aceitamos de 9:16 até quadrado. */
export const STORY_RATIO = { min: 9 / 16, max: 1 };
/** Antecedência mínima para agendar (a mídia é preparada 10 minutos antes). */
export const MIN_LEAD_MS = 2 * 60e3;
export const MAX_AHEAD_DAYS = 60;
/** Mídia é apagada 1 dia depois de publicada (fica para republicar em outra rede nesse meio-tempo). */
export const MEDIA_RETENTION_MS = 864e5;

export const KIND_LABEL: Record<PostKind, string> = { image: "Post", carousel: "Carrossel", story: "Story" };

export const STATUS_META: Record<PostStatus, { label: string; tone: "" | "green" | "amber" | "violet" | "red" }> = {
  draft: { label: "Rascunho", tone: "" },
  scheduled: { label: "Agendada", tone: "violet" },
  preparing: { label: "Preparando", tone: "violet" },
  publishing: { label: "Publicando", tone: "violet" },
  published: { label: "Publicada", tone: "green" },
  failed: { label: "Falhou", tone: "red" },
  canceled: { label: "Cancelada", tone: "amber" },
};

/** Ainda dá para editar, reagendar ou cancelar (a preparação na Meta ainda não começou). */
export const isEditable = (s: PostStatus) => s === "draft" || s === "scheduled" || s === "failed" || s === "canceled";

export const kindFor = (story: boolean, count: number): PostKind => (story ? "story" : count > 1 ? "carousel" : "image");

export function countHashtags(caption: string): number {
  return (caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}
export function countMentions(caption: string): number {
  return (caption.match(/(^|\s)@[A-Za-z0-9._]+/g) ?? []).length;
}

export function ratioOk(kind: PostKind, m: Pick<PostMedia, "width" | "height">): boolean {
  if (!m.width || !m.height) return false;
  const r = m.width / m.height;
  const lim = kind === "story" ? STORY_RATIO : FEED_RATIO;
  return r >= lim.min - 0.01 && r <= lim.max + 0.01;
}

export type PostIssue = { field: "media" | "caption" | "scheduledAt"; message: string };

/**
 * Problemas que impedem agendar. Rascunho só precisa de dados bem formados;
 * para agendar (`schedule`), a mídia e o horário precisam estar completos.
 */
export function validatePost(
  p: { kind: PostKind; caption: string; media: Pick<PostMedia, "width" | "height" | "size">[]; scheduledAt: number | null },
  opts: { schedule: boolean; now?: number },
): PostIssue[] {
  const out: PostIssue[] = [];
  const now = opts.now ?? Date.now();
  const n = p.media.length;

  if (opts.schedule && !n) out.push({ field: "media", message: "Adicione pelo menos uma imagem." });
  if (p.kind === "carousel" && opts.schedule && n < 2) out.push({ field: "media", message: "Carrossel precisa de pelo menos 2 imagens." });
  if (n > CAROUSEL_MAX) out.push({ field: "media", message: `Carrossel aceita até ${CAROUSEL_MAX} imagens.` });
  if ((p.kind === "image" || p.kind === "story") && n > 1) out.push({ field: "media", message: `${KIND_LABEL[p.kind]} tem uma imagem só; com mais de uma, vira carrossel.` });
  p.media.forEach((m, i) => {
    if (m.size > IMAGE_MAX_BYTES) out.push({ field: "media", message: `A imagem ${i + 1} passa de 8 MB.` });
    if (!ratioOk(p.kind, m)) {
      out.push({
        field: "media",
        message: p.kind === "story"
          ? `A imagem ${i + 1} não é vertical. Story aceita de 9:16 até quadrado.`
          : `A proporção da imagem ${i + 1} não é aceita no feed. Use de 4:5 (retrato) até 1,91:1 (paisagem).`,
      });
    }
  });

  if (p.kind === "story" && p.caption.trim()) out.push({ field: "caption", message: "Story não tem legenda. Apague o texto ou escolha post ou carrossel." });
  if (p.caption.length > CAPTION_MAX) out.push({ field: "caption", message: `A legenda pode ter até ${CAPTION_MAX} caracteres.` });
  if (countHashtags(p.caption) > HASHTAGS_MAX) out.push({ field: "caption", message: `O Instagram aceita até ${HASHTAGS_MAX} hashtags.` });
  if (countMentions(p.caption) > MENTIONS_MAX) out.push({ field: "caption", message: `O Instagram aceita até ${MENTIONS_MAX} menções.` });

  if (opts.schedule) {
    if (!p.scheduledAt) out.push({ field: "scheduledAt", message: "Escolha a data e a hora." });
    else if (p.scheduledAt < now + MIN_LEAD_MS) out.push({ field: "scheduledAt", message: "Escolha um horário pelo menos 2 minutos à frente, ou use “Publicar agora”." });
    else if (p.scheduledAt > now + MAX_AHEAD_DAYS * 864e5) out.push({ field: "scheduledAt", message: `Dá para agendar até ${MAX_AHEAD_DAYS} dias à frente.` });
  }
  return out;
}

/** Marcador de post das automações ligadas a uma publicação agendada (vira o link quando ela sai). */
export const scheduledMarker = (postId: string) => `@post:${postId}`;
