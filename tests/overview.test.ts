import { describe, expect, it } from "vitest";
import type { Rule } from "@/config/rules";
import type { IgMedia } from "@/lib/instagram";
import type { ScheduledPost } from "@/lib/posts";
import type { RawStats } from "@/lib/stats";
import { answered, automationStatus, calendarItems, dailyComments, periodStart, topByComments, totals, weekOf } from "@/lib/overview";

// quinta-feira, 1 de outubro de 2026, 15h em Brasília
const NOW = Date.parse("2026-10-01T18:00:00Z");

const rule = (over: Partial<Rule>): Rule => ({ id: "r", posts: ["*"], keywords: ["X"], link: "", dm: "", ...over });

function post(over: Partial<ScheduledPost>): ScheduledPost {
  return {
    id: "p1", kind: "image", caption: "Legenda", media: [{ path: "a/1.jpg", width: 1080, height: 1350, size: 1 }],
    scheduledAt: null, status: "scheduled", scheduleToken: null, runId: null, containerId: null, igMediaId: null,
    permalink: null, publishedAt: null, automationId: null, attempts: 0, error: null, mediaDeletedAt: null,
    createdAt: 0, updatedAt: 0, ...over,
  };
}

describe("visão geral", () => {
  it("separa automações ativas, aguardando post e pausadas", () => {
    const s = automationStatus([
      rule({ id: "a" }),
      rule({ id: "b", posts: ["@next"], armedAt: 1 }),
      rule({ id: "c", posts: ["@post:p9"] }),
      rule({ id: "d", active: false }),
      rule({ id: "e", active: false, posts: ["@next"] }),
    ]);
    expect(s).toEqual({ active: 1, waiting: 2, paused: 2, total: 5 });
  });

  it("soma os contadores de todas as automações no período e por dia", () => {
    const stats = new Map<string, RawStats>([
      ["a", { "2026-10-01:comment": 3, "2026-10-01:dm": 3, "2026-09-30:comment": 2, "2026-09-20:comment": 9 }],
      ["b", { "2026-10-01:comment": 1, "2026-10-01:reply": 1, "2026-10-01:gained": 1 }],
    ]);
    const t = totals(stats, 7, NOW);
    expect(t).toMatchObject({ comment: 6, dm: 3, reply: 1, gained: 1 });
    expect(answered(t)).toBe(3);
    const days = dailyComments(stats, 7, NOW);
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toEqual({ day: "2026-10-01", label: "Qui", value: 4 });
    expect(days.at(-2)!.value).toBe(2);
    expect(dailyComments(stats, 90, NOW)).toHaveLength(13);
  });

  it("monta a semana de segunda a domingo e navega", () => {
    const w = weekOf(0, NOW);
    expect(w.days.map((d) => d.key)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(w.days.map((d) => d.weekday)).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
    expect(w.days[3].isToday).toBe(true);
    expect(weekOf(1, NOW).start).toBe("2026-10-05");
    expect(weekOf(-1, NOW).start).toBe("2026-09-21");
  });

  it("junta agendadas e posts do Instagram da semana sem repetir", () => {
    const w = weekOf(0, NOW);
    const auto = rule({ id: "auto", name: "Guia", posts: ["https://www.instagram.com/p/SC2/"] });
    const posts = [
      post({ id: "p1", status: "scheduled", scheduledAt: Date.parse("2026-10-02T12:00:00Z"), automationId: "auto" }),
      post({ id: "p2", status: "published", scheduledAt: Date.parse("2026-09-29T12:00:00Z"), publishedAt: Date.parse("2026-09-29T12:01:00Z"), igMediaId: "M1" }),
      post({ id: "p3", status: "draft", scheduledAt: Date.parse("2026-10-02T12:00:00Z") }),
      post({ id: "p4", status: "scheduled", scheduledAt: Date.parse("2026-10-12T12:00:00Z") }),
    ];
    const media: IgMedia[] = [
      { id: "M1", timestamp: "2026-09-29T12:01:00+0000", like_count: 40, comments_count: 12, permalink: "https://ig/p/SC1" },
      { id: "M2", shortcode: "SC2", timestamp: "2026-09-30T20:00:00+0000", comments_count: 3, media_type: "VIDEO" },
      { id: "M3", timestamp: "2026-09-10T20:00:00+0000" },
    ];
    const items = calendarItems(w, posts, media, [auto], new Map([["auto", { "2026-09-30:comment": 2 }]]), { "a/1.jpg": "https://thumb" });
    expect(items.map((i) => i.id)).toEqual(["p2", "ig:M2", "p1"]);
    expect(items[0]).toMatchObject({ status: "published", likes: 40, comments: 12, permalink: "https://ig/p/SC1", thumb: "https://thumb" });
    expect(items[1]).toMatchObject({ source: "instagram", kind: "reel", automation: { id: "auto", name: "Guia" } });
    expect(items[1].automation!.counts.comment).toBe(2);
    expect(items[2]).toMatchObject({ status: "scheduled", day: "2026-10-02", automation: { id: "auto" } });
  });

  it("ordena o top de publicações por comentários e ignora as sem comentário", () => {
    const top = topByComments([{ id: "a", comments_count: 2 }, { id: "b", comments_count: 9 }, { id: "c", comments_count: 0 }, { id: "d" }], 5);
    expect(top.map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("começa o período à meia-noite de Brasília", () => {
    expect(new Date(periodStart(7, NOW)).toISOString()).toBe("2026-09-25T03:00:00.000Z");
  });
});
