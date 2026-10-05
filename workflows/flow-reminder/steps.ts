import { RetryableError, getStepMetadata } from "workflow";
import { withAccount } from "@/lib/account-context";
import { accountById } from "@/lib/accounts";
import { friendlyError } from "@/lib/publisher";
import { logReminderFailure, retryPlan, sendReminder, type ReminderResult } from "@/lib/reminder";

/**
 * Etapa do lembrete (Node.js completo). Entra na conta do comentário e chama a regra (lib/reminder.ts).
 * Erro temporário: repete até 3 vezes, com espera entre as tentativas (lib/reminder.ts → retryPlan).
 * Erro permanente ou última tentativa: registra em Execuções e encerra; o fluxo da pessoa continua esperando o clique.
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
    const plan = retryPlan(e, attempt, MAX_RETRIES);
    if (plan.kind === "retry") throw new RetryableError(e instanceof Error ? e.message : String(e), { retryAfter: plan.afterSec * 1000 });
    if (plan.kind === "skip") return "skipped";
    await withAccount(account, () => logReminderFailure(commentId, wseq, friendlyError(e)));
    return "failed";
  }
}
reminderStep.maxRetries = MAX_RETRIES;
