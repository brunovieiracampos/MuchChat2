import { AsyncLocalStorage } from "node:async_hooks";
import type { Rule } from "@/config/rules";
import type { Material } from "@/lib/material";
import type { PostStatus, ScheduledPost } from "@/lib/posts";

/**
 * Conta do Instagram em que o código está rodando. Tudo o que lê ou grava dados
 * (Redis, automações, chamadas à Meta) pega a conta daqui, e sem conta nada funciona:
 * esquecer de entrar numa conta dá erro em vez de misturar dados de clientes.
 *
 * - Painel: lib/panel.ts entra na conta do usuário logado (automações lidas com RLS).
 * - Webhook e varredura: entram na conta de destino de cada evento (chave de serviço).
 */

/** Material ainda sem id e datas (o banco preenche). */
export type NewMaterial = Omit<Material, "id" | "createdAt" | "updatedAt">;

export interface AccountRepo {
  listAutomations(): Promise<Rule[]>;
  saveAutomation(rule: Rule): Promise<void>;
  deleteAutomation(id: string): Promise<void>;
  /** Grava o token renovado (criptografado) da conta. */
  saveToken(token: string, refreshedAt: number): Promise<void>;
  listPosts(): Promise<ScheduledPost[]>;
  getPost(id: string): Promise<ScheduledPost | null>;
  createPost(post: Partial<ScheduledPost>): Promise<ScheduledPost>;
  /**
   * Atualiza só se as condições baterem (ficha do agendamento e/ou status atual); devolve null se nada mudou.
   * É o que impede um processo antigo de gravar por cima de um agendamento novo.
   */
  updatePost(id: string, patch: Partial<ScheduledPost>, cond?: PostCond): Promise<ScheduledPost | null>;
  deletePost(id: string): Promise<void>;
  /** Materiais do portal, do mais novo para o mais antigo. */
  listMaterials(): Promise<Material[]>;
  getMaterial(id: string): Promise<Material | null>;
  createMaterial(m: NewMaterial): Promise<Material>;
  /** Devolve null se o material não existe mais. */
  updateMaterial(id: string, patch: Partial<NewMaterial>): Promise<Material | null>;
  deleteMaterial(id: string): Promise<void>;
}

export type PostCond = { token?: string | null; statuses?: PostStatus[] };

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
  posts: ScheduledPost[] = [];
  async listPosts() { return this.posts.map((p) => ({ ...p })); }
  async getPost(id: string) { const p = this.posts.find((x) => x.id === id); return p ? { ...p } : null; }
  async updatePost(id: string, patch: Partial<ScheduledPost>, cond: PostCond = {}) {
    const i = this.posts.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const p = this.posts[i];
    if (cond.token !== undefined && p.scheduleToken !== cond.token) return null;
    if (cond.statuses && !cond.statuses.includes(p.status)) return null;
    this.posts[i] = { ...p, ...patch, id, updatedAt: Date.now() };
    return { ...this.posts[i] };
  }
  async createPost(p: Partial<ScheduledPost>) {
    const now = Date.now();
    const created: ScheduledPost = {
      id: p.id ?? `post-${this.posts.length + 1}`, kind: "image", caption: "", media: [], scheduledAt: null, status: "draft",
      scheduleToken: null, runId: null, containerId: null, igMediaId: null, permalink: null, publishedAt: null,
      automationId: null, firstComment: "", firstCommentId: null, attempts: 0, error: null, mediaDeletedAt: null, createdAt: now, ...p, updatedAt: now,
    };
    this.posts.push(created);
    return { ...created };
  }
  async deletePost(id: string) { this.posts = this.posts.filter((p) => p.id !== id); }

  materials: Material[] = [];
  private materialSeq = 0;
  async listMaterials() { return [...this.materials].sort((a, b) => b.createdAt - a.createdAt).map((m) => structuredClone(m)); }
  async getMaterial(id: string) { const m = this.materials.find((x) => x.id === id); return m ? structuredClone(m) : null; }
  async createMaterial(m: NewMaterial) {
    // O contador só desempata a ordem de materiais criados no mesmo milissegundo.
    const now = Date.now() + this.materialSeq++;
    const created: Material = { ...structuredClone(m), id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    this.materials.push(created);
    return structuredClone(created);
  }
  async updateMaterial(id: string, patch: Partial<NewMaterial>) {
    const i = this.materials.findIndex((x) => x.id === id);
    if (i < 0) return null;
    this.materials[i] = { ...this.materials[i], ...structuredClone(patch), id, updatedAt: Date.now() };
    return structuredClone(this.materials[i]);
  }
  async deleteMaterial(id: string) { this.materials = this.materials.filter((m) => m.id !== id); }
}

export function testAccountCtx(over: Partial<AccountCtx> = {}): AccountCtx {
  return { accountId: "acc-test", igUserId: "me", username: "teste", token: "tok", tokenRefreshedAt: Date.now(), repo: new MemoryRepo(), ...over };
}
