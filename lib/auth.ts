import crypto from "node:crypto";

export function verifySignature(raw: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
}

/** Aceita "Authorization: Bearer <segredo>" ou "?key=<segredo>" com ADMIN_SECRET (ou CRON_SECRET no cron). */
export function isAuthorized(req: Request, ...secrets: (string | undefined)[]): boolean {
  const valid = secrets.filter((s): s is string => !!s);
  if (!valid.length) return false;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const key = new URL(req.url).searchParams.get("key");
  return valid.some((s) => s === bearer || s === key);
}
