import type { Rule } from "@/config/rules";
import { dayKey } from "@/lib/activity";
import type { IgMedia } from "@/lib/instagram";
import { isPlaceholderPost, ruleAppliesToMedia } from "@/lib/match";
import type { PostKind, PostStatus, ScheduledPost } from "@/lib/posts";
import { emptyCounts, funnelStages, STAGES, stageLabel, sumCounts, type Counts, type FunnelRow, type RawStats, type Stage } from "@/lib/stats";

/**
 * Números e listas da Visão geral. Funções puras: recebem automações, contadores, posts e mídias do Instagram.
 * Datas no fuso de Brasília (dayKey). Semana de segunda a domingo.
 */

/* ---------- automações ---------- */

export type AutomationStatus = { active: number; waiting: number; paused: number; total: number };

/** Ativas respondem agora; aguardando post estão ligadas mas presas a um post que ainda não saiu; pausadas estão desligadas. */
export function automationStatus(rules: Rule[]): AutomationStatus {
  let active = 0, waiting = 0, paused = 0;
  for (const r of rules) {
    if (r.active === false) paused++;
    else if (r.posts.some(isPlaceholderPost)) waiting++;
    else active++;
  }
  return { active, waiting, paused, total: rules.length };
}

/* ---------- totais e série diária (contadores duráveis por automação) ---------- */

/** Soma os contadores de todas as automações no período (`days` = 0 soma tudo). */
export function totals(stats: Map<string, RawStats>, days: number, now = Date.now()): Counts {
  const out = emptyCounts();
  for (const raw of stats.values()) {
    const c = sumCounts(raw, days, now);
    for (const k of Object.keys(out) as (keyof Counts)[]) out[k] += c[k];
  }
  return out;
}

/**
 * Comentários respondidos pela automação (resposta pública ou mensagem no direct).
 * A etapa "reply" passou a ser contada em 2026-10-01; antes disso só existia "dm". Como quase todo fluxo
 * faz as duas coisas, o maior dos dois é uma boa aproximação da união sem contar o mesmo comentário duas vezes.
 */
export const answered = (c: Pick<Counts, "reply" | "dm">) => Math.max(c.reply, c.dm);

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export type DayPoint = { day: string; label: string; value: number };

/** Comentários com palavra-chave por dia (ou por semana, acima de 31 dias), somando todas as automações. */
export function dailyComments(stats: Map<string, RawStats>, days: number, now = Date.now()): DayPoint[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(now - i * 864e5));
  const byDay = new Map(keys.map((k) => [k, 0]));
  for (const raw of stats.values()) {
    for (const [field, v] of Object.entries(raw)) {
      const [day, stage] = field.split(":");
      if (stage === "comment" && byDay.has(day)) byDay.set(day, byDay.get(day)! + (Number(v) || 0));
    }
  }
  const points = keys.map((k) => ({ day: k, label: labelOf(k, days), value: byDay.get(k)! }));
  if (days <= 31) return points;
  const weeks: DayPoint[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7);
    weeks.push({ day: chunk[0].day, label: chunk[0].label, value: chunk.reduce((s, p) => s + p.value, 0) });
  }
  return weeks;
}

function labelOf(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  if (days <= 7) return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/* ---------- semana do calendário ---------- */

export type CalDay = { key: string; weekday: string; date: string; isToday: boolean; /** Na vista de mês: o dia pertence ao mês mostrado. */ inMonth?: boolean };
export type Week = { start: string; days: CalDay[]; from: number; to: number };
/** Qualquer intervalo de dias do calendário (semana, grade do mês, período livre). */
export type CalRange = Week;

export const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Semana de segunda a domingo que contém hoje, deslocada `offset` semanas. `from`/`to` cobrem com folga de 1 dia. */
export function weekOf(offset: number, now = Date.now()): Week {
  const today = dayKey(now);
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const start = addDays(today, -((dow + 6) % 7) + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(start, i);
    const [, mm, dd] = key.split("-");
    return { key, weekday: WEEKDAYS[(i + 1) % 7], date: `${dd}/${mm}`, isToday: key === today };
  });
  const startMs = Date.parse(`${start}T00:00:00-03:00`);
  return { start, days, from: startMs - 864e5, to: startMs + 8 * 864e5 };
}

/* ---------- itens do calendário ---------- */

export type CalStatus = PostStatus | "instagram";

export type CalItem = {
  id: string;
  /** Publicação agendada no Much Chat, ou post que saiu direto pelo Instagram. */
  source: "agendada" | "instagram";
  status: CalStatus;
  kind: PostKind | "video" | "reel";
  day: string;
  at: number;
  caption: string;
  mediaCount: number;
  thumb?: string;
  permalink?: string;
  likes?: number;
  comments?: number;
  automation?: { id: string; name: string; counts: Counts };
  error?: string;
};

const DATED: PostStatus[] = ["scheduled", "preparing", "publishing", "published", "failed"];

const igKind = (m: IgMedia): CalItem["kind"] =>
  m.media_type === "CAROUSEL_ALBUM" ? "carousel" : m.media_type === "VIDEO" ? "reel" : "image";

/**
 * Publicações da semana: agendadas no Much Chat (com data) e posts do Instagram do mesmo período que não vieram
 * do agendamento. Um post publicado pelo Much Chat usa os números do Instagram quando a mídia aparece na lista.
 */
