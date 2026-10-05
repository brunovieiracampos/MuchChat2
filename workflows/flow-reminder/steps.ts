import { getStepMetadata } from "workflow";
import { withAccount } from "@/lib/account-context";
import { accountById } from "@/lib/accounts";
import { GraphError } from "@/lib/instagram";
import { friendlyError } from "@/lib/publisher";
import { logReminderFailure, sendReminder, type ReminderResult } from "@/lib/reminder";

/**
 * Etapa do lembrete (Node.js completo). Entra na conta do comentário e chama a regra (lib/reminder.ts).
 * Erro temporário: o Workflow repete até 3 vezes. Erro permanente ou última tentativa: registra em
 * Execuções e encerra; o fluxo da pessoa continua esperando o clique.
 */

const MAX_RETRIES = 3;

export async function reminderStep(accountId: string, commentId: string, wseq: number): Promise<ReminderResult | "failed"> {
  "use step";
  const account = await accountById(accountId);
  if (!account) return "skipped"; // conta desconectada: nada a fazer
  try {
    return await withAccount(account, () => sendReminder(commentId, wseq));
  } catch (e) {
    const { attempt } = getStepMetadata();
    console.error("[lembrete]", commentId, `tentativa ${attempt}`, e);
    const final = attempt > MAX_RETRIES || (e instanceof GraphError && e.permanent);
    if (!final) throw e;
    await withAccount(account, () => logReminderFailure(commentId, friendlyError(e)));
    return "failed";
  }
}
reminderStep.maxRetries = MAX_RETRIES;
