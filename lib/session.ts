import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthorized } from "@/lib/auth";

/** Sessão do painel: cookie HttpOnly com um HMAC derivado do ADMIN_SECRET (trocar o segredo derruba as sessões). */
export const SESSION_COOKIE = "painel";
export const SESSION_MAX_AGE = 30 * 86400;

export function sessionToken(secret = process.env.ADMIN_SECRET): string | null {
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update("painel-v1").digest("hex");
}

export function isValidSession(value: string | undefined): boolean {
  const expected = sessionToken();
  if (!expected || !value || value.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export function checkPassword(password: string): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || password.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(secret));
}

export async function hasSession(): Promise<boolean> {
  return isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Para páginas e server actions do painel. */
export async function requireSession(): Promise<void> {
  if (!(await hasSession())) redirect("/entrar");
}

/** Cookie do painel lido direto do Request (route handlers). */
export function sessionFromRequest(req: Request): boolean {
  const m = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([a-f0-9]+)`));
  return isValidSession(m?.[1]);
}

/** Para route handlers: aceita o cookie do painel ou o ADMIN_SECRET (Bearer / ?key=). */
export function isAdminRequest(req: Request): boolean {
  return sessionFromRequest(req) || isAuthorized(req, process.env.ADMIN_SECRET);
}
