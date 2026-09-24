import crypto from "node:crypto";
import { isAuthorized } from "@/lib/auth";
import { SCOPES, redirectUri } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/auth/instagram?key=ADMIN_SECRET → abre o login do Instagram (Business Login)
export async function GET(req: Request) {
  if (!isAuthorized(req, process.env.ADMIN_SECRET)) return new Response("unauthorized", { status: 401 });
  const appId = process.env.IG_APP_ID;
  if (!appId) return new Response("IG_APP_ID não configurado", { status: 500 });
  const state = crypto.randomBytes(16).toString("hex");
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri(req));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      "Set-Cookie": `ig_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}
