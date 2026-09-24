import { getStore } from "@/lib/store";

const BASE = "https://graph.instagram.com";
const v = () => process.env.IG_GRAPH_VERSION || "v24.0";

export class GraphError extends Error {
  constructor(public status: number, public body: any) {
    super(`Graph API ${status}: ${body?.error?.message ?? JSON.stringify(body)}`);
  }
  get code(): number | undefined { return this.body?.error?.code; }
  get subcode(): number | undefined { return this.body?.error?.error_subcode; }
  /** Erros que não adianta tentar de novo (permissão, janela expirada, já respondido, usuário inválido…). */
  get permanent(): boolean {
    if (this.status === 429 || this.status >= 500) return false;
    const c = this.code;
    // rate limit, transitório ou token inválido/expirado (corrige-se trocando o token, então vale tentar de novo)
    if (c === 1 || c === 2 || c === 4 || c === 17 || c === 32 || c === 190 || c === 613) return false;
    return true;
  }
}

type TokenRec = { token: string; refreshedAt: number };
const TOKEN_KEY = "ig:token";

export async function getToken(): Promise<string> {
  const rec = await getStore().get<TokenRec>(TOKEN_KEY);
  const t = rec?.token || process.env.IG_ACCESS_TOKEN;
  if (!t) throw new Error("IG_ACCESS_TOKEN não configurado.");
  return t;
}

const USER_KEY = "ig:user";

export async function igUserId(): Promise<string> {
  const id = process.env.IG_USER_ID || (await getStore().get<string>(USER_KEY));
  if (!id) throw new Error("IG_USER_ID não configurado (conecte a conta em /admin).");
  return String(id);
}

/** Salva token de longa duração + ID da conta obtidos pelo login OAuth. */
export async function saveConnection(token: string, userId: string) {
  const store = getStore();
  await store.set(TOKEN_KEY, { token, refreshedAt: Date.now() } satisfies TokenRec);
  await store.set(USER_KEY, userId);
}

async function call<T>(method: "GET" | "POST", path: string, params: Record<string, string> = {}, body?: unknown): Promise<T> {
  const token = await getToken();
  const url = new URL(`${BASE}/${v()}/${path.replace(/^\//, "")}`);
  for (const [k, val] of Object.entries(params)) url.searchParams.set(k, val);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as any)?.error) throw new GraphError(res.status, json);
  return json as T;
}

export type IgMedia = { id: string; shortcode?: string; permalink?: string; timestamp?: string; caption?: string };
export type IgComment = { id: string; text?: string; timestamp?: string; username?: string; from?: { id: string; username?: string }; parent_id?: string };

export async function getMedia(mediaId: string): Promise<IgMedia> {
  return call<IgMedia>("GET", mediaId, { fields: "id,shortcode,permalink,timestamp" });
}

export async function listRecentMedia(limit = 25): Promise<IgMedia[]> {
  const r = await call<{ data: IgMedia[] }>("GET", `${await igUserId()}/media`, {
    fields: "id,shortcode,permalink,timestamp,caption",
    limit: String(limit),
  });
  return r.data ?? [];
}

export async function listComments(mediaId: string, maxPages = 10): Promise<IgComment[]> {
  const out: IgComment[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const params: Record<string, string> = { fields: "id,text,timestamp,username,from", limit: "50" };
    if (after) params.after = after;
    const r = await call<{ data: IgComment[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      "GET", `${mediaId}/comments`, params,
    );
    out.push(...(r.data ?? []));
    if (!r.paging?.next || !r.paging.cursors?.after) break;
    after = r.paging.cursors.after;
  }
  return out;
}

/** Resposta pública ao comentário. */
export async function replyToComment(commentId: string, message: string): Promise<{ id: string }> {
  return call<{ id: string }>("POST", `${commentId}/replies`, { message });
}

/** Private Reply: 1 DM por comentário, até 7 dias após o comentário. */
export async function sendPrivateReply(commentId: string, text: string): Promise<{ recipient_id?: string; message_id?: string }> {
  return call("POST", `${await igUserId()}/messages`, {}, { recipient: { comment_id: commentId }, message: { text } });
}

/** Renova o token de longa duração (válido por 60 dias; só renova se tiver 24h+). */
export async function refreshTokenIfNeeded(maxAgeDays = 7): Promise<"refreshed" | "fresh" | "skipped"> {
  const store = getStore();
  const rec = await store.get<TokenRec>(TOKEN_KEY);
  if (rec && Date.now() - rec.refreshedAt < maxAgeDays * 864e5) return "fresh";
  const current = rec?.token || process.env.IG_ACCESS_TOKEN;
  if (!current) return "skipped";
  const url = new URL(`${BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", current);
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new GraphError(res.status, json);
  await store.set(TOKEN_KEY, { token: json.access_token, refreshedAt: Date.now() } satisfies TokenRec);
  return "refreshed";
}

export function isDryRun() { return process.env.DRY_RUN === "true"; }

export async function getMe(): Promise<{ user_id?: string; username?: string; account_type?: string; name?: string }> {
  return call("GET", "me", { fields: "user_id,username,account_type,name" });
}
