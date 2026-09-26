import { currentAccount } from "@/lib/account-context";

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

/** Token e ID vêm da conta em uso (lib/account-context.ts). */
export async function getToken(): Promise<string> {
  return currentAccount().token;
}

export async function igUserId(): Promise<string> {
  return currentAccount().igUserId;
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

export type IgMedia = {
  id: string; shortcode?: string; permalink?: string; timestamp?: string; caption?: string;
  media_type?: string; media_url?: string; thumbnail_url?: string; comments_count?: number;
};
export type IgComment = { id: string; text?: string; timestamp?: string; username?: string; from?: { id: string; username?: string }; parent_id?: string };

export async function getMedia(mediaId: string): Promise<IgMedia> {
  return call<IgMedia>("GET", mediaId, { fields: "id,shortcode,permalink,timestamp" });
}

const MEDIA_FIELDS = "id,shortcode,permalink,timestamp,caption,media_type,media_url,thumbnail_url,comments_count";

export async function listRecentMedia(limit = 25): Promise<IgMedia[]> {
  return (await listMediaPage(limit)).items;
}

/** Posts do perfil, do mais novo para o mais antigo, página por página. */
export async function listMediaPage(limit = 24, after?: string): Promise<{ items: IgMedia[]; next?: string }> {
  const params: Record<string, string> = { fields: MEDIA_FIELDS, limit: String(limit) };
  if (after) params.after = after;
  const r = await call<{ data: IgMedia[]; paging?: { cursors?: { after?: string }; next?: string } }>("GET", `${await igUserId()}/media`, params);
  return { items: r.data ?? [], next: r.paging?.next ? r.paging.cursors?.after : undefined };
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

/** Mensagem do direct: texto simples ou texto com até 3 botões (button template). */
export type OutMessage = {
  text: string;
  buttons?: ({ type: "postback"; title: string; payload: string } | { type: "web_url"; title: string; url: string })[];
};

function toGraphMessage(m: OutMessage) {
  if (!m.buttons?.length) return { text: m.text };
  return { attachment: { type: "template", payload: { template_type: "button", text: m.text, buttons: m.buttons } } };
}

export type SendResult = { recipient_id?: string; message_id?: string };

/** Private Reply: 1 mensagem por comentário, até 7 dias após o comentário. */
export async function sendPrivateReply(commentId: string, message: OutMessage): Promise<SendResult> {
  return call("POST", `${await igUserId()}/messages`, {}, { recipient: { comment_id: commentId }, message: toGraphMessage(message) });
}

/** Mensagem para quem já interagiu na conversa (até 24h depois da interação). */
export async function sendMessage(igsid: string, message: OutMessage): Promise<SendResult> {
  return call("POST", `${await igUserId()}/messages`, {}, { recipient: { id: igsid }, message: toGraphMessage(message) });
}

/** Se a pessoa segue o perfil. Só funciona depois que ela interagiu na conversa. */
export async function isFollower(igsid: string): Promise<boolean> {
  const r = await call<{ is_user_follow_business?: boolean }>("GET", igsid, { fields: "is_user_follow_business" });
  if (typeof r.is_user_follow_business !== "boolean") throw new Error("A API não informou se a pessoa segue o perfil.");
  return r.is_user_follow_business;
}

/** Renova o token de longa duração da conta em uso (válido por 60 dias; a Meta só renova com 24h+). */
export async function refreshTokenIfNeeded(maxAgeDays = 7): Promise<"refreshed" | "fresh"> {
  const ctx = currentAccount();
  if (Date.now() - ctx.tokenRefreshedAt < maxAgeDays * 864e5) return "fresh";
  const url = new URL(`${BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", ctx.token);
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new GraphError(res.status, json);
  const now = Date.now();
  await ctx.repo.saveToken(json.access_token, now);
  ctx.token = json.access_token;
  ctx.tokenRefreshedAt = now;
  return "refreshed";
}

/** Inscreve a conta nos eventos do webhook (comentários, mensagens e cliques em botões). */
export async function subscribeWebhook(): Promise<void> {
  await call("POST", "me/subscribed_apps", { subscribed_fields: "comments,messages,messaging_postbacks" });
}

/** Campos do webhook em que a conta está inscrita (ex.: ["comments"]). */
export async function getSubscribedFields(): Promise<string[]> {
  const r = await call<{ data?: { subscribed_fields?: string[] }[] }>("GET", "me/subscribed_apps");
  return (r.data ?? []).flatMap((d) => d.subscribed_fields ?? []);
}

export function isDryRun() { return process.env.DRY_RUN === "true"; }

export async function getMe(): Promise<{ user_id?: string; username?: string; account_type?: string; name?: string }> {
  return call("GET", "me", { fields: "user_id,username,account_type,name" });
}
