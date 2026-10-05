import { clickPayload, renderText, stepsOf, waitsForClick, type Step } from "@/lib/flow";
import type * as ig from "@/lib/instagram";
import { defaultDeps, isFormatError, log, mark, textOnly, type Deps, type State } from "@/lib/processor";
import { getStore } from "@/lib/store";

/**
 * Lembrete para quem parou num botão (spec: docs/superpowers/specs/2026-10-05-lembrete-design.md).
 * Não sabe quem o chama nem quando: quem cuida do atraso é workflows/flow-reminder.
 * - Nunca clicou: resposta pública no comentário (outra DM o Instagram não aceita).
 * - Clicou e parou: DM com o mesmo botão, dentro de 24h do último clique.
 * No máximo um de cada por comentário; o lembrete não muda o estado do fluxo.
 */

export type ReminderResult = "public" | "dm" | "skipped";
export type ReminderDeps = Pick<Deps, "replyToComment" | "sendMessage" | "dryRun" | "paused" | "rules" | "now">;

/** O comentário está sendo processado agora (ex.: um clique chegando): quem chamou tenta de novo. */
export class ReminderBusy extends Error {}

/** 24h da janela do Instagram menos 1h de folga. */
const DM_WINDOW_MS = 23 * 3600e3;

/** Qual lembrete ainda cabe para esta pessoa, se algum. */
export function reminderKind(state: State, now: number): "public" | "dm" | null {
  if (!state.clicked) return state.rp ? null : "public";
  if (state.rd || !state.igsid) return null;
  const at = Number(state.clickAt) || 0;
  return at && now - at < DM_WINDOW_MS ? "dm" : null;
}

/** Sem nome de usuário, {usuario} some: tira a vírgula que sobraria no começo. */
function publicText(template: string, link: string, username?: string): string {
  const t = renderText(template, link, username).trim().replace(/^[,;:\s]+/, "");
  return username ? t : t.charAt(0).toUpperCase() + t.slice(1);
}

function buttonTitle(step: Step, state: State): string {
  if (step.type === "follow") return state.fno ? step.retryButton : step.button;
  return step.type === "dm" && step.button ? step.button.title : "";
}

export async function sendReminder(commentId: string, wseq: number, deps: ReminderDeps = defaultDeps): Promise<ReminderResult> {
  const store = getStore();
  const now = deps.now();
  if (deps.dryRun() || (await deps.paused())) return "skipped";

  const key = `c:${commentId}`;
  const lockKey = `lock:${commentId}`;
  if (!(await store.set(lockKey, now, { nx: true, ex: 60 }))) throw new ReminderBusy("Comentário em processamento; tentar de novo.");
  try {
    const state = (await store.hgetall<State>(key)) ?? {};
    if (state.status !== "waiting" || !state.waitStep || Number(state.wseq) !== wseq) return "skipped";
    const rule = (await deps.rules()).find((r) => r.id === state.rule);
    if (!rule || rule.active === false || !rule.reminder?.enabled) return "skipped";
    const step = stepsOf(rule).find((s) => s.id === state.waitStep);
    if (!step || !waitsForClick(step)) return "skipped";
    const kind = reminderKind(state, now);
    if (!kind) return "skipped";

    const base = { source: "reminder", commentId, mediaId: String(state.mediaId ?? ""), username: state.username, rule: rule.id, step: step.id };
    if (kind === "public") {
      const text = publicText(rule.reminder.publicText, rule.link, state.username);
      await deps.replyToComment(commentId, text);
      await store.hset(key, { rp: 1 });
      await log({ ...base, action: "reminder-public", detail: text }, now);
    } else {
      const title = buttonTitle(step, state);
      const m: ig.OutMessage = {
        text: renderText(rule.reminder.dmText, rule.link, state.username),
        buttons: [{ type: "postback", title, payload: clickPayload(commentId, step.id) }],
      };
      let detail = `Com botão “${title}”`;
      try {
        await deps.sendMessage(String(state.igsid), m);
      } catch (e) {
        if (!isFormatError(e)) throw e;
        await deps.sendMessage(String(state.igsid), textOnly(m));
        detail = "Enviado sem botão: o Instagram recusou o modelo com botão";
      }
      await store.hset(key, { rd: 1 });
      await log({ ...base, action: "reminder-dm", detail }, now);
    }
    await mark(commentId, state, rule.id, "reminded", now);
    return kind;
  } finally {
    await store.del(lockKey);
  }
}

/** O lembrete falhou de vez: fica registrado em Execuções; o fluxo continua esperando o clique. */
export async function logReminderFailure(commentId: string, detail: string, deps: Pick<ReminderDeps, "now"> = defaultDeps): Promise<void> {
  const state = (await getStore().hgetall<State>(`c:${commentId}`)) ?? {};
  await log({
    source: "reminder", commentId, mediaId: String(state.mediaId ?? ""), username: state.username, rule: state.rule,
    step: state.waitStep, action: "reminder-failed", detail: detail.slice(0, 300),
  }, deps.now());
}
