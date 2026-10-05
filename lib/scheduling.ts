import "server-only";
import crypto from "node:crypto";
import { start } from "workflow/api";
import { DEFAULT_PUBLIC_REPLIES } from "@/config/rules";
import { currentAccount } from "@/lib/account-context";
import { getAutomation, listAutomations, saveAutomation, storeAutomation, type Issue } from "@/lib/automations";
import { TEMPLATES } from "@/lib/flow";
import { isPlaceholderPost } from "@/lib/match";
import { deleteMedia, ownsMedia } from "@/lib/media-store";
import { isEditable, kindFor, mediaFiles, scheduledMarker, validatePost, type PostIssue, type PostMedia, type ScheduledPost } from "@/lib/posts";
import { publishPostWorkflow } from "@/workflows/publish-post";

/**
 * Agendamento de publicações (painel e MCP). Roda dentro da conta em uso.
 * Agendar troca a "ficha" (scheduleToken) e inicia um processo novo; cancelar ou reagendar invalida o anterior.
 */

export type PostInput = {
  id?: string;
  story: boolean;
  caption: string;
  /** Primeiro comentário (opcional); sem o campo, mantém o que a publicação já tinha. */
  firstComment?: string;
  media: PostMedia[];
  scheduledAt: number | null;
  /** Automação: nenhuma, uma existente (rascunho sem post) ou uma nova a partir de um modelo. */
  automation?: { mode: "none" } | { mode: "existing"; id: string } | { mode: "new"; keyword: string; link: string; template: string; name?: string };
};

export type ScheduleResult = { ok: true; post: ScheduledPost } | { ok: false; issues: (PostIssue | Issue)[] };

const fail = (message: string, field: PostIssue["field"] = "media"): ScheduleResult => ({ ok: false, issues: [{ field, message }] });

/** Automações que podem ser ligadas a uma publicação: pausadas e sem post (ou já ligadas a esta). */
export async function linkableAutomations(postId?: string) {
  const mine = postId ? scheduledMarker(postId) : null;
  return (await listAutomations()).filter((r) => r.active === false && (r.posts.length === 0 || r.posts.every((p) => p.trim() === mine)));
}

