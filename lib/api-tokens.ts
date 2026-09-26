import "server-only";
import crypto from "node:crypto";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Tokens pessoais do MCP. O valor só é mostrado na criação; o banco guarda o SHA-256.
 * Criar, listar e revogar usam o cliente do usuário (RLS); conferir o token usa a chave de serviço.
 */

export type ApiToken = { id: string; name: string; hint: string; createdAt: string; lastUsedAt: string | null };

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function listTokens(): Promise<ApiToken[]> {
  const db = await createClient();
  const { data, error } = await db.from("api_tokens").select("id, name, hint, created_at, last_used_at").order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar tokens: ${error.message}`);
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, hint: t.hint, createdAt: t.created_at, lastUsedAt: t.last_used_at }));
}

/** Cria um token para o usuário logado e devolve o valor (única vez em que ele aparece). */
export async function createToken(userId: string, name: string): Promise<string> {
  const token = `mc_${crypto.randomBytes(32).toString("base64url")}`;
  const db = await createClient();
  const { error } = await db.from("api_tokens").insert({ owner_id: userId, name: name.slice(0, 60), token_hash: hash(token), hint: token.slice(-4) });
  if (error) throw new Error(`Falha ao criar o token: ${error.message}`);
  return token;
}

export async function revokeToken(id: string): Promise<void> {
  const db = await createClient();
  const { error } = await db.from("api_tokens").delete().eq("id", id);
  if (error) throw new Error(`Falha ao revogar o token: ${error.message}`);
}

/** Dono do token (ou null). Atualiza "último uso" no máximo uma vez por hora. */
export async function userForToken(token: string | undefined): Promise<string | null> {
  if (!token?.startsWith("mc_")) return null;
  const db = createAdminClient();
  const { data } = await db.from("api_tokens").select("id, owner_id, last_used_at").eq("token_hash", hash(token)).maybeSingle();
  if (!data) return null;
  if (!data.last_used_at || Date.now() - Date.parse(data.last_used_at) > 3600e3) {
    await db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  return data.owner_id;
}
