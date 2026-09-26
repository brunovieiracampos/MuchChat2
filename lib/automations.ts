import crypto from "node:crypto";
import type { Rule } from "@/config/rules";
import { currentAccount } from "@/lib/account-context";
import { normalizeInput, toInput, validateAutomation, type AutomationInput, type Issue } from "@/lib/automation-input";
import { waitsNextPost } from "@/lib/match";
import { deleteStats } from "@/lib/stats";
import { getStore } from "@/lib/store";

export { toInput, type AutomationInput, type Issue } from "@/lib/automation-input";

const PAUSED_KEY = "paused";

/** Automações da conta em uso (Postgres; no painel, com RLS). */
export async function listAutomations(): Promise<Rule[]> {
  return currentAccount().repo.listAutomations();
}

export async function getAutomation(id: string): Promise<Rule | null> {
  return (await listAutomations()).find((a) => a.id === id) ?? null;
}

function slug(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "automacao";
}

export async function saveAutomation(raw: AutomationInput): Promise<{ ok: true; automation: Rule } | { ok: false; issues: Issue[] }> {
  const input = normalizeInput(raw);
  const list = await listAutomations();
  const issues = validateAutomation(input, list);
  if (issues.length) return { ok: false, issues };

  const now = Date.now();
  const prev = input.id ? list.find((a) => a.id === input.id) : undefined;
  const automation: Rule = {
    id: prev?.id ?? `${slug(input.name)}-${crypto.randomBytes(3).toString("hex")}`,
    name: input.name,
    posts: input.posts,
    keywords: input.keywords,
    link: input.link,
    dm: "",
    steps: input.steps,
    active: input.active,
    // "Próxima publicação": arma ao ativar; se já estava armada e ativa, mantém o momento original.
    armedAt: input.active && waitsNextPost(input) ? (prev?.active !== false && prev?.armedAt ? prev.armedAt : now) : undefined,
    boundAt: waitsNextPost(input) ? undefined : prev?.boundAt,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  await currentAccount().repo.saveAutomation(automation);
  return { ok: true, automation };
}

export async function setAutomationActive(id: string, active: boolean): Promise<{ ok: true } | { ok: false; issues: Issue[] }> {
  const list = await listAutomations();
  const a = list.find((x) => x.id === id);
  if (!a) return { ok: false, issues: [{ field: "name", message: "Automação não encontrada." }] };
  if (active) {
    const issues = validateAutomation({ ...toInput(a), active: true }, list);
    if (issues.length) return { ok: false, issues };
  }
  const now = Date.now();
  const armedAt = active && waitsNextPost(a) ? (a.active !== false && a.armedAt ? a.armedAt : now) : undefined;
  await currentAccount().repo.saveAutomation({ ...a, active, armedAt, updatedAt: now });
  return { ok: true };
}

export async function duplicateAutomation(id: string): Promise<Rule | null> {
  const list = await listAutomations();
  const a = list.find((x) => x.id === id);
  if (!a) return null;
  const now = Date.now();
  const copy: Rule = { ...a, id: `${slug(a.name ?? a.id)}-${crypto.randomBytes(3).toString("hex")}`, name: `${a.name ?? a.id} (cópia)`, active: false, armedAt: undefined, boundAt: undefined, createdAt: now, updatedAt: now };
  await currentAccount().repo.saveAutomation(copy);
  return copy;
}

/** Grava uma automação já validada (ex.: presa à próxima publicação pelo processador). */
export async function storeAutomation(rule: Rule): Promise<void> {
  await currentAccount().repo.saveAutomation(rule);
}

export async function deleteAutomation(id: string): Promise<void> {
  await currentAccount().repo.deleteAutomation(id);
  await deleteStats(id);
}

/** Pausa geral: nenhum comentário é processado; a varredura recupera o que ficou para trás ao retomar (até 7 dias). */
export async function isPaused(): Promise<boolean> {
  return (await getStore().get<boolean>(PAUSED_KEY)) === true;
}

export async function setPaused(paused: boolean): Promise<void> {
  const store = getStore();
  if (paused) await store.set(PAUSED_KEY, true);
  else await store.del(PAUSED_KEY);
}
