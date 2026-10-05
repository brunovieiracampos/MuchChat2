import { currentAccount } from "@/lib/account-context";
import { getAutomation, setAutomationActive, storeAutomation } from "@/lib/automations";
import * as ig from "@/lib/instagram";
import { isScheduledPostMarker } from "@/lib/match";
import { isVideo, mediaFiles, scheduledMarker, type ScheduledPost } from "@/lib/posts";

/**
 * Publicador das publicações agendadas. Roda dentro da conta (withAccount), chamado pelas etapas do
 * workflow (workflows/publish-post). Garantias:
 * - Toda gravação exige a "ficha" (scheduleToken) do processo: se a pessoa reagendou ou cancelou,
 *   a ficha mudou e o processo antigo não grava nada nem publica.
 * - O id do post é gravado assim que a Meta publica; nada que a Meta já publicou volta a ficar "falhou".
 * - Só vai para a Meta mídia que pertence à conta.
 */

export type PublisherDeps = {
  signedUrl: (path: string) => Promise<string>;
  deleteMedia: (paths: string[]) => Promise<void>;
  createContainer: (params: Record<string, string>) => Promise<string>;
  containerStatus: (id: string) => Promise<{ code: ig.ContainerStatus; detail?: string }>;
  publishContainer: (id: string) => Promise<string>;
  getMediaLink: (id: string) => Promise<{ permalink?: string; timestamp?: string }>;
  /** Posts do feed mais recentes (para achar um post publicado cuja resposta se perdeu). */
  recentMedia: () => Promise<{ id: string; timestamp?: string; caption?: string }[]>;
  /** Stories no ar (não aparecem na lista do feed). */
  recentStories: () => Promise<{ id: string; timestamp?: string }[]>;
  /** Comenta no post com a própria conta; devolve o id do comentário. */
  commentOnMedia: (mediaId: string, text: string) => Promise<string>;
  /** Comentário da própria conta com este texto, se já estiver no post. */
  findOwnComment: (mediaId: string, text: string) => Promise<string | null>;
  wait: (ms: number) => Promise<void>;
  now: () => number;
  /** Modo de teste (DRY_RUN): nada é enviado ao Instagram. */
  dryRun: () => boolean;
};

const DRY_RUN_MSG = "Modo de teste (DRY_RUN): a publicação não foi enviada ao Instagram.";

export type StepResult = "ok" | "stop";

const repo = () => currentAccount().repo;
const mediaOfAccount = (path: string) => path.startsWith(`posts/${currentAccount().accountId}/`) && !path.includes("..");

/** Grava só se a ficha ainda for a deste processo; senão o processo para. */
async function save(p: Pick<ScheduledPost, "id">, token: string, patch: Partial<ScheduledPost>): Promise<boolean> {
  return !!(await repo().updatePost(p.id, patch, { token }));
}

async function current(postId: string, token: string, allowed: ScheduledPost["status"][]): Promise<ScheduledPost | null> {
  const p = await repo().getPost(postId);
  if (!p || p.scheduleToken !== token || !allowed.includes(p.status)) return null;
  return p;
}

/**
 * Espera a Meta terminar de processar a mídia. Imagem leva segundos (checa a cada 3 s, por 1 min);
 * vídeo leva minutos (a cada 15 s, por 4 min, dentro do limite de duração da etapa). Se não ficar pronto,
 * a etapa falha e o Workflow tenta de novo, reaproveitando o mesmo container.
 */
async function waitReady(id: string, deps: PublisherDeps, video = false): Promise<void> {
  const [tries, every] = video ? [16, 15000] : [20, 3000];
  for (let i = 0; i < tries; i++) {
    const s = await deps.containerStatus(id);
    if (s.code === "FINISHED" || s.code === "PUBLISHED") return;
    if (s.code === "ERROR" || s.code === "EXPIRED") throw new Error(`A Meta recusou a mídia (${s.detail ?? s.code}).`);
    await deps.wait(every);
  }
  throw new Error("A Meta demorou demais para processar a mídia.");
}

