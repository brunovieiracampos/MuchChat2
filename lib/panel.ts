import { cache } from "react";
import { buildExecutions } from "@/lib/activity";
import { isPaused, listAutomations } from "@/lib/automations";
import { getMe, getTokenInfo, isDryRun, listMediaPage, type IgMedia } from "@/lib/instagram";
import { readLog } from "@/lib/processor";

/** Dados compartilhados pelas telas do painel (cache por requisição). */

const TOKEN_TTL_DAYS = 60;

export type Connection =
  | { state: "disconnected"; hasAppId: boolean }
  | { state: "error"; error: string; hasAppId: boolean }
  | { state: "connected"; username?: string; userId?: string; accountType?: string; source: "painel" | "env"; tokenAgeDays: number | null; tokenDaysLeft: number | null; hasAppId: boolean };

export const getConnection = cache(async (): Promise<Connection> => {
  const hasAppId = !!process.env.IG_APP_ID;
  const token = await getTokenInfo();
  if (token.source === "none") return { state: "disconnected", hasAppId };
  try {
    const me = await getMe();
    const age = token.refreshedAt ? Math.floor((Date.now() - token.refreshedAt) / 864e5) : null;
    return {
      state: "connected", username: me.username, userId: me.user_id, accountType: me.account_type,
      source: token.source, tokenAgeDays: age, tokenDaysLeft: age === null ? null : TOKEN_TTL_DAYS - age, hasAppId,
    };
  } catch (e) {
    return { state: "error", error: e instanceof Error ? e.message : String(e), hasAppId };
  }
});

export const getActivity = cache(async () => {
  const [log, rules] = await Promise.all([readLog(2000), listAutomations()]);
  return { log, rules, executions: buildExecutions(log, rules) };
});

export const getFlags = cache(async () => ({ paused: await isPaused(), dryRun: isDryRun() }));

/** Primeira página de posts (mais recentes primeiro) e o cursor da próxima. */
export const getRecentMedia = cache(async (): Promise<{ items: IgMedia[]; next?: string }> => {
  const conn = await getConnection();
  if (conn.state !== "connected") return { items: [] };
  return listMediaPage(24).catch(() => ({ items: [] }));
});

export function baseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
