import { getStepMetadata } from "workflow";
import { withAccount } from "@/lib/account-context";
import { accountById } from "@/lib/accounts";
import {
  cleanupMedia, defaultPublisherDeps, failPost, friendlyError, preparePost, publishPost, type StepResult,
} from "@/lib/publisher";

/**
 * Etapas do processo de publicação (Node.js completo). Cada uma entra na conta da publicação.
 * Tentativas: o Workflow repete até 3 vezes; na última, a publicação é marcada como "falhou"
 * com o motivo, em vez de ficar parada em "preparando/publicando".
 */

const MAX_RETRIES = 3;

async function inAccount<T>(accountId: string, fn: () => Promise<T>): Promise<T | "stop"> {
  const account = await accountById(accountId);
  if (!account) return "stop"; // conta desconectada: nada a fazer
  return withAccount(account, fn);
}

async function guarded(accountId: string, postId: string, token: string, fn: () => Promise<StepResult>): Promise<StepResult> {
  try {
    return (await inAccount(accountId, fn)) as StepResult;
  } catch (e) {
    const { attempt } = getStepMetadata();
    console.error("[publicação]", postId, `tentativa ${attempt}`, e);
    if (attempt > MAX_RETRIES) {
      await inAccount(accountId, async () => failPost(postId, token, friendlyError(e), await defaultPublisherDeps()));
      return "stop";
    }
    throw e;
  }
}

export async function prepareStep(accountId: string, postId: string, token: string): Promise<StepResult> {
  "use step";
  return guarded(accountId, postId, token, async () => preparePost(postId, token, await defaultPublisherDeps()));
}
prepareStep.maxRetries = MAX_RETRIES;

export async function publishStep(accountId: string, postId: string, token: string): Promise<StepResult> {
  "use step";
  return guarded(accountId, postId, token, async () => publishPost(postId, token, await defaultPublisherDeps()));
}
publishStep.maxRetries = MAX_RETRIES;

export async function cleanupStep(accountId: string, postId: string): Promise<void> {
  "use step";
  await inAccount(accountId, async () => cleanupMedia(postId, await defaultPublisherDeps()));
}