/** Cria o container da publicação na Meta (não publica). */
async function buildContainer(p: ScheduledPost, deps: PublisherDeps): Promise<string> {
  if (!p.media.length) throw new Error("A publicação não tem mídia.");
  if (p.media.some((m) => !mediaOfAccount(m.path))) throw new Error("A publicação tem mídia que não é desta conta.");
  const urls = await Promise.all(p.media.map((m) => deps.signedUrl(m.path)));
  const video = isVideo(p.media[0]);
  if (p.kind === "reel") return deps.createContainer({ media_type: "REELS", video_url: urls[0], caption: p.caption, share_to_feed: "true" });
  if (p.kind === "story") return deps.createContainer(video ? { media_type: "STORIES", video_url: urls[0] } : { media_type: "STORIES", image_url: urls[0] });
  if (p.kind === "image") return deps.createContainer({ image_url: urls[0], caption: p.caption });
  const children: string[] = [];
  for (const url of urls) children.push(await deps.createContainer({ image_url: url, is_carousel_item: "true" }));
  for (const c of children) await waitReady(c, deps);
  return deps.createContainer({ media_type: "CAROUSEL", children: children.join(","), caption: p.caption });
}

/** Etapa 1 (10 minutos antes): prepara a mídia na Meta. Erros de formato aparecem aqui, antes da hora. */
export async function preparePost(postId: string, token: string, deps: PublisherDeps): Promise<StepResult> {
  const p = await current(postId, token, ["scheduled", "preparing"]);
  if (!p) return "stop";
  if (deps.dryRun()) { await save(p, token, { status: "failed", error: DRY_RUN_MSG }); return "stop"; }
  if (!(await save(p, token, { status: "preparing", attempts: p.attempts + 1, error: null }))) return "stop";
  const video = p.media.some(isVideo);
  // Numa nova tentativa, reaproveita o container que ainda está processando (vídeo pode levar minutos).
  let containerId = p.containerId;
  if (containerId) {
    const s = await deps.containerStatus(containerId);
    if (s.code === "ERROR" || s.code === "EXPIRED") containerId = null;
  }
  if (!containerId) {
    containerId = await buildContainer(p, deps);
    // Grava antes de esperar: se a etapa estourar o tempo, a próxima tentativa continua deste container.
    if (!(await save(p, token, { containerId }))) return "stop";
  }
  await waitReady(containerId, deps, video);
  // Confere a ficha de novo: se a pessoa reagendou ou cancelou durante a espera, este processo para sem gravar.
  return (await save(p, token, { containerId })) ? "ok" : "stop";
}

/** Acha o post que a Meta publicou quando a resposta se perdeu (evita publicar de novo). */
async function findPublished(p: ScheduledPost, deps: PublisherDeps): Promise<string | null> {
  const since = (p.scheduledAt ?? deps.now()) - 15 * 60e3;
  const after = (t?: string) => !!t && Date.parse(t) >= since;
  if (p.kind === "story") return (await deps.recentStories()).filter((m) => after(m.timestamp)).sort((a, b) => Date.parse(a.timestamp!) - Date.parse(b.timestamp!))[0]?.id ?? null;
  const recent = (await deps.recentMedia()).filter((m) => after(m.timestamp));
  return (recent.find((m) => (m.caption ?? "").trim() === p.caption.trim()) ?? (recent.length === 1 ? recent[0] : undefined))?.id ?? null;
}

