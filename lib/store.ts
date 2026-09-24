import { Redis } from "@upstash/redis";

/** Interface mínima de armazenamento (Redis em produção, memória em testes/dev). */
export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { nx?: boolean; ex?: number }): Promise<boolean>;
  del(key: string): Promise<void>;
  hget<T>(key: string, field: string): Promise<T | null>;
  hset(key: string, values: Record<string, unknown>): Promise<void>;
  hgetall<T extends Record<string, unknown>>(key: string): Promise<T | null>;
  lpush(key: string, value: unknown, max: number): Promise<void>;
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>;
  expire(key: string, seconds: number): Promise<void>;
}

class RedisStore implements Store {
  constructor(private r: Redis) {}
  async get<T>(k: string) { return (await this.r.get<T>(k)) ?? null; }
  async set(k: string, v: unknown, o?: { nx?: boolean; ex?: number }) {
    const opts: Record<string, unknown> = {};
    if (o?.nx) opts.nx = true;
    if (o?.ex) opts.ex = o.ex;
    const res = await this.r.set(k, v, opts as never);
    return res === "OK" || res === true;
  }
  async del(k: string) { await this.r.del(k); }
  async hget<T>(k: string, f: string) { return (await this.r.hget<T>(k, f)) ?? null; }
  async hset(k: string, v: Record<string, unknown>) { await this.r.hset(k, v); }
  async hgetall<T extends Record<string, unknown>>(k: string) { return (await this.r.hgetall<T>(k)) ?? null; }
  async lpush(k: string, v: unknown, max: number) {
    const p = this.r.pipeline();
    p.lpush(k, v);
    p.ltrim(k, 0, max - 1);
    await p.exec();
  }
  async lrange<T>(k: string, a: number, b: number) { return this.r.lrange<T>(k, a, b); }
  async expire(k: string, s: number) { await this.r.expire(k, s); }
}

export class MemoryStore implements Store {
  kv = new Map<string, unknown>();
  exp = new Map<string, number>();
  private alive(k: string) {
    const e = this.exp.get(k);
    if (e && e < Date.now()) { this.kv.delete(k); this.exp.delete(k); }
    return this.kv.has(k);
  }
  async get<T>(k: string) { return this.alive(k) ? (this.kv.get(k) as T) : null; }
  async set(k: string, v: unknown, o?: { nx?: boolean; ex?: number }) {
    if (o?.nx && this.alive(k)) return false;
    this.kv.set(k, v);
    if (o?.ex) this.exp.set(k, Date.now() + o.ex * 1000); else this.exp.delete(k);
    return true;
  }
  async del(k: string) { this.kv.delete(k); this.exp.delete(k); }
  async hget<T>(k: string, f: string) {
    const h = (await this.get<Record<string, unknown>>(k)) ?? {};
    return (h[f] as T) ?? null;
  }
  async hset(k: string, v: Record<string, unknown>) {
    const h = (await this.get<Record<string, unknown>>(k)) ?? {};
    this.kv.set(k, { ...h, ...v });
  }
  async hgetall<T extends Record<string, unknown>>(k: string) { return (await this.get<T>(k)) ?? null; }
  async lpush(k: string, v: unknown, max: number) {
    const l = ((await this.get<unknown[]>(k)) ?? []).slice();
    l.unshift(v);
    this.kv.set(k, l.slice(0, max));
  }
  async lrange<T>(k: string, a: number, b: number) {
    const l = (await this.get<T[]>(k)) ?? [];
    return l.slice(a, b === -1 ? undefined : b + 1);
  }
  async expire(k: string, s: number) { if (this.kv.has(k)) this.exp.set(k, Date.now() + s * 1000); }
}

let _store: Store | null = null;

export function getStore(): Store {
  if (_store) return _store;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    _store = new RedisStore(new Redis({ url, token }));
  } else {
    if (process.env.VERCEL) throw new Error("Redis não configurado (KV_REST_API_URL / KV_REST_API_TOKEN).");
    console.warn("[store] Sem Redis: usando memória (só para desenvolvimento).");
    // No `next dev` rotas e páginas podem carregar cópias separadas deste módulo; a memória fica no globalThis.
    const g = globalThis as { __dmMemoryStore?: MemoryStore };
    _store = g.__dmMemoryStore ??= new MemoryStore();
  }
  return _store;
}

export function setStoreForTests(s: Store) { _store = s; }
