import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isOwner } from "@/lib/account";
import { isAuthorized } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Sessão do painel: usuário do Supabase Auth (cookies renovados pelo proxy.ts).
 *
 * Até os dados serem separados por conta (fase 2), o painel ainda mostra uma conta só (@d.ia.riamente).
 * Por isso só os e-mails em OWNER_EMAILS entram; quem mais se cadastrar vai para /aguardando.
 */

export { isOwner };

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
  if (!isOwner(user.email)) redirect("/aguardando");
  return user;
}

/** Para route handlers: usuário dono logado ou o ADMIN_SECRET (Bearer / ?key=) para scripts. */
export async function isAdminRequest(req: Request): Promise<boolean> {
  if (isAuthorized(req, process.env.ADMIN_SECRET)) return true;
  const user = await getUser();
  return !!user && isOwner(user.email);
}
