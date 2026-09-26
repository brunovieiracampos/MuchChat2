import { handleMcp } from "@/lib/mcp-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Link do conector do Claude (web, desktop, celular): o token vem no caminho, porque o conector não envia cabeçalhos.
async function handle(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return handleMcp(req, (await params).token);
}

export { handle as GET, handle as POST, handle as DELETE };
