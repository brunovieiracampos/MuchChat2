import { cache } from "react";
import { withAccount } from "@/lib/account-context";
import { accountForUser } from "@/lib/accounts";
import { buildExecutions } from "@/lib/activity";
import { isPaused, listAutomations } from "@/lib/automations";
import { getMe, isDryRun, listMediaPage, type IgMedia } from "@/lib/instagram";
import { readLog } from "@/lib/processor";
import { requireSession } from "@/lib/session";
import { readStats, type RawStats } from "@/lib/stats";

/**
 * Dados das telas do painel (cache por requisição), sempre da conta do Instagram do usuário logado.
 * Sem conta conectada, as telas recebem dados vazios e mostram o convite para conectar.
 */

const TOKEN_TTL_DAYS = 60;

/** Conta do Instagram do usuário logado (null = ainda não conectou). */
export const getAccount = cache(async () => accountForUser((await requireSession()).id));

/** Roda `fn` na conta do usuário logado; sem conta, devolve `empty`. */
async function scoped<T>(fn: () => Promise<T>, empty: T): Promise<T> {
  const account = await getAccount();
  return account ? withAccount(account, fn) : empty;
}

/** Para server actions e rotas do painel: roda na conta do usuário logado ou falha se ele não conectou o Instagram. */
export async function inAccount<T>(fn: () => Promise<T>): Promise<T> {
  const account = await getAccount();
  if (!account) throw new Error("Conecte sua conta do Instagram primeiro.");
  return withAccount(account, fn);
}

export type Connection =
  | { state: "disconnected"; hasAppId: boolean }
  | { state: "error"; error: string; username?: string; hasAppId: boolean }
  | { state: "connected"; username?: string; userId?: string; accountType?: string; tokenAgeDays: number; tokenDaysLeft: number; hasAppId: boolean };

export const getConnection = cache(async (): Promise<Connection> => {
  const hasAppId = !!process.env.IG_APP_ID;
  const account = await getAccount();
  if (!account) return { state: "disconnected", hasAppId };
  return withAccount(account, async () => {
    try {
      const me = await getMe();
      const age = Math.floor((Date.now() - account.tokenRefreshedAt) / 864e5);
      return {
        state: "connected" as const, username: me.username ?? account.username, userId: me.user_id ?? account.igUserId,
        accountType: me.account_type ?? account.accountType ?? undefined, tokenAgeDays: age, tokenDaysLeft: TOKEN_TTL_DAYS - age, hasAppId,
      };
    } catch (e) {
      return { state: "error" as const, error: e instanceof Error ? e.message : String(e), username: account.username, hasAppId };
    }
  });
});

export const getActivity = cache(async () => scoped(async () => {
  const [log, rules] = await Promise.all([readLog(2000), listAutomations()]);
  return { log, rules, executions: buildExecutions(log, rules) };
}, { log: [], rules: [], executions: [] }));

/** Contadores do funil de cada automação (id → campos "dia:etapa"). */
export const getStats = cache(async (): Promise<Map<string, RawStats>> => scoped(async () => {
  const rules = await listAutomations();
  const all = await Promise.all(rules.map(async (r) => [r.id, await readStats(r.id)] as const));
  return new Map(all);
}, new Map()));

export const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: 0, label: "Tudo" },
] as const;

/** Período da URL (?periodo=7|30|90|0); padrão 7 dias. */
export function periodOf(raw: string | undefined, allowAll = true): number {
  const p = Number(raw ?? "7");
  return PERIODS.some((x) => x.days === p && (allowAll || p)) ? p : 7;
}

export const getFlags = cache(async () => ({ paused: await scoped(isPaused, false), dryRun: isDryRun() }));

/** Primeira página de posts (mais recentes primeiro) e o cursor da próxima. */
export const getRecentMedia = cache(async (): Promise<{ items: IgMedia[]; next?: string }> => {
  const conn = await getConnection();
  if (conn.state !== "connected") return { items: [] };
  return scoped(() => listMediaPage(24).catch(() => ({ items: [] as IgMedia[] })), { items: [] });
});

export function baseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
