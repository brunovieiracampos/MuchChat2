import type { Rule } from "@/config/rules";
import { hasKeyword } from "@/lib/match";
import type { LogEntry } from "@/lib/processor";

/**
 * Visões do painel montadas a partir do log de eventos (lib/processor.ts).
 * Funções puras: recebem o log (mais recente primeiro) e as automações.
 */

export const TZ = "America/Sao_Paulo";

export type ExecStatus = "concluida" | "andamento" | "aguardando" | "falhou" | "simulacao" | "expirada";

export type Execution = {
  commentId: string;
  mediaId: string;
  ruleId?: string;
  ruleName: string;
  username?: string;
  text?: string;
  keyword?: string;
  startedAt: number;
  lastAt: number;
  status: ExecStatus;
  step: string;
  error?: string;
  steps: { action: string; label: string; at: number; ok: boolean; detail?: string }[];
};

const STEP_LABEL: Record<string, string> = {
  "dry-run": "Simulação: nada foi enviado",
  expired: "Comentário com mais de 7 dias",
  "dm-sent": "Direct enviado",
  "dm-error": "Falha temporária no direct",
  "dm-failed": "Direct recusado",
  "reply-sent": "Comentário respondido",
  "reply-error": "Falha temporária na resposta",
  "reply-failed": "Resposta pública recusada",
  "waiting-click": "Esperando o clique",
  clicked: "A pessoa clicou",
  "follow-ok": "Segue o perfil",
  "follow-no": "Ainda não segue",
  "follow-unknown": "Não deu para conferir se segue; liberado",
  "flow-done": "Fluxo concluído",
};

const FAIL = new Set(["dm-error", "dm-failed", "reply-error", "reply-failed", "expired"]);

