import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova a sessão do Supabase a cada navegação (os tokens expiram) e faz a checagem otimista:
 * quem não está logado e abre o painel vai para /entrar. A checagem de verdade fica em lib/session.ts.
 */
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) res.headers.set(k, v);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = req.nextUrl.pathname;
  if (!data?.claims && path.startsWith("/painel")) {
    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = path === "/painel" ? "" : `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  // Páginas e ações; fica de fora o que não usa sessão (webhook, cron, arquivos estáticos).
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