async function linkAutomation(post: ScheduledPost, a: PostInput["automation"]): Promise<{ id: string | null } | { issues: Issue[] }> {
  if (!a || a.mode === "none") return { id: null };
  const marker = scheduledMarker(post.id);
  if (a.mode === "existing") {
    const rule = await getAutomation(a.id);
    if (!rule) return { issues: [{ field: "name", message: "A automação escolhida não existe mais." }] };
    const ok = rule.posts.length === 0 || rule.posts.every((p) => p.trim() === marker);
    if (!ok || rule.active !== false) return { issues: [{ field: "posts", message: `“${rule.name ?? rule.id}” já está ligada a outro post. Escolha uma automação em rascunho sem post, ou crie uma nova.` }] };
    await storeAutomation({ ...rule, posts: [marker], updatedAt: Date.now() });
    return { id: rule.id };
  }
  if (!a.keyword.trim()) return { issues: [{ field: "keywords", message: "Informe a palavra-chave da automação." }] };
  const tpl = TEMPLATES.find((t) => t.id === a.template) ?? TEMPLATES[0];
  const r = await saveAutomation({
    name: a.name?.trim() || `Publicação ${new Date(post.scheduledAt ?? Date.now()).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    keywords: [a.keyword], link: a.link, posts: [marker], steps: tpl.build([...DEFAULT_PUBLIC_REPLIES]), active: false,
  });
  if (!r.ok) return { issues: r.issues };
  return { id: r.automation.id };
}

/** Automação que estava esperando esta publicação volta a ser rascunho sem post (ao cancelar ou excluir). */
async function releaseAutomation(post: ScheduledPost) {
  if (!post.automationId) return;
  const rule = await getAutomation(post.automationId);
  if (rule && rule.posts.some((p) => p.trim() === scheduledMarker(post.id))) {
    await storeAutomation({ ...rule, posts: rule.posts.filter((p) => !isPlaceholderPost(p)), active: false, updatedAt: Date.now() });
  }
}

const EDITABLE: ScheduledPost["status"][] = ["draft", "scheduled", "failed", "canceled"];
const BUSY = "A publicação começou a ser feita agora e não pode mais ser alterada.";

/** Salva o rascunho ou agenda (`when`: data ou "now"). */
export async function savePost(input: PostInput, when: number | "now" | null): Promise<ScheduleResult> {
  const { accountId, repo } = currentAccount();
  const prev = input.id ? await repo.getPost(input.id) : null;
  if (input.id && !prev) return fail("Publicação não encontrada.");
  if (prev && !isEditable(prev.status)) return fail(BUSY);
  if (input.media.some((m) => mediaFiles(m).some((f) => !ownsMedia(accountId, f)))) return fail("Mídia inválida. Envie o arquivo de novo.");

  const now = Date.now();
  const scheduledAt = when === "now" ? now : when ?? input.scheduledAt;
  const kind = kindFor(input.story, input.media);
  const firstComment = input.story ? "" : (input.firstComment ?? prev?.firstComment ?? "").trim();
  const draft = { kind, caption: input.story ? "" : input.caption, firstComment, media: input.media, scheduledAt };
  const issues = validatePost({ ...draft, scheduledAt: when === "now" ? now + 60 * 60e3 : scheduledAt }, { schedule: when !== null, now });
  if (issues.length) return { ok: false, issues };

  const scheduling = when !== null;
  const token = scheduling ? crypto.randomUUID() : null;
  const fields = { ...draft, status: (scheduling ? "scheduled" : "draft") as ScheduledPost["status"], scheduleToken: token, runId: null, containerId: null, error: null };
  // Trocar a ficha invalida qualquer processo anterior; a gravação só acontece se a publicação ainda for editável.
  const saved = prev ? await repo.updatePost(prev.id, fields, { statuses: EDITABLE }) : await repo.createPost(fields);
  if (!saved) return fail(BUSY);
  let post = saved;

  // Mídia que saiu da publicação é apagada do armazenamento.
  const removed = (prev?.media ?? []).filter((m) => !input.media.some((x) => x.path === m.path)).flatMap(mediaFiles);
  if (removed.length) await deleteMedia(accountId, removed).catch((e) => console.error("[publicação] apagar mídia", e));

  const link = await linkAutomation(post, input.automation ?? (prev?.automationId ? { mode: "existing", id: prev.automationId } : { mode: "none" }));
  if ("issues" in link) {
    if (scheduling) await repo.updatePost(post.id, { status: "draft", scheduleToken: null }, { token });
    return { ok: false, issues: link.issues };
  }
  if (prev?.automationId && prev.automationId !== link.id) await releaseAutomation(prev);
  post = (await repo.updatePost(post.id, { automationId: link.id }, { token })) ?? post;

  if (scheduling) {
    const run = await start(publishPostWorkflow, [accountId, post.id, token!, post.scheduledAt!]);
    post = (await repo.updatePost(post.id, { runId: run.runId }, { token })) ?? post;
  }
  return { ok: true, post };
}

/** Cancela o agendamento (a publicação volta a ser rascunho, com a mídia e a automação preservadas). */
export async function cancelPost(id: string): Promise<ScheduleResult> {
  const repo = currentAccount().repo;
  const p = await repo.getPost(id);
  if (!p) return fail("Publicação não encontrada.");
  if (p.status === "published") return fail("Esta publicação já saiu. Para tirar do ar, apague o post no Instagram.");
  const post = await repo.updatePost(id, { status: "draft", scheduleToken: null, runId: null }, { statuses: EDITABLE });
  return post ? { ok: true, post } : fail("A publicação já está sendo feita; não dá mais para cancelar.");
}

/** Exclui a publicação e a mídia. A automação que esperava por ela vira rascunho sem post. */
export async function removePost(id: string): Promise<ScheduleResult> {
  const { accountId, repo } = currentAccount();
  const p = await repo.getPost(id);
  if (!p) return fail("Publicação não encontrada.");
  // Invalida a ficha primeiro: se o processo estiver no meio, ele não grava mais nada.
  const claimed = await repo.updatePost(id, { scheduleToken: null }, { statuses: [...EDITABLE, "published"] });
  if (!claimed) return fail("A publicação está sendo feita agora; espere terminar.");
  await releaseAutomation(p);
  if (!p.mediaDeletedAt && p.media.length) await deleteMedia(accountId, p.media.flatMap(mediaFiles)).catch((e) => console.error("[publicação] apagar mídia", e));
  await repo.deletePost(id);
  return { ok: true, post: p };
}
