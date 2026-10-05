import type { Rule } from "@/config/rules";
import { clickPayload, renderText, stepsOf, waitsForClick, type Step } from "@/lib/flow";
import { GraphError, type OutMessage } from "@/lib/instagram";
import { PERSON_TTL_S, defaultDeps, isFormatError, log, mark, personKey, textOnly, type Deps, type State } from "@/lib/processor";
import { getStore } from "@/lib/store";

/**
 * Lembrete para quem parou num botão (spec: docs/superpowers/specs/2026-10-05-lembrete-design.md).
 * Não sabe quem o chama nem quando: quem cuida do atraso é workflows/flow-reminder.
 * - Nunca clicou: resposta pública no comentário (outra DM o Instagram não aceita).
 * - Clicou e parou: DM com o mesmo botão, dentro de 24h do último clique.
 * No máximo um de cada por comentário; o lembrete não muda o estado do fluxo.
 *
 * Nunca envia duas vezes: o lembrete é marcado como enviado ANTES do envio, e a marca só é desfeita quando a Meta
 * responde que recusou (aí é certo que nada saiu). Sem confirmação (rede, erro 5xx), fica marcado e não repete:
 * numa resposta pública, perder um lembrete é melhor do que publicar dois.
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

/** A Meta respondeu que recusou (4xx): com certeza nada foi enviado. */
const definitelyNotSent = (e: unknown) => e instanceof GraphError && e.status >= 400 && e.status < 500;

export async function sendReminder(commentId: string, wseq: number, deps: ReminderDeps = defaultDeps): Promise<ReminderResult> {
  const store = getStore();
  const now = deps.now();
  if (deps.dryRun() || (await deps.paused())) return "skipped";

  const key = `c:${commentId}`;
  const lockKey = `lock:${commentId}`;
  if (!(await store.set(lockKey, now, { nx: true, ex: 60 }))) throw new ReminderBusy("Comentário em processamento; tentar de novo.");
  // Sob o bloqueio só se decide e se marca; o envio vem depois, para um clique nesse instante não ser descartado.
  let plan: { kind: "public" | "dm"; rule: Rule; step: Step; state: State; person: string | null };
  try {
    const state = (await store.hgetall<State>(key)) ?? {};
    if (state.status !== "waiting" || !state.waitStep || Number(state.wseq) !== wseq) return "skipped";
    const rule = (await deps.rules()).find((r) => r.id === state.rule);
    if (!rule || rule.active === false || !rule.reminder?.enabled) return "skipped";
    const step = stepsOf(rule).find((s) => s.id === state.waitStep);
    if (!step || !waitsForClick(step)) return "skipped";
    const kind = reminderKind(state, now);
    if (!kind) return "skipped";
    // A mesma pessoa pode ter comentado mais de uma vez: se já clicou ou já foi lembrada por outro comentário, não repete em público.
    const person = kind === "public" && state.igsid ? personKey(rule.id, String(state.igsid)) : null;
    if (person) {
      const other = await store.get<string>(person);
      if (other && String(other) !== commentId) return "skipped";
    }
    await store.hset(key, kind === "public" ? { rp: 1 } : { rd: 1 });
    if (person) await store.set(person, commentId, { ex: PERSON_TTL_S });
    plan = { kind, rule, step, state, person };
  } finally {
    await store.del(lockKey);
  }

  const { kind, rule, step, state } = plan;
  const reminder = rule.reminder!;
  const base = { source: "reminder", commentId, mediaId: String(state.mediaId ?? ""), username: state.username, rule: rule.id, step: step.id };
  let detail: string;
  try {
    if (kind === "public") {
      detail = publicText(reminder.publicText, rule.link, state.username);
      await deps.replyToComment(commentId, detail);
    } else {
      const title = buttonTitle(step, state);
      const m: OutMessage = {
        text: renderText(reminder.dmText, rule.link, state.username),
        buttons: [{ type: "postback", title, payload: clickPayload(commentId, step.id) }],
      };
      detail = `Com botão “${title}”`;
      try {
        await deps.sendMessage(String(state.igsid), m);
      } catch (e) {
        if (!isFormatError(e)) throw e;
        await deps.sendMessage(String(state.igsid), textOnly(m));
        detail = "Enviado sem botão: o Instagram recusou o modelo com botão";
      }
    }
  } catch (e) {
    if (definitelyNotSent(e)) {
      await store.hset(key, kind === "public" ? { rp: "" } : { rd: "" });
      if (plan.person) await store.del(plan.person);
      throw e;
    }
    await log({ ...base, action: "reminder-failed", detail: "Sem confirmação do envio; não será repetido, para não duplicar." }, now);
    return "skipped";
  }
  await log({ ...base, action: kind === "public" ? "reminder-public" : "reminder-dm", detail }, now);
  await mark(commentId, state, rule.id, "reminded", now);
  return kind;
}

/** O lembrete falhou de vez: fica registrado em Execuções, se a pessoa ainda estiver na mesma espera. O fluxo não muda. */
export async function logReminderFailure(commentId: string, wseq: number, detail: string, deps: Pick<ReminderDeps, "now"> = defaultDeps): Promise<void> {
  const state = (await getStore().hgetall<State>(`c:${commentId}`)) ?? {};
  if (state.status !== "waiting" || Number(state.wseq) !== wseq) return;
  await log({
    source: "reminder", commentId, mediaId: String(state.mediaId ?? ""), username: state.username, rule: state.rule,
    step: state.waitStep, action: "reminder-failed", detail: detail.slice(0, 300),
  }, deps.now());
}

export type RetryPlan = { kind: "retry"; afterSec: number } | { kind: "skip" } | { kind: "fail" };

/**
 * O que fazer com um erro do lembrete na tentativa `attempt` (de 1 a `max` + 1).
 * - Comentário ocupado: quase sempre é um clique chegando; espera um pouco e, se continuar, desiste sem registrar.
 * - Recusa definitiva da Meta: falha na hora. Limite de taxa ou erro transitório: espera minutos antes de tentar.
 */
export function retryPlan(e: unknown, attempt: number, max: number): RetryPlan {
  const last = attempt > max;
  if (e instanceof ReminderBusy) return last ? { kind: "skip" } : { kind: "retry", afterSec: 45 };
  if (last || (e instanceof GraphError && e.permanent)) return { kind: "fail" };
  return { kind: "retry", afterSec: e instanceof GraphError ? 300 : 60 };
}
