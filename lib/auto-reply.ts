import { isPaused } from "@/lib/automations";
import * as ig from "@/lib/instagram";
import { getStore } from "@/lib/store";

/**
 * Resposta automática de DM (versão de teste): com a função ligada, quem manda um texto no direct
 * recebe uma mensagem fixa. Módulo à parte do motor de automações; a única ligação é o webhook,
 * que chama `autoReply` quando o texto não pertence a nenhum fluxo.
 */

export type AutoReplyConfig = { enabled: boolean; text: string };

export type AutoReplyResult = "off" | "ignored" | "dry-run" | "paused" | "in-flow" | "cooldown" | "sent" | "error";

export type AutoReplyDeps = {
  sendMessage: typeof ig.sendMessage;
  ownUserId: () => Promise<string | undefined>;
  dryRun: () => boolean;
  paused: () => Promise<boolean>;
};

const defaultDeps: AutoReplyDeps = {
  sendMessage: ig.sendMessage,
  ownUserId: () => ig.igUserId().catch(() => undefined),
  dryRun: ig.isDryRun,
  paused: isPaused,
};

const CONFIG_KEY = "autoreply";
const COOLDOWN_S = 24 * 3600; // uma resposta por pessoa a cada 24h
export const AUTO_REPLY_MAX = 1000; // limite de texto de uma mensagem do direct

const sentKey = (igsid: string) => `ar:${igsid}`;

export async function getAutoReply(): Promise<AutoReplyConfig> {
  const c = await getStore().get<Partial<AutoReplyConfig>>(CONFIG_KEY);
  return { enabled: c?.enabled === true, text: typeof c?.text === "string" ? c.text : "" };
}

export async function saveAutoReply(input: AutoReplyConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = String(input.text ?? "").replace(/\r\n/g, "\n").trim();
  const enabled = input.enabled === true;
  if (enabled && !text) return { ok: false, error: "Escreva a mensagem antes de ligar." };
  if (text.length > AUTO_REPLY_MAX) return { ok: false, error: `A mensagem pode ter até ${AUTO_REPLY_MAX} caracteres.` };
  await getStore().set(CONFIG_KEY, { enabled, text });
  return { ok: true };
}

/** Chegou um texto por DM que não é de nenhum fluxo: responde, se a função estiver ligada. */
export async function autoReply(ev: { igsid: string; text?: string }, deps: AutoReplyDeps = defaultDeps): Promise<AutoReplyResult> {
  const cfg = await getAutoReply();
  if (!cfg.enabled || !cfg.text) return "off";
  if (!ev.text?.trim()) return "ignored";
  if (deps.dryRun()) return "dry-run";
  if (await deps.paused()) return "paused";
  if (ev.igsid === (await deps.ownUserId())) return "ignored";

  // Quem está parado num botão de automação está no meio de um fluxo: não interrompe.
  const store = getStore();
  const commentId = await store.get<string>(`w:${ev.igsid}`);
  if (commentId && (await store.hget<string>(`c:${commentId}`, "status")) === "waiting") return "in-flow";

  // O "nx" também barra a entrega repetida do mesmo aviso pela Meta.
  if (!(await store.set(sentKey(ev.igsid), Date.now(), { nx: true, ex: COOLDOWN_S }))) return "cooldown";
  try {
    await deps.sendMessage(ev.igsid, { text: cfg.text });
    return "sent";
  } catch (e) {
    await store.del(sentKey(ev.igsid));
    console.error("[auto-reply] erro ao enviar", ev.igsid, e);
    return "error";
  }
}
