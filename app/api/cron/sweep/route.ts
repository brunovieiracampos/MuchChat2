import { isAuthorized } from "@/lib/auth";
import { sweep } from "@/lib/sweep";
import { refreshTokenIfNeeded } from "@/lib/instagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Chamado pelo cron da Vercel (Authorization: Bearer CRON_SECRET) ou manualmente com ADMIN_SECRET.
export async function GET(req: Request) {
  if (!isAuthorized(req, process.env.CRON_SECRET, process.env.ADMIN_SECRET)) {
    return new Response("unauthorized", { status: 401 });
  }
  let token: string;
  try { token = await refreshTokenIfNeeded(); } catch (e) { token = `erro: ${String(e)}`; }
  const result = await sweep();
  return Response.json({ token, ...result });
}
