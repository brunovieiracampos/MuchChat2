import { AsyncLocalStorage } from "node:async_hooks";
import type { Rule } from "@/config/rules";

/**
 * Conta do Instagram em que o código está rodando. Tudo o que lê ou grava dados
 * (Redis, automações, chamadas à Meta) pega a conta daqui, e sem conta nada funciona:
 * esquecer de entrar numa conta dá erro em vez de misturar dados de clientes.
 *
 * - Painel: lib/panel.ts entra na conta do usuário logado (automações lidas com RLS).
 * - Webhook e varredura: entram na conta de destino de cada evento (chave de serviço).
 */

export interface AccountRepo {
  listAutomations(): Promise<Rule[]>;
  saveAutomation(rule: Rule): Promise<void>;
  deleteAutomation(id: string): Promise<void>;
  /** Grava o token renovado (criptografado) da conta. */
  saveToken(token: string, refreshedAt: number): Promise<void>;
}

export type AccountCtx = {
  /** id da linha em instagram_accounts */
  accountId: string;
  /** id da conta profissional no Instagram (o mesmo que chega no webhook) */
  igUserId: string;
  username: string;
  accountType?: string | null;
  token: string;
  tokenRefreshedAt: number;
  repo: AccountRepo;
};

const als = new AsyncLocalStorage<AccountCtx>();
let testAccount: AccountCtx | null = null;

export function withAccount<T>(ctx: AccountCtx, fn: () => Promise<T>): Promise<T> {
  return als.run(ctx, fn);
}

export function currentAccount(): AccountCtx {
  const ctx = als.getStore() ?? testAccount;
  if (!ctx) throw new Error("Nenhuma conta do Instagram em uso: este código precisa rodar dentro de withAccount().");
  return ctx;
}

export function hasAccount(): boolean {
  return !!(als.getStore() ?? testAccount);
}

/** Testes: conta usada quando o código roda fora de withAccount(). */
export function setAccountForTests(ctx: AccountCtx | null) {
  testAccount = ctx;
}

/**
 * Prefixo das chaves da conta no Redis: o id da linha em instagram_accounts, que nunca é reaproveitado.
 * (Pelo id do Instagram, quem conectasse uma conta já usada por outro usuário herdaria o histórico dele.)
 */
export const keyPrefix = (accountId: string) => `a:${accountId}:`;

/** Repositório em memória (testes e desenvolvimento local sem Supabase). */
export class MemoryRepo implements AccountRepo {
  rules: Rule[] = [];
  token?: { token: string; refreshedAt: number };
  async listAutomations() { return this.rules.map((r) => ({ ...r })); }
  async saveAutomation(rule: Rule) {
    const i = this.rules.findIndex((r) => r.id === rule.id);
    if (i >= 0) this.rules[i] = rule; else this.rules.push(rule);
  }
  async deleteAutomation(id: string) { this.rules = this.rules.filter((r) => r.id !== id); }
  async saveToken(token: string, refreshedAt: number) { this.token = { token, refreshedAt }; }
}

export function testAccountCtx(over: Partial<AccountCtx> = {}): AccountCtx {
  return { accountId: "acc-test", igUserId: "me", username: "teste", token: "tok", tokenRefreshedAt: Date.now(), repo: new MemoryRepo(), ...over };
}
