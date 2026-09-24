import { saveConnection } from "@/lib/instagram";
import { redirectUri } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recebe o code do Instagram, troca por token curto e depois por token de longa duração (60 dias).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const cookie = req.headers.get("cookie")?.match(/ig_oauth_state=([a-f0-9]+)/)?.[1];
  if (u.searchParams.get("error")) return new Response(`Login cancelado: ${u.searchParams.get("error_description") ?? ""}`, { status: 400 });
  if (!code || !state || state !== cookie) return new Response("state inválido", { status: 400 });

  const appId = process.env.IG_APP_ID!, secret = process.env.IG_APP_SECRET!;
  const form = new URLSearchParams({
    client_id: appId, client_secret: secret, grant_type: "authorization_code",
    redirect_uri: redirectUri(req), code: code.replace(/#_$/, ""),
  });
  const shortRes = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
  const short = await shortRes.json().catch(() => ({}));
  const shortToken = short.access_token ?? short.data?.[0]?.access_token;
  const userId = String(short.user_id ?? short.data?.[0]?.user_id ?? "");
  if (!shortToken || !userId) return new Response(`Falha ao trocar code: ${JSON.stringify(short)}`, { status: 502 });

  const ll = new URL("https://graph.instagram.com/access_token");
  ll.searchParams.set("grant_type", "ig_exchange_token");
  ll.searchParams.set("client_secret", secret);
  ll.searchParams.set("access_token", shortToken);
  const longRes = await fetch(ll);
  const long = await longRes.json().catch(() => ({}));
  if (!long.access_token) return new Response(`Falha no token longo: ${JSON.stringify(long)}`, { status: 502 });

  // O ID usado em /messages e no webhook é o user_id do /me (conta profissional).
  const me = await fetch(`https://graph.instagram.com/me?fields=user_id,username&access_token=${encodeURIComponent(long.access_token)}`)
    .then((r) => r.json()).catch(() => ({}));
  await saveConnection(long.access_token, String(me.user_id ?? userId));
  return new Response(null, {
    status: 302,
    headers: { Location: "/painel/configuracoes?conectado=1", "Set-Cookie": "ig_oauth_state=; Path=/; Max-Age=0" },
  });
}
