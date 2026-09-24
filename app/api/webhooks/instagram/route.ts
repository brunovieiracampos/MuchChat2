import { after } from "next/server";
import { verifySignature } from "@/lib/auth";
import { extractClicks, extractComments } from "@/lib/webhook";
import { handleClick, processComment } from "@/lib/processor";

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
  // Responde 200 na hora (a Meta reenvia se demorar) e processa em seguida.
  after(async () => {
    for (const c of comments) {
      try {
        const r = await processComment(c, "webhook");
        console.log("[webhook]", c.id, r);
      } catch (e) {
        console.error("[webhook] erro", c.id, e);
      }
    }
    for (const k of clicks) {
      try {
        const r = await handleClick(k, "webhook");
        if (r !== "ignored") console.log("[webhook] clique", k.igsid, r);
      } catch (e) {
        console.error("[webhook] erro no clique", k.igsid, e);
      }
    }
  });
  return new Response("ok", { status: 200 });
}
