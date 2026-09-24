import { isAdminRequest } from "@/lib/session";
import { readLog, resetFailed } from "@/lib/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/log?key=ADMIN_SECRET&n=200 → últimos eventos
export async function GET(req: Request) {
  if (!isAdminRequest(req)) return new Response("unauthorized", { status: 401 });
  const n = Math.min(Number(new URL(req.url).searchParams.get("n") ?? 200), 2000);
  const log = await readLog(n);
  return Response.json(log.map((e) => ({ ...e, when: new Date(e.at).toISOString() })));
}

// POST /api/admin/log?key=ADMIN_SECRET&action=retry-failed → libera DMs que falharam para a próxima varredura
export async function POST(req: Request) {
  if (!isAdminRequest(req)) return new Response("unauthorized", { status: 401 });
  const action = new URL(req.url).searchParams.get("action");
  if (action !== "retry-failed") return new Response("unknown action", { status: 400 });
  return Response.json({ reset: await resetFailed() });
}
