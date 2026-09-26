import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Sessão do painel: usuário do Supabase Auth (cookies renovados pelo proxy.ts).
 * Cada usuário vê só os dados da própria conta do Instagram (ver lib/panel.ts).
 */

export type SessionUser = { id: string; email: string; name: string };

/** Usuário logado, validado no servidor do Supabase (não confia só no cookie). */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u?.email) return null;
  const { data: profile } = await supabase.from("profiles").select("name").eq("id", u.id).maybeSingle();
  const name = (profile?.name || (u.user_metadata?.name as string | undefined) || "").trim();
  return { id: u.id, email: u.email, name: name || u.email.split("@")[0] };
});

/** Para páginas e server actions do painel. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/entrar");
  return user;
}
