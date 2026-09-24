import { DEFAULT_PUBLIC_REPLIES, type Rule } from "@/config/rules";
import { isPaused, listAutomations, renderDm } from "@/lib/automations";
import { findRule, rulesNeedShortcode } from "@/lib/match";
import { getStore } from "@/lib/store";
import * as ig from "@/lib/instagram";

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
  sendPrivateReply: (commentId: string, text: string) => Promise<unknown>;
  replyToComment: (commentId: string, message: string) => Promise<unknown>;
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
  replyToComment: ig.replyToComment,
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
const LOG_KEY = "log";
const FAILED_KEY = "failed";
const RETENTION_S = 90 * 86400; // bate com a política de privacidade

type State = {
  rule?: string;
  dm?: "sent" | "failed" | "expired";
  dmAttempts?: number;
  dmError?: string;
  dmAt?: number;
  reply?: "sent" | "failed";
  replyAttempts?: number;
  replyError?: string;
  replyAt?: number;
  replyText?: string;
  username?: string;
  mediaId?: string;
};

export type LogEntry = {
  at: number;
  source: string;
  commentId: string;
  mediaId: string;
  username?: string;
  text?: string;
  rule?: string;
  action: string;
  detail?: string;
};

async function log(e: Omit<LogEntry, "at">, now: number) {
  const entry = { at: now, ...e };
  console.log("[dm]", JSON.stringify(entry));
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
    console.error("[dm] falha ao buscar shortcode", mediaId, e);
    return undefined;
  }
}

async function pickPublicReply(rule: Rule, deps: Deps): Promise<string> {
  const opts = rule.publicReplies?.length ? rule.publicReplies : DEFAULT_PUBLIC_REPLIES;
  if (opts.length === 1) return opts[0];
  const store = getStore();
  const last = await store.get<number>("reply:last");
  let i = Math.floor(deps.random() * opts.length);
  if (i === last) i = (i + 1) % opts.length;
  await store.set("reply:last", i);
  return opts[i];
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
function isPermanent(e: unknown) {
  return e instanceof ig.GraphError ? e.permanent : false;
}

export type Result =
  | "own" | "paused" | "no-match" | "expired" | "locked" | "done" | "dry-run"
  | "dm-sent" | "dm-error" | "dm-failed" | "reply-error";

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

  const state0 = (await store.hgetall<State>(key)) ?? {};
  if ((state0.dm === "sent" && state0.reply) || state0.dm === "failed" || state0.dm === "expired") return "done";

  const ts = c.timestamp ?? now;
  if (state0.dm !== "sent" && now - ts > WINDOW_MS) {
    await store.hset(key, { rule: rule.id, dm: "expired", username: c.username ?? "", mediaId: c.mediaId });
    await store.expire(key, RETENTION_S);
    await log({ ...base, action: "expired", detail: "comentário com mais de 7 dias" }, now);
    return "expired";
  }

  if (deps.dryRun()) {
    await log({ ...base, action: "dry-run", detail: renderDm(rule, c.username).slice(0, 200) }, now);
    return "dry-run";
  }

  const lockKey = `lock:${c.id}`;
  if (!(await store.set(lockKey, now, { nx: true, ex: 60 }))) return "locked";

  try {
    const state = (await store.hgetall<State>(key)) ?? {};
    await store.hset(key, { rule: rule.id, username: c.username ?? "", mediaId: c.mediaId });
    await store.expire(key, RETENTION_S);

    // 1) DM (Private Reply) — vem primeiro para a resposta pública nunca prometer algo que não chegou.
    if (state.dm !== "sent") {
      const text = renderDm(rule, c.username);
      try {
        await deps.sendPrivateReply(c.id, text);
        await store.hset(key, { dm: "sent", dmAt: now });
        state.dm = "sent";
        await log({ ...base, action: "dm-sent" }, now);
      } catch (e) {
        const attempts = (state.dmAttempts ?? 0) + 1;
        const final = isPermanent(e) || attempts >= MAX_ATTEMPTS;
        await store.hset(key, { dmAttempts: attempts, dmError: errMsg(e).slice(0, 500), ...(final ? { dm: "failed" } : {}) });
        if (final) await store.lpush(FAILED_KEY, c.id, 5000);
        await log({ ...base, action: final ? "dm-failed" : "dm-error", detail: errMsg(e).slice(0, 300) }, now);
        return final ? "dm-failed" : "dm-error";
      }
    }

    // 2) Resposta pública
    if (!state.reply) {
      const msg = await pickPublicReply(rule, deps);
      try {
        await deps.replyToComment(c.id, msg);
        await store.hset(key, { reply: "sent", replyAt: now, replyText: msg });
        await log({ ...base, action: "reply-sent", detail: msg }, now);
      } catch (e) {
        const attempts = (state.replyAttempts ?? 0) + 1;
        const final = isPermanent(e) || attempts >= MAX_ATTEMPTS;
        await store.hset(key, { replyAttempts: attempts, replyError: errMsg(e).slice(0, 500), ...(final ? { reply: "failed" } : {}) });
        await log({ ...base, action: final ? "reply-failed" : "reply-error", detail: errMsg(e).slice(0, 300) }, now);
        return "reply-error";
      }
    }
    return "dm-sent";
  } finally {
    await store.del(lockKey);
  }
}

/**
 * Libera para nova tentativa as DMs que falharam de vez (ex.: enviadas antes do App Review ser aprovado).
 * A próxima varredura reprocessa as que ainda estão dentro dos 7 dias.
 */
export async function resetFailed(): Promise<number> {
  const store = getStore();
  const ids = await store.lrange<string>(FAILED_KEY, 0, -1);
  const uniq = [...new Set(ids.map(String))];
  for (const id of uniq) {
    const st = await store.hgetall<State>(`c:${id}`);
    if (st?.dm === "failed") await store.hset(`c:${id}`, { dm: "", dmAttempts: 0, reply: st.reply === "failed" ? "" : st.reply ?? "" });
  }
  await store.del(FAILED_KEY);
  return uniq.length;
}
