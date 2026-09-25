import type { Rule } from "@/config/rules";
import { isPaused, listAutomations } from "@/lib/automations";
import {
  clickPayload, parseClickPayload, renderText, stepsOf, waitsForClick,
  type DmStep, type FollowStep, type ReplyStep, type Step,
} from "@/lib/flow";
import { findRule, normalize, rulesNeedShortcode } from "@/lib/match";
import { bump, type Stage } from "@/lib/stats";
import { getStore } from "@/lib/store";
import * as ig from "@/lib/instagram";

/**
 * Motor dos fluxos. Cada comentário que casa com uma automação percorre os blocos em ordem;
 * o estado fica em c:{commentId} (bloco atual, se está esperando clique, quem é a pessoa).
 * - processComment: começa ou retoma (webhook e varredura chamam; nunca duplica).
 * - handleClick: a pessoa clicou num botão (ou respondeu o texto do botão) → segue o fluxo.
 */

export type IncomingComment = {
  id: string;
  text: string;
  mediaId: string;
  fromId?: string;
  username?: string;
  /** epoch ms; se ausente, considera "agora" */
  timestamp?: number;
  parentId?: string;
};

export type Deps = {
  sendPrivateReply: (commentId: string, m: ig.OutMessage) => Promise<ig.SendResult>;
  sendMessage: (igsid: string, m: ig.OutMessage) => Promise<ig.SendResult>;
  replyToComment: (commentId: string, message: string) => Promise<unknown>;
  isFollower: (igsid: string) => Promise<boolean>;
  getMedia: (mediaId: string) => Promise<{ id: string; shortcode?: string }>;
  ownUserId: () => Promise<string | undefined>;
  dryRun: () => boolean;
  paused: () => Promise<boolean>;
  rules: () => Rule[] | Promise<Rule[]>;
  now: () => number;
  random: () => number;
};

export const defaultDeps: Deps = {
  sendPrivateReply: ig.sendPrivateReply,
  sendMessage: ig.sendMessage,
  replyToComment: ig.replyToComment,
  isFollower: ig.isFollower,
  getMedia: ig.getMedia,
  ownUserId: () => ig.igUserId().catch(() => undefined),
  dryRun: ig.isDryRun,
  paused: isPaused,
  rules: listAutomations,
  now: () => Date.now(),
  random: Math.random,
};

const WINDOW_MS = 7 * 864e5 - 60 * 60e3; // 7 dias menos 1h de folga
const MAX_ATTEMPTS = 3;
const MAX_FOLLOW_TRIES = 10;
const LOG_KEY = "log";
const FAILED_KEY = "failed";
const RETENTION_S = 90 * 86400; // bate com a política de privacidade

type Status = "running" | "waiting" | "done" | "failed" | "expired";

type State = {
  status?: Status;
  rule?: string;
  username?: string;
  mediaId?: string;
  /** id do próximo bloco a executar (ou o bloco que espera clique) */
  at?: string;
  waitStep?: string;
  igsid?: string;
  /** 1 depois que a Private Reply saiu (só pode uma) */
  pr?: number | string;
  /** 1 depois do primeiro clique: conversa aberta por 24h */
  clicked?: number | string;
  attempts?: number;
  followTries?: number;
  /** 1 se a verificação já disse que não segue (para contar novos seguidores) */
  fno?: number | string;
  error?: string;
  /** etapas do funil já contadas: s_comment, s_dm, … */
  [mark: `s_${string}`]: number | string | undefined;
};

export type LogEntry = {
  at: number;
  source: string;
  commentId: string;
  mediaId: string;
  username?: string;
  text?: string;
  rule?: string;
  step?: string;
  action: string;
  detail?: string;
};

export type Result =
  | "own" | "paused" | "no-match" | "expired" | "locked" | "done" | "dry-run" | "waiting" | "completed"
  | "dm-error" | "dm-failed" | "reply-error" | "ignored";

async function log(e: Omit<LogEntry, "at">, now: number) {
  const entry = { at: now, ...e };
  console.log("[flow]", JSON.stringify(entry));
  await getStore().lpush(LOG_KEY, entry, 2000);
}

export async function readLog(n = 200): Promise<LogEntry[]> {
  return getStore().lrange<LogEntry>(LOG_KEY, 0, n - 1);
}

