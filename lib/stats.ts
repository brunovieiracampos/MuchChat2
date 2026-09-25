import type { Rule } from "@/config/rules";
import { dayKey } from "@/lib/activity";
import { stepsOf, waitsForClick } from "@/lib/flow";
import { getStore } from "@/lib/store";

/**
 * Funil por automação: contadores diários no Redis, um hash por automação (stats:{id}, campo "AAAA-MM-DD:etapa").
 * Não dependem do log (que guarda só os últimos 2.000 eventos). Cada comentário conta uma vez por etapa:
 * o processador marca a etapa no estado do comentário (c:{id}) antes de incrementar.
 */

export const STAGES = ["comment", "dm", "click", "follower", "gained", "done", "failed"] as const;
export type Stage = (typeof STAGES)[number];

export type Counts = Record<Stage, number>;

const statsKey = (ruleId: string) => `stats:${ruleId}`;

export async function bump(ruleId: string, stage: Stage, now: number): Promise<void> {
  await getStore().hincrby(statsKey(ruleId), `${dayKey(now)}:${stage}`, 1);
}

export async function deleteStats(ruleId: string): Promise<void> {
  await getStore().del(statsKey(ruleId));
}

export type RawStats = Record<string, number | string>;

export async function readStats(ruleId: string): Promise<RawStats> {
  return (await getStore().hgetall<RawStats>(statsKey(ruleId))) ?? {};
}

export function emptyCounts(): Counts {
  return Object.fromEntries(STAGES.map((s) => [s, 0])) as Counts;
}

/** Soma os contadores dos últimos `days` dias (contando hoje, fuso de Brasília). `days` = 0 soma tudo. */
export function sumCounts(raw: RawStats, days: number, now = Date.now()): Counts {
  const out = emptyCounts();
  const keys = new Set<string>();
  for (let i = 0; i < days; i++) keys.add(dayKey(now - i * 864e5));
  for (const [field, v] of Object.entries(raw)) {
    const [day, stage] = field.split(":");
    if (days && !keys.has(day)) continue;
    if (stage in out) out[stage as Stage] += Number(v) || 0;
  }
  return out;
}

export type FunnelRow = { stage: Stage; label: string; hint: string; value: number; ofFirst: number | null; ofPrev: number | null };

/** Etapas que fazem sentido para o fluxo da automação, em ordem. */
export function funnelStages(rule: Rule): Stage[] {
  const steps = stepsOf(rule);
  const out: Stage[] = ["comment"];
  if (steps.some((s) => s.type === "dm" || s.type === "follow")) out.push("dm");
  if (steps.some(waitsForClick)) out.push("click");
  if (steps.some((s) => s.type === "follow")) out.push("follower");
  out.push("done");
  return out;
}

const LABEL: Record<Stage, { label: string; hint: string }> = {
  comment: { label: "Comentaram", hint: "Comentários com a palavra-chave" },
  dm: { label: "Receberam a DM", hint: "A primeira mensagem chegou no direct" },
  click: { label: "Clicaram", hint: "Tocaram no botão para continuar" },
  follower: { label: "Seguem o perfil", hint: "Passaram pela verificação de seguidor" },
  gained: { label: "Novos seguidores", hint: "Não seguiam e passaram a seguir no fluxo" },
  done: { label: "Concluíram o fluxo", hint: "Chegaram ao último bloco" },
  failed: { label: "Falharam", hint: "O Instagram recusou a mensagem" },
};

export function buildFunnel(rule: Rule, c: Counts): FunnelRow[] {
  const stages = funnelStages(rule);
  const first = c[stages[0]];
  return stages.map((stage, i) => {
    const prev = i ? c[stages[i - 1]] : null;
    return {
      stage, ...LABEL[stage], value: c[stage],
      ofFirst: first ? c[stage] / first : null,
      ofPrev: prev ? c[stage] / prev : null,
    };
  });
}

export const stageLabel = (s: Stage) => LABEL[s].label;
