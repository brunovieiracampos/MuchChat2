import type { Rule } from "@/config/rules";
import type { IgMedia } from "@/lib/instagram";

/** Dados enxutos que o construtor (client) recebe do servidor. */

export type MediaOption = { id: string; shortcode?: string; permalink?: string; thumb?: string; caption: string; timestamp?: string; comments?: number };
export type OtherAutomation = Pick<Rule, "id" | "name" | "posts" | "keywords" | "active">;

export function toMediaOption(m: IgMedia): MediaOption {
  return {
    id: m.id,
    shortcode: m.shortcode,
    permalink: m.permalink,
    thumb: m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url ?? m.thumbnail_url,
    caption: (m.caption ?? "").slice(0, 90),
    timestamp: m.timestamp,
    comments: m.comments_count,
  };
}

export function toOther(r: Rule): OtherAutomation {
  return { id: r.id, name: r.name, posts: r.posts, keywords: r.keywords, active: r.active };
}