async function resolveShortcode(mediaId: string, deps: Deps): Promise<string | undefined> {
  const store = getStore();
  const key = `media:${mediaId}`;
  const cached = await store.get<string>(key);
  if (cached) return cached;
  try {
    const m = await deps.getMedia(mediaId);
    if (m.shortcode) await store.set(key, m.shortcode, { ex: 30 * 86400 });
    return m.shortcode;
  } catch (e) {
    console.error("[flow] falha ao buscar shortcode", mediaId, e);
    return undefined;
  }
}

async function pickReply(step: ReplyStep, deps: Deps): Promise<string> {
  const opts = step.replies.filter((r) => r.trim());
  if (opts.length <= 1) return opts[0] ?? "";
  const store = getStore();
  const key = `reply:last:${step.id}`;
  const last = await store.get<number>(key);
  let i = Math.floor(deps.random() * opts.length);
  if (i === last) i = (i + 1) % opts.length;
  await store.set(key, i);
  return opts[i];
}

/** Conta a etapa no funil da automação, uma vez por comentário. Falha nos contadores não trava o fluxo. */
async function mark(commentId: string, state: State, ruleId: string, stage: Stage, now: number) {
  const f = `s_${stage}` as const;
  if (state[f]) return;
  state[f] = 1;
  try {
    await getStore().hset(`c:${commentId}`, { [f]: 1 });
    await bump(ruleId, stage, now);
  } catch (e) {
    console.error("[flow] falha ao contar etapa", stage, commentId, e);
  }
}

