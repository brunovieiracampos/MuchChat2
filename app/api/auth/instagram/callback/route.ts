import { withAccount } from "@/lib/account-context";
import { accountByIgUserId, connectAccount } from "@/lib/accounts";
import { subscribeWebhook } from "@/lib/instagram";
import { getUser } from "@/lib/session";
import { redirectUri } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recebe o code do Instagram, troca por token curto e depois por token de longa duração (60 dias).
const back = (req: Request, query: string) => new Response(null, {
  status: 302,
  headers: { Location: new URL(`/painel/conexao?${query}`, req.url).toString(), "Set-Cookie": "ig_oauth_state=; Path=/; Max-Age=0" },
});

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.redirect(new URL("/entrar?next=/painel/conexao", req.url), 302);
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const cookie = req.headers.get("cookie")?.match(/ig_oauth_state=([a-f0-9]+)/)?.[1];
  if (u.searchParams.get("error")) return back(req, "erro=cancelado");
  if (!code || !state || state !== cookie) return back(req, "erro=sessao");

  const appId = process.env.IG_APP_ID!, secret = process.env.IG_APP_SECRET!;
  const form = new URLSearchParams({
    client_id: appId, client_secret: secret, grant_type: "authorization_code",
    redirect_uri: redirectUri(req), code: code.replace(/#_$/, ""),
  });
  const shortRes = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
  const short = await shortRes.json().catch(() => ({}));
  const shortToken = short.access_token ?? short.data?.[0]?.access_token;
  const userId = String(short.user_id ?? short.data?.[0]?.user_id ?? "");
  if (!shortToken || !userId) { console.error("[oauth] falha ao trocar code", short); return back(req, "erro=meta"); }

  const ll = new URL("https://graph.instagram.com/access_token");
  ll.searchParams.set("grant_type", "ig_exchange_token");
  ll.searchParams.set("client_secret", secret);
  ll.searchParams.set("access_token", shortToken);
  const longRes = await fetch(ll);
  const long = await longRes.json().catch(() => ({}));
  if (!long.access_token) { console.error("[oauth] falha no token longo", long); return back(req, "erro=meta"); }

  // O ID usado em /messages e no webhook é o user_id do /me (conta profissional).
  const me = await fetch(`https://graph.instagram.com/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(long.access_token)}`)
    .then((r) => r.json()).catch(() => ({}));
  const igUserId = String(me.user_id ?? userId);
  const r = await connectAccount(user.id, { igUserId, username: me.username ?? "", accountType: me.account_type, token: long.access_token });
  if (!r.ok) return back(req, r.reason === "taken" ? "erro=em-uso" : `erro=outra-conta&conta=${encodeURIComponent(r.username ?? "")}`);

  // Inscreve a conta no webhook (comentários, mensagens e cliques). Se falhar, dá para refazer em Configurações.
  const account = await accountByIgUserId(igUserId);
  let subscribed = true;
  if (account) await withAccount(account, () => subscribeWebhook()).catch((e) => { subscribed = false; console.error("[oauth] inscrição no webhook", e); });
  return back(req, subscribed ? "conectado=1" : "conectado=1&webhook=falhou");
}