/** Etapa 2 (na hora): publica o container. Nunca publica duas vezes. */
export async function publishPost(postId: string, token: string, deps: PublisherDeps): Promise<StepResult> {
  const p = await current(postId, token, ["scheduled", "preparing", "publishing"]);
  if (!p) return "stop";
  if (p.igMediaId) return "ok";
  if (deps.dryRun()) { await save(p, token, { status: "failed", error: DRY_RUN_MSG }); return "stop"; }

  const video = p.media.some(isVideo);
  let containerId = p.containerId;
  if (containerId) {
    const s = await deps.containerStatus(containerId);
    if (s.code === "PUBLISHED") {
      // A Meta já publicou (a resposta anterior se perdeu). Nunca publicar de novo.
      const found = await findPublished(p, deps);
      if (found) return finish(p, token, found, deps);
      await save(p, token, { status: "published", publishedAt: deps.now(), error: "A Meta confirmou a publicação, mas o link não apareceu. Confira no perfil." });
      return "ok";
    }
    if (s.code === "ERROR" || s.code === "EXPIRED") containerId = null;
    // Vídeo que ainda está processando: espera ficar pronto antes de publicar.
    else if (s.code === "IN_PROGRESS") await waitReady(containerId, deps, video);
  }
  if (!containerId) {
    containerId = await buildContainer(p, deps);
    await save(p, token, { containerId });
    await waitReady(containerId, deps, video);
  }
  if (!(await save(p, token, { status: "publishing", containerId }))) return "stop";
  const mediaId = await deps.publishContainer(containerId);
  // Primeiro de tudo: registrar que saiu. O resto (link, automação) não pode mais fazer a publicação "falhar".
  await save(p, token, { status: "published", igMediaId: mediaId, publishedAt: deps.now(), error: null });
  return finish(p, token, mediaId, deps);
}

/** Depois de publicado: link do post e automação. Erros aqui viram aviso, nunca falha. */
async function finish(p: ScheduledPost, token: string, mediaId: string, deps: PublisherDeps): Promise<StepResult> {
  let permalink: string | null = null;
  let publishedAt = deps.now();
  try {
    const link = await deps.getMediaLink(mediaId);
    permalink = link.permalink ?? null;
    if (link.timestamp) publishedAt = Date.parse(link.timestamp);
  } catch (e) { console.error("[publicação] link do post", p.id, e); }
  let note: string | null = null;
  try { note = await bindAutomation(p, permalink ?? mediaId, deps.now()); }
  catch (e) { console.error("[publicação] automação", p.id, e); note = "Publicado, mas não foi possível ligar a automação. Ligue pelo painel em Automações."; }
  await save(p, token, { status: "published", igMediaId: mediaId, permalink, publishedAt, error: note });
  return "ok";
}

/**
 * A automação ligada à publicação troca o marcador pelo link do post e é ativada.
 * Devolve um aviso (gravado na publicação) se não deu para ativar.
 */
export async function bindAutomation(p: Pick<ScheduledPost, "id" | "automationId">, postRef: string, now: number): Promise<string | null> {
  if (!p.automationId) return null;
  const rule = await getAutomation(p.automationId);
  if (!rule) return "Publicado. A automação ligada não existe mais.";
  const marker = scheduledMarker(p.id);
  const posts = rule.posts.filter((x) => !isScheduledPostMarker(x) || x.trim() !== marker);
  if (!posts.includes(postRef)) posts.push(postRef);
  await storeAutomation({ ...rule, posts, boundAt: now, updatedAt: now });
  const r = await setAutomationActive(rule.id, true);
  if (!r.ok) return `Publicado. A automação “${rule.name ?? rule.id}” foi ligada ao post, mas não foi ativada: ${r.issues.map((i) => i.message).join(" ")}`;
  return null;
}

/**
 * Etapa extra (logo depois de publicar): o primeiro comentário, feito pela própria conta. Nunca comenta duas vezes:
 * guarda o id do comentário e, numa nova tentativa (`retry`), antes procura no post um comentário igual
 * (a Meta pode ter publicado e a resposta ter se perdido). Erros sobem para o Workflow tentar de novo.
 */
export async function postFirstComment(postId: string, token: string, deps: PublisherDeps, retry = false): Promise<void> {
  const p = await current(postId, token, ["published"]);
  const text = p?.firstComment.trim();
  if (!p || !text || p.kind === "story" || !p.igMediaId || p.firstCommentId) return;
  const id = (retry ? await deps.findOwnComment(p.igMediaId, text) : null) ?? (await deps.commentOnMedia(p.igMediaId, text));
  await save(p, token, { firstCommentId: id });
}

