import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Destino dos links enviados por e-mail (confirmar cadastro, redefinir senha).
 * Aceita os dois formatos do Supabase: ?code= (PKCE, padrão) e ?token_hash=&type= (modelo de e-mail próprio).
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl;
  const next = safeNext(u.searchParams.get("next"));
  const code = u.searchParams.get("code");
  const tokenHash = u.searchParams.get("token_hash");
  const type = u.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  const to = new URL(ok ? next : "/entrar?erro=link", u.origin);
  return NextResponse.redirect(to);
}
