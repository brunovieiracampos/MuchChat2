import "server-only";
import { cache } from "react";
import { toMaterial } from "@/lib/accounts";
import { SLUG_RE, isPortalUsername, ownsMaterialFile, type Material } from "@/lib/material";
import { signedUrl } from "@/lib/media-store";
import { allowKey, clientIp } from "@/lib/ratelimit";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Leitura do portal público (/m/...). Não há usuário logado: usa a chave de serviço, sempre filtrando pela conta
 * do endereço e por status "published". Nada daqui devolve rascunho.
 */

export type PortalAccount = { accountId: string; username: string };

/** Limite das páginas públicas: 600 visitas a cada 5 minutos por IP. Se o limitador cair, a página abre. */
export async function portalAllowed(): Promise<boolean> {
  try {
    return await allowKey(`portal:${await clientIp()}`, { limit: 600, windowSec: 300 });
  } catch (e) {
    console.error("[portal] limitador indisponível; liberando", e);
    return true;
  }
}

/** Conta dona do portal, pelo nome de usuário do endereço. */
export const portalAccount = cache(async (raw: string): Promise<PortalAccount | null> => {
  const username = raw.replace(/^@/, "").toLowerCase();
  if (!isPortalUsername(username)) return null;
  // O nome não é único no banco (uma conta desconectada pode ter deixado um nome antigo): vale a mais recente.
  const { data, error } = await createAdminClient().from("instagram_accounts").select("id, username")
    .eq("username", username).order("updated_at", { ascending: false }).limit(1);
  if (error) throw new Error(`Falha ao ler a conta do portal: ${error.message}`);
  const row = data?.[0];
  return row ? { accountId: row.id as string, username: row.username as string } : null;
});

// A biblioteca não carrega os blocos: o conteúdo dos exclusivos não sai do banco só para montar a lista.
const CARD_COLUMNS = "id, slug, title, description, cover_path, visibility, status, cta_post, cta_keyword, published_at, created_at, updated_at";

/** Materiais publicados da conta, do mais recente para o mais antigo, sem os blocos. */
export async function portalLibrary(accountId: string): Promise<Material[]> {
  const { data, error } = await createAdminClient().from("materials").select(CARD_COLUMNS)
    .eq("account_id", accountId).eq("status", "published").order("published_at", { ascending: false }).limit(200);
  if (error) throw new Error(`Falha ao ler a biblioteca: ${error.message}`);
  return (data ?? []).map(toMaterial);
}

/** Um material publicado, pelo endereço. */
export const portalMaterial = cache(async (accountId: string, slug: string): Promise<Material | null> => {
  if (!SLUG_RE.test(slug)) return null;
  const { data, error } = await createAdminClient().from("materials").select("*")
    .eq("account_id", accountId).eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw new Error(`Falha ao ler o material: ${error.message}`);
  return data ? toMaterial(data) : null;
});

/** Endereços temporários (1 hora) para capas e imagens da conta. O que falhar fica de fora. */
export async function portalUrls(accountId: string, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(paths.filter((p) => ownsMaterialFile(accountId, p)).map(async (p) => {
    try { out[p] = await signedUrl(p, 3600e3); } catch (e) { console.error("[portal] falha ao assinar", p, e); }
  }));
  return out;
}
