import crypto from "node:crypto";
import { RULES, type Rule } from "@/config/rules";
import { normalizeInput, toInput, validateAutomation, type AutomationInput, type Issue } from "@/lib/automation-input";
import { stepsOf } from "@/lib/flow";
import { deleteStats } from "@/lib/stats";
import { getStore } from "@/lib/store";

export { toInput, type AutomationInput, type Issue } from "@/lib/automation-input";

const KEY = "automations";
const PAUSED_KEY = "paused";

/** Automações salvas pelo painel. Na primeira leitura, popula o Redis com config/rules.ts. */
export async function listAutomations(): Promise<Rule[]> {
  const store = getStore();
  const saved = await store.get<Rule[]>(KEY);
  if (saved) return saved;
  const now = Date.now();
  const seed = RULES.map((r) => ({ active: true, createdAt: now, updatedAt: now, ...r, steps: stepsOf(r) }));
  await store.set(KEY, seed);
  return seed;
}

export async function getAutomation(id: string): Promise<Rule | null> {
  return (await listAutomations()).find((a) => a.id === id) ?? null;
}

async function writeAll(list: Rule[]) {
  await getStore().set(KEY, list);
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
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  await writeAll(prev ? list.map((a) => (a.id === prev.id ? automation : a)) : [...list, automation]);
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
  await writeAll(list.map((x) => (x.id === id ? { ...x, active, updatedAt: Date.now() } : x)));
  return { ok: true };
}

export async function duplicateAutomation(id: string): Promise<Rule | null> {
  const list = await listAutomations();
  const a = list.find((x) => x.id === id);
  if (!a) return null;
  const now = Date.now();
  const copy: Rule = { ...a, id: `${slug(a.name ?? a.id)}-${crypto.randomBytes(3).toString("hex")}`, name: `${a.name ?? a.id} (cópia)`, active: false, createdAt: now, updatedAt: now };
  await writeAll([...list, copy]);
  return copy;
}

export async function deleteAutomation(id: string): Promise<void> {
  await writeAll((await listAutomations()).filter((a) => a.id !== id));
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
