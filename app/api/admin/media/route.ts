import { isAdminRequest } from "@/lib/session";
import { listRecentMedia } from "@/lib/instagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/media?key=ADMIN_SECRET → posts recentes (id, shortcode, link) para montar as regras
export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return new Response("unauthorized", { status: 401 });
  const media = await listRecentMedia(25);
  return Response.json(media.map((m) => ({ id: m.id, shortcode: m.shortcode, permalink: m.permalink, timestamp: m.timestamp, caption: m.caption?.slice(0, 80) })));
}
