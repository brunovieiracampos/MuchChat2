import { sleep } from "workflow";
import { cleanupStep, prepareStep, publishStep } from "./steps";

/** Antecedência da preparação: dá tempo de a Meta processar e de um erro de formato aparecer antes da hora. */
const PREPARE_BEFORE_MS = 10 * 60e3;
const MEDIA_RETENTION = "1d";

/**
 * Publicação agendada: dorme até 10 min antes, prepara a mídia na Meta, dorme até a hora, publica,
 * e apaga a mídia 1 dia depois. `token` é a ficha do agendamento: se a pessoa reagendar ou cancelar,
 * as etapas veem que a ficha mudou e o processo termina sem publicar.
 */
export async function publishPostWorkflow(accountId: string, postId: string, token: string, at: number) {
  "use workflow";

  const prepareAt = at - PREPARE_BEFORE_MS;
  if (prepareAt > Date.now()) await sleep(new Date(prepareAt));
  if ((await prepareStep(accountId, postId, token)) === "stop") return { result: "stopped" as const };

  if (at > Date.now()) await sleep(new Date(at));
  if ((await publishStep(accountId, postId, token)) === "stop") return { result: "stopped" as const };

  await sleep(MEDIA_RETENTION);
  await cleanupStep(accountId, postId);
  return { result: "published" as const };
}
