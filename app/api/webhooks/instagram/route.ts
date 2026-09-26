import { after } from "next/server";
import { verifySignature } from "@/lib/auth";
import { extractClicks, extractComments } from "@/lib/webhook";
import { withAccount } from "@/lib/account-context";
import { accountByIgUserId } from "@/lib/accounts";
import { handleClick, processComment, type IncomingClick, type IncomingComment } from "@/lib/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Verificação do webhook (painel da Meta → Webhooks → Callback URL + Verify token)
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.IG_VERIFY_TOKEN) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), process.env.IG_APP_SECRET)) {
    console.warn("[webhook] assinatura inválida");
    return new Response("invalid signature", { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const comments = extractComments(payload);
  const clicks = extractClicks(payload);
  // Responde 200 na hora (a Meta reenvia se demorar) e processa em seguida, conta por conta.
  after(async () => {
    const byAccount = new Map<string, { comments: IncomingComment[]; clicks: IncomingClick[] }>();
    const group = (id?: string) => {
      if (!id) return null;
      let g = byAccount.get(id);
      if (!g) byAccount.set(id, (g = { comments: [], clicks: [] }));
      return g;
    };
    for (const c of comments) group(c.accountId)?.comments.push(c);
    for (const k of clicks) group(k.accountId)?.clicks.push(k);

    for (const [igUserId, g] of byAccount) {
      let account;
      try { account = await accountByIgUserId(igUserId); } catch (e) { console.error("[webhook] erro ao carregar a conta", igUserId, e); continue; }
      if (!account) { console.warn("[webhook] conta não conectada ao Much Chat; evento ignorado", igUserId); continue; }
      await withAccount(account, async () => {
        for (const c of g.comments) {
          try {
            const r = await processComment(c, "webhook");
            console.log("[webhook]", igUserId, c.id, r);
          } catch (e) {
            console.error("[webhook] erro", igUserId, c.id, e);
          }
        }
        for (const k of g.clicks) {
          try {
            const r = await handleClick(k, "webhook");
            if (r !== "ignored") console.log("[webhook] clique", igUserId, k.igsid, r);
          } catch (e) {
            console.error("[webhook] erro no clique", igUserId, k.igsid, e);
          }
        }
      });
    }
  });
  return new Response("ok", { status: 200 });
}
