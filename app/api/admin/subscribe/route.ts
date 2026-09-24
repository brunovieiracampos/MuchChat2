import { isAdminRequest } from "@/lib/session";
import { getToken } from "@/lib/instagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/subscribe?key=ADMIN_SECRET → inscreve a conta no webhook de "comments"
// GET  /api/admin/subscribe?key=ADMIN_SECRET → mostra a inscrição atual
async function call(method: "GET" | "POST") {
  const v = process.env.IG_GRAPH_VERSION || "v24.0";
  const url = new URL(`https://graph.instagram.com/${v}/me/subscribed_apps`);
  if (method === "POST") url.searchParams.set("subscribed_fields", "comments");
  url.searchParams.set("access_token", await getToken());
  const res = await fetch(url, { method, cache: "no-store" });
  return Response.json(await res.json().catch(() => ({})), { status: res.status });
}

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return new Response("unauthorized", { status: 401 });
  return call("GET");
}
export async function POST(req: Request) {
  if (!isAdminRequest(req)) return new Response("unauthorized", { status: 401 });
  return call("POST");
}
