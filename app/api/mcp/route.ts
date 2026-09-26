import { handleMcp } from "@/lib/mcp-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Claude Code: token no cabeçalho Authorization: Bearer.
const handle = (req: Request) => handleMcp(req);

export { handle as GET, handle as POST, handle as DELETE };
