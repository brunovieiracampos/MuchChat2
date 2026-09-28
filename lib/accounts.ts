import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rule } from "@/config/rules";
import type { AccountCtx, AccountRepo, PostCond } from "@/lib/account-context";
import type { ScheduledPost } from "@/lib/posts";
import { open, seal } from "@/lib/secret-box";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Contas do Instagram no Supabase.
 * - O token só é lido e gravado pelo servidor com a chave de serviço (o navegador não tem acesso à coluna).
 * - No painel, as automações usam o cliente do usuário: o RLS garante que só o dono as vê.
 * - No webhook e na varredura não há usuário: a chave de serviço é usada, sempre filtrando pela conta.
 */

type AccountRow = {
  id: string; owner_id: string; ig_user_id: string; username: string; account_type: string | null;
  token_ciphertext: string; token_refreshed_at: string;
};

const COLUMNS = "id, owner_id, ig_user_id, username, account_type, token_ciphertext, token_refreshed_at";

class SupabaseRepo implements AccountRepo {
  constructor(private db: SupabaseClient, private accountId: string) {}

  async listAutomations(): Promise<Rule[]> {
    const { data, error } = await this.db.from("automations")
      .select("id, active, rule, created_at, updated_at").eq("account_id", this.accountId).order("created_at");
    if (error) throw new Error(`Falha ao ler automações: ${error.message}`);
    return (data ?? []).map((r) => ({
      ...(r.rule as Rule), id: r.id, active: r.active,
      createdAt: Date.parse(r.created_at), updatedAt: Date.parse(r.updated_at),
    }));
  }

  async saveAutomation(rule: Rule): Promise<void> {
    const now = Date.now();
    const { error } = await this.db.from("automations").upsert({
      account_id: this.accountId, id: rule.id, name: rule.name ?? "", active: rule.active !== false, rule,
      created_at: new Date(rule.createdAt ?? now).toISOString(), updated_at: new Date(rule.updatedAt ?? now).toISOString(),
    });
    if (error) throw new Error(`Falha ao salvar a automação: ${error.message}`);
  }

  async deleteAutomation(id: string): Promise<void> {
    const { error } = await this.db.from("automations").delete().eq("account_id", this.accountId).eq("id", id);
    if (error) throw new Error(`Falha ao excluir a automação: ${error.message}`);
  }

  async listPosts(): Promise<ScheduledPost[]> {
    const { data, error } = await this.db.from("scheduled_posts").select("*").eq("account_id", this.accountId).order("scheduled_at", { ascending: true, nullsFirst: false });
    if (error) throw new Error(`Falha ao ler publicações: ${error.message}`);
    return (data ?? []).map(toPost);
  }

  async getPost(id: string): Promise<ScheduledPost | null> {
    const { data, error } = await this.db.from("scheduled_posts").select("*").eq("account_id", this.accountId).eq("id", id).maybeSingle();
    if (error) throw new Error(`Falha ao ler a publicação: ${error.message}`);
    return data ? toPost(data) : null;
  }

  // Escritas de publicações só pelo servidor (o navegador tem acesso só de leitura), sempre filtrando pela conta.
  async createPost(p: Partial<ScheduledPost>): Promise<ScheduledPost> {
    const { data, error } = await createAdminClient().from("scheduled_posts").insert({ ...fromPost(p), account_id: this.accountId }).select("*").single();
    if (error) throw new Error(`Falha ao criar a publicação: ${error.message}`);
    return toPost(data);
  }

  async updatePost(id: string, patch: Partial<ScheduledPost>, cond: PostCond = {}): Promise<ScheduledPost | null> {
    let q = createAdminClient().from("scheduled_posts").update({ ...fromPost(patch), updated_at: new Date().toISOString() })
      .eq("account_id", this.accountId).eq("id", id);
    if (cond.token !== undefined) q = cond.token === null ? q.is("schedule_token", null) : q.eq("schedule_token", cond.token);
    if (cond.statuses) q = q.in("status", cond.statuses);
    const { data, error } = await q.select("*").maybeSingle();
    if (error) throw new Error(`Falha ao salvar a publicação: ${error.message}`);
    return data ? toPost(data) : null;
  }

  async deletePost(id: string): Promise<void> {
    const { error } = await createAdminClient().from("scheduled_posts").delete().eq("account_id", this.accountId).eq("id", id);
    if (error) throw new Error(`Falha ao excluir a publicação: ${error.message}`);
  }

  async saveToken(token: string, refreshedAt: number): Promise<void> {
    const { error } = await createAdminClient().from("instagram_accounts")
      .update({ token_ciphertext: seal(token), token_refreshed_at: new Date(refreshedAt).toISOString(), updated_at: new Date().toISOString() })
      .eq("id", this.accountId);
    if (error) throw new Error(`Falha ao salvar o token: ${error.message}`);
  }
}

/* ---------- publicações: linha do banco ↔ objeto ---------- */

type PostRow = Record<string, unknown>;
const ms = (v: unknown) => (v ? Date.parse(String(v)) : null);
const iso = (v: number | null | undefined) => (v ? new Date(v).toISOString() : null);

