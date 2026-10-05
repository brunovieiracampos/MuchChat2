import "server-only";
import { start } from "workflow/api";
import { currentAccount } from "@/lib/account-context";
import { reminderWorkflow } from "@/workflows/flow-reminder";

/** Inicia o processo que vai conferir este comentário daqui a `delayMs`. Roda dentro da conta em uso. */
export async function scheduleReminder(commentId: string, wseq: number, delayMs: number): Promise<void> {
  await start(reminderWorkflow, [currentAccount().accountId, commentId, wseq, delayMs]);
}