export function calendarItems(
  week: CalRange, posts: ScheduledPost[], media: IgMedia[], rules: Rule[],
  stats: Map<string, RawStats>, thumbs: Record<string, string>,
): CalItem[] {
  const keys = new Set(week.days.map((d) => d.key));
  const byIg = new Map(media.map((m) => [m.id, m]));
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const automationOf = (r?: Rule) => r ? { id: r.id, name: r.name ?? r.id, counts: sumCounts(stats.get(r.id) ?? {}, 0) } : undefined;
  const out: CalItem[] = [];
  const fromUs = new Set<string>();

  for (const p of posts) {
    if (!DATED.includes(p.status)) continue;
    const at = p.status === "published" ? p.publishedAt ?? p.scheduledAt : p.scheduledAt;
    if (!at || !keys.has(dayKey(at))) continue;
    const ig = p.igMediaId ? byIg.get(p.igMediaId) : undefined;
    if (p.igMediaId) fromUs.add(p.igMediaId);
    out.push({
      id: p.id, source: "agendada", status: p.status, kind: p.kind, day: dayKey(at), at,
      caption: p.caption, mediaCount: p.media.length,
      thumb: (p.media[0] && thumbs[p.media[0].path]) || ig?.thumbnail_url || ig?.media_url,
      permalink: p.permalink ?? ig?.permalink,
      likes: ig?.like_count, comments: ig?.comments_count,
      automation: automationOf(p.automationId ? ruleById.get(p.automationId) : undefined),
      error: p.status === "failed" ? p.error ?? undefined : undefined,
    });
  }

  for (const m of media) {
    if (!m.timestamp || fromUs.has(m.id)) continue;
    const at = Date.parse(m.timestamp);
    if (!keys.has(dayKey(at))) continue;
    const rule = rules.find((r) => !r.posts.includes("*") && ruleAppliesToMedia(r, { id: m.id, shortcode: m.shortcode }));
    out.push({
      id: `ig:${m.id}`, source: "instagram", status: "instagram", kind: igKind(m), day: dayKey(at), at,
      caption: m.caption ?? "", mediaCount: 1, thumb: m.thumbnail_url ?? m.media_url, permalink: m.permalink,
      likes: m.like_count, comments: m.comments_count, automation: automationOf(rule),
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/* ---------- publicações do período ---------- */

/** Posts publicados desde `since` (a lista vem do mais novo para o mais antigo). */
export const mediaSince = (media: IgMedia[], since: number) => media.filter((m) => m.timestamp && Date.parse(m.timestamp) >= since);

/** Os `n` posts com mais comentários, só os que têm pelo menos um. */
export const topByComments = (media: IgMedia[], n = 5) =>
  [...media].filter((m) => (m.comments_count ?? 0) > 0).sort((a, b) => (b.comments_count ?? 0) - (a.comments_count ?? 0)).slice(0, n);

/** Início do período em ms (hoje conta como um dos dias), no fuso de Brasília. */
export function periodStart(days: number, now = Date.now()): number {
  return Date.parse(`${dayKey(now - (days - 1) * 864e5)}T00:00:00-03:00`);
}

/* ---------- funil geral ---------- */

/** Funil somando todas as automações, com as etapas que pelo menos um fluxo usa (na ordem do funil). */
export function overallFunnel(rules: Rule[], c: Counts): FunnelRow[] {
  const used = new Set<Stage>(rules.flatMap((r) => funnelStages(r)));
  if (!used.size) used.add("comment");
  const stages = STAGES.filter((s) => used.has(s));
  return stages.map((stage, i) => {
    const prev = i ? c[stages[i - 1]] : null;
    return { stage, label: stageLabel(stage), hint: "", value: c[stage], ofFirst: c[stages[0]] ? c[stage] / c[stages[0]] : null, ofPrev: prev ? c[stage] / prev : null };
  });
}

/* ---------- intervalos do calendário de publicações ---------- */

export const isDayKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

const weekdayOf = (key: string) => WEEKDAYS[new Date(`${key}T12:00:00Z`).getUTCDay()];
const startMs = (key: string) => Date.parse(`${key}T00:00:00-03:00`);

function rangeFrom(start: string, count: number, now: number, month?: string): CalRange {
  const today = dayKey(now);
  const days = Array.from({ length: count }, (_, i) => {
    const key = addDays(start, i);
    const [, mm, dd] = key.split("-");
    return { key, weekday: weekdayOf(key), date: `${dd}/${mm}`, isToday: key === today, ...(month ? { inMonth: key.slice(0, 7) === month } : {}) };
  });
  return { start, days, from: startMs(start) - 864e5, to: startMs(start) + (count + 1) * 864e5 };
}

/** Segunda-feira da semana que contém o dia. */
export function mondayOf(key: string): string {
  return addDays(key, -((new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7));
}

/** Semana (segunda a domingo) que contém o dia. */
export const weekContaining = (key: string, now = Date.now()) => rangeFrom(mondayOf(key), 7, now);

/** Grade do mês que contém o dia: semanas completas de segunda a domingo (4 a 6 linhas). */
export function monthGrid(key: string, now = Date.now()): CalRange {
  const month = key.slice(0, 7);
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const start = mondayOf(first);
  const end = addDays(mondayOf(last), 6);
  const count = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 864e5) + 1;
  return rangeFrom(start, count, now, month);
}

/** Período livre entre dois dias (inclusive), limitado a 93 dias. Datas invertidas são trocadas. */
export function customRange(a: string, b: string, now = Date.now()): CalRange {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const count = Math.min(93, Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5) + 1);
  return rangeFrom(from, count, now);
}

/** Mesmo dia em outro mês (passa para o último dia quando o mês é mais curto). */
export function shiftMonth(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay))).toISOString().slice(0, 10);
}
