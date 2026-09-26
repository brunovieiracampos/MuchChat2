import crypto from "node:crypto";

export function verifySignature(raw: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
}

/** Aceita só "Authorization: Bearer <segredo>" (segredo em URL acaba em logs), comparando em tempo constante. */
export function isAuthorized(req: Request, ...secrets: (string | undefined)[]): boolean {
  const got = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!got) return false;
  const a = Buffer.from(got);
  return secrets.some((s) => {
    if (!s) return false;
    const b = Buffer.from(s);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
