import { SESSION_COOKIE, SESSION_MAX_AGE, checkPassword, sessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Links antigos /admin?key=ADMIN_SECRET: abrem a sessão do painel e redirecionam.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get("key");
  const token = sessionToken();
  if (!key || !token || !checkPassword(key)) return Response.redirect(new URL("/entrar", u), 302);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/painel",
      "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`,
    },
  });
}