export function dayKey(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Status pelo último evento relevante (entradas em ordem cronológica). */
function statusOf(chrono: LogEntry[]): { status: ExecStatus; step: string } {
  const last = chrono[chrono.length - 1];
  switch (last.action) {
    case "flow-done": return { status: "concluida", step: last.detail ?? "Fluxo concluído" };
    case "dm-failed": return { status: "falhou", step: "Mensagem recusada pelo Instagram" };
    case "expired": return { status: "expirada", step: "Fora da janela de 7 dias" };
    case "waiting-click": return { status: "aguardando", step: last.detail ?? "Esperando o clique" };
    case "dry-run": return { status: "simulacao", step: "Modo de teste: nada foi enviado" };
    case "dm-error":
    case "reply-error": return { status: "andamento", step: "Nova tentativa na próxima varredura" };
    default: return { status: "andamento", step: STEP_LABEL[last.action] ?? "Processando" };
  }
}

export function buildExecutions(log: LogEntry[], rules: Rule[]): Execution[] {
  const byId = new Map<string, LogEntry[]>();
  for (const e of log) {
    const l = byId.get(e.commentId);
    if (l) l.push(e); else byId.set(e.commentId, [e]);
  }
  const names = new Map(rules.map((r) => [r.id, r]));
  const out: Execution[] = [];
  for (const [commentId, entries] of byId) {
    const chrono = [...entries].sort((a, b) => a.at - b.at);
    // Em modo de teste a varredura registra a mesma simulação várias vezes; mostra só a última.
    const steps = chrono.filter((e, i) => e.action !== "dry-run" || !chrono.slice(i + 1).some((n) => n.action === "dry-run"));
    const first = chrono[0], last = chrono[chrono.length - 1];
    const rule = first.rule ? names.get(first.rule) : undefined;
    const { status, step } = statusOf(chrono);
    const err = [...chrono].reverse().find((e) => FAIL.has(e.action));
    out.push({
      commentId,
      mediaId: first.mediaId,
      ruleId: first.rule,
      ruleName: rule?.name ?? first.rule ?? "—",
      username: chrono.find((e) => e.username)?.username,
      text: first.text,
      keyword: rule && first.text ? rule.keywords.find((k) => hasKeyword(first.text!, k)) : undefined,
      startedAt: first.at,
      lastAt: last.at,
      status,
      step,
      error: status === "falhou" || (status === "andamento" && err && err === chrono[chrono.length - 1]) ? err?.detail : undefined,
      steps: steps.map((e) => ({ action: e.action, label: STEP_LABEL[e.action] ?? e.action, at: e.at, ok: !FAIL.has(e.action), detail: e.detail })),
    });
  }
  return out.sort((a, b) => b.lastAt - a.lastAt);
}

export type Contact = {
  username: string;
  lastAt: number;
  firstAt: number;
  count: number;
  automations: string[];
  keywords: string[];
  status: ExecStatus;
};

export function buildContacts(execs: Execution[]): Contact[] {
  const map = new Map<string, Contact>();
  for (const e of execs) {
    const u = e.username || "desconhecido";
    const c = map.get(u);
    if (!c) {
      map.set(u, { username: u, lastAt: e.lastAt, firstAt: e.startedAt, count: 1, automations: [e.ruleName], keywords: e.keyword ? [e.keyword] : [], status: e.status });
      continue;
    }
    c.count++;
    c.firstAt = Math.min(c.firstAt, e.startedAt);
    if (!c.automations.includes(e.ruleName)) c.automations.push(e.ruleName);
    if (e.keyword && !c.keywords.includes(e.keyword)) c.keywords.push(e.keyword);
  }
  return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
}

export type Summary = {
  comments: number;
  dmSent: number;
  replies: number;
  failed: number;
  simulated: number;
  perDay: { day: string; label: string; value: number }[];
  perAutomation: { id: string; name: string; runs: number; failed: number }[];
  perKeyword: { keyword: string; count: number }[];
};

/** Números de um período (em dias, contando hoje) no fuso de Brasília. */
export function summarize(execs: Execution[], rules: Rule[], days: number, now = Date.now()): Summary {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(now - i * 864e5));
  const inRange = new Set(keys);
  const list = execs.filter((e) => inRange.has(dayKey(e.startedAt)));
  const count = (pred: (e: Execution) => boolean) => list.filter(pred).length;

  const perDay = keys.map((k) => ({ day: k, label: dayLabel(k, days), value: 0 }));
  const idx = new Map(keys.map((k, i) => [k, i]));
  for (const e of list) perDay[idx.get(dayKey(e.startedAt))!].value++;

  const perAutomation = rules.map((r) => ({
    id: r.id,
    name: r.name ?? r.id,
    runs: list.filter((e) => e.ruleId === r.id).length,
    failed: list.filter((e) => e.ruleId === r.id && e.status === "falhou").length,
  })).sort((a, b) => b.runs - a.runs);

  const kw = new Map<string, number>();
  for (const e of list) if (e.keyword) kw.set(e.keyword, (kw.get(e.keyword) ?? 0) + 1);

  return {
    comments: list.length,
    dmSent: count((e) => e.steps.some((s) => s.action === "dm-sent")),
    replies: count((e) => e.steps.some((s) => s.action === "reply-sent")),
    failed: count((e) => e.status === "falhou"),
    simulated: count((e) => e.status === "simulacao"),
    perDay: days > 31 ? weekly(perDay) : perDay,
    perAutomation,
    perKeyword: [...kw.entries()].map(([keyword, n]) => ({ keyword, count: n })).sort((a, b) => b.count - a.count),
  };
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function dayLabel(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  if (days <= 7) return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** Em períodos longos, agrupa em semanas para o gráfico caber. */
function weekly(perDay: Summary["perDay"]): Summary["perDay"] {
  const out: Summary["perDay"] = [];
  for (let i = 0; i < perDay.length; i += 7) {
    const chunk = perDay.slice(i, i + 7);
    out.push({ day: chunk[0].day, label: chunk[0].label, value: chunk.reduce((s, x) => s + x.value, 0) });
  }
  return out;
}
