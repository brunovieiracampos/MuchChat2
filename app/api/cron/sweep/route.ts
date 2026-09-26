import { withAccount } from "@/lib/account-context";
import { allAccounts } from "@/lib/accounts";
import { isAuthorized } from "@/lib/auth";
import { refreshTokenIfNeeded } from "@/lib/instagram";
import { sweep } from "@/lib/sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Chamado pelo cron da Vercel (Authorization: Bearer CRON_SECRET) ou à mão com Authorization: Bearer ADMIN_SECRET.
// Percorre todas as contas conectadas; o erro de uma conta não interrompe as outras.
export async function GET(req: Request) {
  if (!isAuthorized(req, process.env.CRON_SECRET, process.env.ADMIN_SECRET)) {
    return new Response("unauthorized", { status: 401 });
  }
  // Detalhes (com @ e erros de cada conta) só no log; a resposta traz apenas contagens.
  const accounts = await allAccounts();
  let comments = 0, failedAccounts = 0, refreshed = 0;
  for (const account of accounts) {
    await withAccount(account, async () => {
      try { if ((await refreshTokenIfNeeded()) === "refreshed") refreshed++; } catch (e) { console.error("[sweep] token", account.accountId, e); }
      try {
        const r = await sweep();
        comments += r.comments;
        if (r.errors.length) console.warn("[sweep] erros", account.accountId, r.errors.slice(0, 5));
      } catch (e) {
        failedAccounts++;
        console.error("[sweep] falhou", account.accountId, e);
      }
    });
  }
  return Response.json({ accounts: accounts.length, failedAccounts, tokensRefreshed: refreshed, comments });
}
