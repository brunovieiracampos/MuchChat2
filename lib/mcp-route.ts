import "server-only";
import { createMcpHandler } from "mcp-handler";
import { PRODUCT } from "@/config/site";
import { withAccount } from "@/lib/account-context";
import { accountForOwnerService } from "@/lib/accounts";
import { userForToken } from "@/lib/api-tokens";
import { registerTools } from "@/lib/mcp";

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "muchchat", version: "1.0.0" },
  instructions: `Ferramentas do ${PRODUCT.name}: automações que respondem comentários do Instagram e mandam o material no direct. `
    + "Para um post agendado que ainda não saiu, crie a automação com posts \"proxima\" e ative; ou crie como rascunho e associe o post depois com set_automation_post. "
    + "Antes de excluir, confirme com a pessoa.",
});

const unauthorized = (message: string) => Response.json({ error: message }, {
  status: 401,
  headers: { "WWW-Authenticate": `Bearer realm="${PRODUCT.name}", error="invalid_token"` },
});

/**
 * MCP do Much Chat (Streamable HTTP). Autenticação por token pessoal (Configurações → Acesso pelo Claude),
 * no cabeçalho Authorization (Claude Code) ou no próprio link /api/mcp/{token} (conector do Claude, que não aceita cabeçalho).
 * Tudo roda dentro da conta do Instagram do dono do token, como no painel.
 */
export async function handleMcp(req: Request, pathToken?: string): Promise<Response> {
  const token = pathToken ?? req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const userId = await userForToken(token);
  if (!userId) return unauthorized("Token ausente, inválido ou revogado. Gere um em Configurações → Acesso pelo Claude.");
  const account = await accountForOwnerService(userId);
  if (!account) return unauthorized("Conecte sua conta do Instagram no painel antes de usar o MCP.");
  return withAccount(account, () => handler(req));
}