/** O comentário não saiu depois de todas as tentativas: a publicação continua publicada e ganha um aviso. */
export async function noteFirstCommentFailure(postId: string, token: string, message: string): Promise<void> {
  const p = await current(postId, token, ["published"]);
  if (!p || p.firstCommentId) return;
  const note = `O post saiu, mas o primeiro comentário não foi publicado: ${message}`;
  await save(p, token, { error: [p.error, note].filter(Boolean).join(" ").slice(0, 500) });
}

/**
 * Última tentativa falhou: marca como falha, com o motivo em português. Se a Meta já tinha publicado
 * (o post tem id ou o container está PUBLISHED), marca como publicado com aviso: nunca oferecer "agendar de novo".
 */
export async function failPost(postId: string, token: string, message: string, deps?: Pick<PublisherDeps, "containerStatus" | "now">): Promise<void> {
  const p = await repo().getPost(postId);
  if (!p || p.scheduleToken !== token || p.status === "published") return;
  let published = !!p.igMediaId;
  if (!published && p.containerId && deps) {
    try { published = (await deps.containerStatus(p.containerId)).code === "PUBLISHED"; } catch { /* sem confirmação: segue como falha */ }
  }
  if (published) {
    await save(p, token, { status: "published", publishedAt: p.publishedAt ?? deps?.now() ?? Date.now(), error: "A Meta publicou, mas houve erro depois. Confira o post no perfil." });
    return;
  }
  await save(p, token, { status: "failed", error: message.slice(0, 500) });
}

/** Etapa 3 (1 dia depois): apaga as mídias do armazenamento. */
export async function cleanupMedia(postId: string, deps: PublisherDeps): Promise<void> {
  const p = await repo().getPost(postId);
  if (!p || p.mediaDeletedAt || !p.media.length) return;
  await deps.deleteMedia(p.media.flatMap(mediaFiles).filter(mediaOfAccount));
  await repo().updatePost(postId, { mediaDeletedAt: deps.now() });
}

/** Mensagem legível para a pessoa a partir de um erro da Meta ou do sistema. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof ig.GraphError) {
    const m = (e.body?.error?.error_user_msg as string | undefined) ?? (e.body?.error?.message as string | undefined) ?? msg;
    if (e.code === 190) return "O acesso ao Instagram expirou. Reconecte a conta em Configurações e agende de novo.";
    if (e.code === 10 || e.code === 200) return "O Instagram não autorizou publicar. Reconecte a conta em Configurações aceitando a permissão de publicar.";
    if (e.code === 9 || e.code === 4) return "Limite de publicações da Meta atingido. Tente de novo mais tarde.";
    return `O Instagram recusou: ${m}`;
  }
  return msg;
}

/** Tudo o que depende da Meta, do armazenamento e do relógio (trocado nos testes). */
export async function defaultPublisherDeps(): Promise<PublisherDeps> {
  const store = await import("@/lib/media-store");
  const accountId = currentAccount().accountId;
  return {
    signedUrl: (path) => store.signedUrl(path),
    deleteMedia: (paths) => store.deleteMedia(accountId, paths),
    createContainer: ig.createContainer,
    containerStatus: ig.containerStatus,
    publishContainer: ig.publishContainer,
    getMediaLink: ig.getMediaLink,
    recentMedia: async () => (await ig.listMediaPage(10)).items,
    recentStories: ig.listStories,
    commentOnMedia: async (mediaId, text) => (await ig.commentOnMedia(mediaId, text)).id,
    findOwnComment: async (mediaId, text) => {
      const own = await ig.igUserId();
      return (await ig.listComments(mediaId, 1)).find((c) => c.from?.id === own && (c.text ?? "").trim() === text)?.id ?? null;
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    dryRun: ig.isDryRun,
  };
}
