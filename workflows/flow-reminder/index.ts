import { sleep } from "workflow";
import { reminderStep } from "./steps";

/**
 * Lembrete de um comentário parado num botão: dorme o tempo da automação e confere se a pessoa continua
 * na mesma espera (`wseq`). Se ela clicou nesse meio-tempo, a etapa não envia nada.
 */
export async function reminderWorkflow(accountId: string, commentId: string, wseq: number, delayMs: number) {
  "use workflow";

  await sleep(new Date(Date.now() + delayMs));
  return { result: await reminderStep(accountId, commentId, wseq) };
}
