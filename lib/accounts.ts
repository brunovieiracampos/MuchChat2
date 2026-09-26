import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rule } from "@/config/rules";
import type { AccountCtx, AccountRepo } from "@/lib/account-context";
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

  async saveToken(token: string, refreshedAt: number): Promise<void> {
    const { error } = await createAdminClient().from("instagram_accounts")
      .update({ token_ciphertext: seal(token), token_refreshed_at: new Date(refreshedAt).toISOString(), updated_at: new Date().toISOString() })
      .eq("id", this.accountId);
    if (error) throw new Error(`Falha ao salvar o token: ${error.message}`);
  }
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