function toPost(r: PostRow): ScheduledPost {
  return {
    id: String(r.id), kind: r.kind as ScheduledPost["kind"], caption: String(r.caption ?? ""), media: (r.media as ScheduledPost["media"]) ?? [],
    scheduledAt: ms(r.scheduled_at), status: r.status as ScheduledPost["status"], scheduleToken: (r.schedule_token as string) ?? null,
    runId: (r.run_id as string) ?? null, containerId: (r.container_id as string) ?? null, igMediaId: (r.ig_media_id as string) ?? null,
    permalink: (r.permalink as string) ?? null, publishedAt: ms(r.published_at), automationId: (r.automation_id as string) ?? null,
    attempts: Number(r.attempts ?? 0), error: (r.error as string) ?? null, mediaDeletedAt: ms(r.media_deleted_at),
    createdAt: ms(r.created_at) ?? Date.now(), updatedAt: ms(r.updated_at) ?? Date.now(),
  };
}

/** Só os campos presentes em `p` vão para o banco. */
function fromPost(p: Partial<ScheduledPost>): PostRow {
  const map: [keyof ScheduledPost, string, (v: never) => unknown][] = [
    ["kind", "kind", (v) => v], ["caption", "caption", (v) => v], ["media", "media", (v) => v],
    ["scheduledAt", "scheduled_at", iso], ["status", "status", (v) => v], ["scheduleToken", "schedule_token", (v) => v],
    ["runId", "run_id", (v) => v], ["containerId", "container_id", (v) => v], ["igMediaId", "ig_media_id", (v) => v],
    ["permalink", "permalink", (v) => v], ["publishedAt", "published_at", iso], ["automationId", "automation_id", (v) => v],
    ["attempts", "attempts", (v) => v], ["error", "error", (v) => v], ["mediaDeletedAt", "media_deleted_at", iso],
  ];
  const row: PostRow = {};
  for (const [k, col, f] of map) if (k in p) row[col] = f(p[k] as never);
  return row;
}

function toCtx(row: AccountRow, db: SupabaseClient): AccountCtx {
  return {
    accountId: row.id, igUserId: row.ig_user_id, username: row.username, accountType: row.account_type,
    token: open(row.token_ciphertext), tokenRefreshedAt: Date.parse(row.token_refreshed_at),
    repo: new SupabaseRepo(db, row.id),
  };
}

/** Conta do usuário logado (painel). `userId` precisa vir de uma sessão já validada. */
export async function accountForUser(userId: string): Promise<AccountCtx | null> {
  const { data, error } = await createAdminClient().from("instagram_accounts").select(COLUMNS).eq("owner_id", userId).maybeSingle<AccountRow>();
  if (error) throw new Error(`Falha ao ler a conta: ${error.message}`);
  return data ? toCtx(data, await createClient()) : null;
}

/** Conta de um usuário identificado por token do MCP (sem sessão de navegador): chave de serviço filtrada pela conta. */
export async function accountForOwnerService(userId: string): Promise<AccountCtx | null> {
  const db = createAdminClient();
  const { data, error } = await db.from("instagram_accounts").select(COLUMNS).eq("owner_id", userId).maybeSingle<AccountRow>();
  if (error) throw new Error(`Falha ao ler a conta: ${error.message}`);
  return data ? toCtx(data, db) : null;
}

/** Conta pelo id interno (processo de publicação, que roda sem usuário logado). */
export async function accountById(accountId: string): Promise<AccountCtx | null> {
  const db = createAdminClient();
  const { data, error } = await db.from("instagram_accounts").select(COLUMNS).eq("id", accountId).maybeSingle<AccountRow>();
  if (error) throw new Error(`Falha ao ler a conta: ${error.message}`);
  return data ? toCtx(data, db) : null;
}

/** Conta de destino de um evento do webhook. */
export async function accountByIgUserId(igUserId: string): Promise<AccountCtx | null> {
  const { data, error } = await createAdminClient().from("instagram_accounts").select(COLUMNS).eq("ig_user_id", igUserId).maybeSingle<AccountRow>();
  if (error) throw new Error(`Falha ao ler a conta: ${error.message}`);
  return data ? toCtx(data, createAdminClient()) : null;
}

/** Todas as contas conectadas (varredura). */
export async function allAccounts(): Promise<AccountCtx[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("instagram_accounts").select(COLUMNS).returns<AccountRow[]>();
  if (error) throw new Error(`Falha ao listar contas: ${error.message}`);
  return (data ?? []).map((r) => toCtx(r, db));
}

export type ConnectResult = { ok: true } | { ok: false; reason: "taken" | "other-account"; username?: string };

/**
 * Liga a conta do Instagram ao usuário (v1: uma conta por usuário, e cada conta com um dono só).
 * Reconectar a mesma conta só troca o token.
 */
export async function connectAccount(userId: string, a: { igUserId: string; username: string; accountType?: string; token: string }): Promise<ConnectResult> {
  const db = createAdminClient();
  const { data: byIg } = await db.from("instagram_accounts").select("id, owner_id").eq("ig_user_id", a.igUserId).maybeSingle();
  if (byIg && byIg.owner_id !== userId) return { ok: false, reason: "taken" };
  const { data: mine } = await db.from("instagram_accounts").select("id, ig_user_id, username").eq("owner_id", userId).maybeSingle();
  if (mine && mine.ig_user_id !== a.igUserId) return { ok: false, reason: "other-account", username: mine.username };

  const now = new Date().toISOString();
  const row = { username: a.username, account_type: a.accountType ?? null, token_ciphertext: seal(a.token), token_refreshed_at: now, updated_at: now };
  const { error } = mine
    ? await db.from("instagram_accounts").update(row).eq("id", mine.id)
    : await db.from("instagram_accounts").insert({ ...row, owner_id: userId, ig_user_id: a.igUserId });
  if (error) throw new Error(`Falha ao salvar a conexão: ${error.message}`);
  return { ok: true };
}
