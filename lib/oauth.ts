export const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
].join(",");

export function redirectUri(req: Request) {
  return process.env.IG_REDIRECT_URI || `${new URL(req.url).origin}/api/auth/instagram/callback`;
}