/** A pessoa passou pela verificação de seguidor; se antes não seguia, é um seguidor novo. */
async function markFollower(ctx: Pick<Ctx, "commentId" | "state" | "rule" | "now">) {
  await mark(ctx.commentId, ctx.state, ctx.rule.id, "follower", ctx.now);
  if (ctx.state.fno) await mark(ctx.commentId, ctx.state, ctx.rule.id, "gained", ctx.now);
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isPermanent = (e: unknown) => (e instanceof ig.GraphError ? e.permanent : false);
/** O Instagram recusou o formato (ex.: botão na Private Reply): vale tentar só com texto. */
const isFormatError = (e: unknown) => e instanceof ig.GraphError && e.status === 400 && e.code === 100;

/* ---------- mensagens ---------- */

type Ctx = {
  commentId: string;
  rule: Rule;
  steps: Step[];
  state: State;
  base: Omit<LogEntry, "at" | "action">;
  deps: Deps;
  now: number;
};

function dmMessage(step: DmStep, ctx: Ctx): ig.OutMessage {
  const text = renderText(step.text, ctx.rule.link, ctx.state.username);
  const b = step.button;
  if (!b) return { text };
  if (b.kind === "continue") return { text, buttons: [{ type: "postback", title: b.title, payload: clickPayload(ctx.commentId, step.id) }] };
  return { text, buttons: [{ type: "web_url", title: b.title, url: b.url || ctx.rule.link }] };
}

function followMessage(step: FollowStep, ctx: Ctx, retry: boolean): ig.OutMessage {
  const title = retry ? step.retryButton : step.button;
  return {
    text: renderText(retry ? step.retryText : step.text, ctx.rule.link, ctx.state.username),
    buttons: [{ type: "postback", title, payload: clickPayload(ctx.commentId, step.id) }],
  };
}

/** Versão só texto, para quando o Instagram não aceita o botão. */
function textOnly(m: ig.OutMessage): ig.OutMessage {
  const b = m.buttons?.[0];
  if (!b) return m;
  return { text: b.type === "postback" ? `${m.text}\n\nResponda “${b.title}” aqui para continuar.` : `${m.text}\n\n${b.title}: ${b.url}` };
}

/** Envia pela Private Reply (primeira mensagem) ou direto para a pessoa (depois de um clique). */
async function send(m: ig.OutMessage, ctx: Ctx): Promise<{ fallback: boolean }> {
  const { deps, state, commentId } = ctx;
  const go = (msg: ig.OutMessage) => {
    if (!state.pr) return deps.sendPrivateReply(commentId, msg);
    if (state.clicked && state.igsid) return deps.sendMessage(state.igsid, msg);
    throw new Error("Sem conversa aberta: a pessoa precisa clicar num botão antes de uma nova mensagem.");
  };
  let res: ig.SendResult;
  let fallback = false;
  try {
    res = await go(m);
  } catch (e) {
    if (!m.buttons?.length || !isFormatError(e)) throw e;
    res = await go(textOnly(m));
    fallback = true;
  }
  const store = getStore();
  const patch: Partial<State> = { pr: 1 };
  if (res?.recipient_id && !state.igsid) patch.igsid = String(res.recipient_id);
  Object.assign(state, patch);
  await store.hset(`c:${commentId}`, patch);
  if (state.igsid) await store.set(`w:${state.igsid}`, commentId, { ex: 7 * 86400 });
  await mark(commentId, state, ctx.rule.id, "dm", ctx.now);
  return { fallback };
}

/* ---------- execução ---------- */

type StepOutcome = "next" | "wait" | "error" | "failed";

async function failStep(ctx: Ctx, step: Step, e: unknown, kind: "dm" | "reply"): Promise<StepOutcome> {
  const store = getStore();
  const attempts = (Number(ctx.state.attempts) || 0) + 1;
  const final = isPermanent(e) || attempts >= MAX_ATTEMPTS;
  ctx.state.attempts = attempts;
  await store.hset(`c:${ctx.commentId}`, { attempts, error: errMsg(e).slice(0, 500) });
  await log({ ...ctx.base, step: step.id, action: `${kind}-${final ? "failed" : "error"}`, detail: errMsg(e).slice(0, 300) }, ctx.now);
  // Resposta pública que falhou de vez não trava o fluxo; mensagem que falhou, sim.
  if (final && kind === "reply") return "next";
  return final ? "failed" : "error";
}

async function execStep(step: Step, ctx: Ctx): Promise<StepOutcome> {
  const { deps } = ctx;
  if (step.type === "reply") {
    const msg = await pickReply(step, deps);
    try {
      await deps.replyToComment(ctx.commentId, msg);
    } catch (e) { return failStep(ctx, step, e, "reply"); }
    await log({ ...ctx.base, step: step.id, action: "reply-sent", detail: msg }, ctx.now);
    return "next";
  }

  if (step.type === "dm") {
    const m = dmMessage(step, ctx);
    let fallback = false;
    try { ({ fallback } = await send(m, ctx)); } catch (e) { return failStep(ctx, step, e, "dm"); }
    await log({ ...ctx.base, step: step.id, action: "dm-sent", detail: fallback ? "Enviada sem botão: o Instagram recusou o modelo com botão" : step.button ? `Com botão “${step.button.title}”` : undefined }, ctx.now);
    return waitsForClick(step) ? "wait" : "next";
  }

  // follow: com a conversa aberta, confere antes de perguntar
  if (ctx.state.clicked && ctx.state.igsid) {
    try {
      if (await deps.isFollower(ctx.state.igsid)) {
        await log({ ...ctx.base, step: step.id, action: "follow-ok" }, ctx.now);
        await markFollower(ctx);
        return "next";
      }
    } catch (e) {
      await log({ ...ctx.base, step: step.id, action: "follow-unknown", detail: errMsg(e).slice(0, 300) }, ctx.now);
      return "next";
    }
  }
  try { await send(followMessage(step, ctx, false), ctx); } catch (e) { return failStep(ctx, step, e, "dm"); }
  await log({ ...ctx.base, step: step.id, action: "dm-sent", detail: `Pedido para seguir (botão “${step.button}”)` }, ctx.now);
  return "wait";
}

/** Executa a partir do bloco `state.at` até o fim, um erro ou um bloco que espera clique. */
async function run(ctx: Ctx): Promise<Result> {
  const store = getStore();
  const key = `c:${ctx.commentId}`;
  let i = ctx.steps.findIndex((s) => s.id === ctx.state.at);
  if (i < 0) {
    await store.hset(key, { status: "done", at: "" });
    await log({ ...ctx.base, action: "flow-done", detail: ctx.state.at ? "O fluxo foi alterado; este comentário foi encerrado" : undefined }, ctx.now);
    return "completed";
  }
  for (; i < ctx.steps.length; i++) {
    const step = ctx.steps[i];
    const out = await execStep(step, ctx);
    if (out === "error") return step.type === "reply" ? "reply-error" : "dm-error";
    if (out === "failed") {
      await store.hset(key, { status: "failed" });
      await store.lpush(FAILED_KEY, ctx.commentId, 5000);
      await mark(ctx.commentId, ctx.state, ctx.rule.id, "failed", ctx.now);
      return "dm-failed";
    }
    if (out === "wait") {
      const title = step.type === "follow" ? step.button : step.type === "dm" ? step.button?.title : "";
      Object.assign(ctx.state, { status: "waiting", waitStep: step.id, at: step.id, attempts: 0 });
      await store.hset(key, { status: "waiting", waitStep: step.id, at: step.id, attempts: 0 });
      await log({ ...ctx.base, step: step.id, action: "waiting-click", detail: title ? `Aguardando clique em “${title}”` : undefined }, ctx.now);
      return "waiting";
    }
    const next = ctx.steps[i + 1]?.id ?? "";
    ctx.state.at = next;
    ctx.state.attempts = 0;
    await store.hset(key, { at: next, attempts: 0 });
  }
  await store.hset(key, { status: "done", at: "" });
  await log({ ...ctx.base, action: "flow-done" }, ctx.now);
  await mark(ctx.commentId, ctx.state, ctx.rule.id, "done", ctx.now);
  return "completed";
}

function describeDryRun(steps: Step[], rule: Rule, username?: string): string {
  const lines: string[] = [];
  for (const s of steps) {
    if (s.type === "reply") lines.push(`Responderia o comentário: “${s.replies[0] ?? ""}”`);
    if (s.type === "dm") lines.push(`Enviaria DM: “${renderText(s.text, rule.link, username)}”${s.button ? ` [botão: ${s.button.title}]` : ""}`);
    if (s.type === "follow") lines.push(`Conferiria se segue; se não, pediria para seguir [botão: ${s.button}]`);
    if (waitsForClick(s)) { lines.push("…e esperaria o clique para continuar."); break; }
  }
  return lines.join("\n").slice(0, 900);
}

export async function processComment(c: IncomingComment, source: string, deps: Deps = defaultDeps): Promise<Result> {
  const store = getStore();
  const now = deps.now();
  const own = await deps.ownUserId();
  if (own && c.fromId === own) return "own";
  if (!c.text) return "no-match";
  // Sem registro nem log: ao retomar, a próxima varredura pega o que ficou para trás (dentro dos 7 dias).
  if (await deps.paused()) return "paused";

  const rules = await deps.rules();
  const shortcode = rulesNeedShortcode(rules) ? await resolveShortcode(c.mediaId, deps) : undefined;
  const rule = findRule(c.text, { id: c.mediaId, shortcode }, rules);
  if (!rule) return "no-match";

  const key = `c:${c.id}`;
  const base = { source, commentId: c.id, mediaId: c.mediaId, username: c.username, text: c.text.slice(0, 140), rule: rule.id };
  const steps = stepsOf(rule);

  const state0 = (await store.hgetall<State>(key)) ?? {};
  if (state0.status === "done" || state0.status === "failed" || state0.status === "expired") return "done";
  if (state0.status === "waiting") return "waiting";

  const ts = c.timestamp ?? now;
  if (!state0.status && now - ts > WINDOW_MS) {
    await store.hset(key, { status: "expired", rule: rule.id, username: c.username ?? "", mediaId: c.mediaId });
    await store.expire(key, RETENTION_S);
    await log({ ...base, action: "expired", detail: "comentário com mais de 7 dias" }, now);
    return "expired";
  }

  if (deps.dryRun()) {
    await log({ ...base, action: "dry-run", detail: describeDryRun(steps, rule, c.username) }, now);
    return "dry-run";
  }

  const lockKey = `lock:${c.id}`;
  if (!(await store.set(lockKey, now, { nx: true, ex: 60 }))) return "locked";
  try {
    const state = (await store.hgetall<State>(key)) ?? {};
    if (state.status && state.status !== "running") return state.status === "waiting" ? "waiting" : "done";
    if (!state.status) {
      Object.assign(state, { status: "running", rule: rule.id, username: c.username ?? "", mediaId: c.mediaId, at: steps[0]?.id ?? "" });
      await store.hset(key, state);
      await store.expire(key, RETENTION_S);
      await mark(c.id, state, rule.id, "comment", now);
    }
    // Retomada (erro temporário): continua no fluxo da automação salva no estado.
    const r = state.rule && state.rule !== rule.id ? rules.find((x) => x.id === state.rule) ?? rule : rule;
    return await run({ commentId: c.id, rule: r, steps: stepsOf(r), state, base: { ...base, rule: r.id }, deps, now });
  } finally {
    await store.del(lockKey);
  }
}

/* ---------- cliques ---------- */

export type IncomingClick = { igsid: string; payload?: string; text?: string };

function buttonTitles(step: Step): string[] {
  if (step.type === "follow") return [step.button, step.retryButton];
  if (step.type === "dm" && step.button?.kind === "continue") return [step.button.title];
  return [];
}

/** A pessoa clicou num botão do fluxo (postback) ou digitou o texto do botão. */
export async function handleClick(ev: IncomingClick, source: string, deps: Deps = defaultDeps): Promise<Result> {
  const store = getStore();
  const now = deps.now();
  if (deps.dryRun() || (await deps.paused())) return "ignored";

  let target = ev.payload ? parseClickPayload(ev.payload) : null;
  if (!target && ev.text) {
    const commentId = await store.get<string>(`w:${ev.igsid}`);
    const st = commentId ? await store.hgetall<State>(`c:${commentId}`) : null;
    if (commentId && st?.status === "waiting" && st.waitStep) target = { commentId: String(commentId), stepId: st.waitStep };
  }
  if (!target) return "ignored";

  const key = `c:${target.commentId}`;
  const lockKey = `lock:${target.commentId}`;
  if (!(await store.set(lockKey, now, { nx: true, ex: 60 }))) return "locked";
  try {
    const state = (await store.hgetall<State>(key)) ?? {};
    if (state.status !== "waiting" || state.waitStep !== target.stepId) return "ignored";
    if (state.igsid && String(state.igsid) !== ev.igsid) return "ignored";

    const rules = await deps.rules();
    const rule = rules.find((r) => r.id === state.rule);
    if (!rule) return "ignored";
    const steps = stepsOf(rule);
    const idx = steps.findIndex((s) => s.id === target!.stepId);
    const step = steps[idx];
    const base = { source, commentId: target.commentId, mediaId: String(state.mediaId ?? ""), username: state.username, rule: rule.id };

    // Texto digitado só vale se for o texto do botão (a pessoa pode estar só conversando).
    if (!ev.payload && step) {
      const t = normalize(ev.text ?? "").trim();
      if (!buttonTitles(step).some((b) => t.includes(normalize(b).trim()))) return "ignored";
    }

    Object.assign(state, { clicked: 1, igsid: ev.igsid, status: "running", attempts: 0 });
    await store.hset(key, { clicked: 1, igsid: ev.igsid, status: "running", attempts: 0 });
    await store.set(`w:${ev.igsid}`, target.commentId, { ex: 7 * 86400 });
    await log({ ...base, step: target.stepId, action: "clicked", detail: ev.payload ? undefined : `Respondeu “${(ev.text ?? "").slice(0, 60)}”` }, now);

    const ctx: Ctx = { commentId: target.commentId, rule, steps, state, base, deps, now };
    await mark(target.commentId, state, rule.id, "click", now);
    if (!step) { state.at = ""; return run(ctx); }

    if (step.type === "follow") {
      let follows: boolean | null;
      try { follows = await deps.isFollower(ev.igsid); } catch (e) {
        follows = null;
        await log({ ...base, step: step.id, action: "follow-unknown", detail: errMsg(e).slice(0, 300) }, now);
      }
      if (follows === false) {
        const tries = (Number(state.followTries) || 0) + 1;
        state.fno = 1;
        await store.hset(key, { followTries: tries, fno: 1 });
        if (tries > MAX_FOLLOW_TRIES) {
          await store.hset(key, { status: "done", at: "" });
          await log({ ...base, step: step.id, action: "flow-done", detail: "Parou: a pessoa não seguiu depois de várias tentativas" }, now);
          return "completed";
        }
        await log({ ...base, step: step.id, action: "follow-no" }, now);
        try { await send(followMessage(step, ctx, true), ctx); } catch (e) {
          await store.hset(key, { status: "waiting" });
          await log({ ...base, step: step.id, action: "dm-error", detail: errMsg(e).slice(0, 300) }, now);
          return "dm-error";
        }
        await store.hset(key, { status: "waiting" });
        await log({ ...base, step: step.id, action: "waiting-click", detail: `Aguardando clique em “${step.retryButton}”` }, now);
        return "waiting";
      }
      if (follows) {
        await log({ ...base, step: step.id, action: "follow-ok" }, now);
        await markFollower(ctx);
      }
    }

    state.at = steps[idx + 1]?.id ?? "";
    await store.hset(key, { at: state.at });
    return await run(ctx);
  } finally {
    await store.del(lockKey);
  }
}

/**
 * Libera para nova tentativa os fluxos que falharam de vez (ex.: antes do App Review ser aprovado).
 * A próxima varredura retoma os que ainda estão dentro dos 7 dias, a partir do bloco que falhou.
 */
export async function resetFailed(): Promise<number> {
  const store = getStore();
  const ids = await store.lrange<string>(FAILED_KEY, 0, -1);
  const uniq = [...new Set(ids.map(String))];
  for (const id of uniq) {
    const st = await store.hgetall<State>(`c:${id}`);
    if (st?.status === "failed") await store.hset(`c:${id}`, { status: "running", attempts: 0 });
  }
  await store.del(FAILED_KEY);
  return uniq.length;
}
