"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  deleteAutomation, duplicateAutomation, saveAutomation, setAutomationActive, setPaused,
  type AutomationInput, type Issue,
} from "@/lib/automations";
import { getToken, listMediaPage } from "@/lib/instagram";
import { toMediaOption, type MediaOption } from "./automacoes/builder-data";
import { resetFailed } from "@/lib/processor";
import { requireSession, SESSION_COOKIE } from "@/lib/session";
import { sweep } from "@/lib/sweep";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error?: string; issues?: Issue[] };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

export async function saveAutomationAction(input: AutomationInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  try {
    const r = await saveAutomation(input);
    if (!r.ok) return { ok: false, issues: r.issues };
    revalidatePath("/painel", "layout");
    return { ok: true, id: r.automation.id };
  } catch (e) { return fail(e); }
}

export async function setAutomationActiveAction(id: string, active: boolean): Promise<ActionResult> {
  await requireSession();
  try {
    const r = await setAutomationActive(id, active);
    if (!r.ok) return { ok: false, issues: r.issues };
    revalidatePath("/painel", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function duplicateAutomationAction(id: string): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  try {
    const copy = await duplicateAutomation(id);
    if (!copy) return { ok: false, error: "Automação não encontrada." };
    revalidatePath("/painel", "layout");
    return { ok: true, id: copy.id };
  } catch (e) { return fail(e); }
}

export async function deleteAutomationAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await deleteAutomation(id);
    revalidatePath("/painel", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setPausedAction(paused: boolean): Promise<ActionResult> {
  await requireSession();
  try {
    await setPaused(paused);
    revalidatePath("/painel", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function runSweepAction(): Promise<ActionResult<{ summary: string }>> {
  await requireSession();
  try {
    const r = await sweep();
    revalidatePath("/painel", "layout");
    const n = (k: keyof typeof r.results) => r.results[k] ?? 0;
    const matched = n("completed") + n("waiting") + n("dry-run") + n("dm-failed") + n("dm-error") + n("reply-error") + n("expired");
    const parts = [`${r.media} posts e ${r.comments} comentários lidos`];
    if (n("paused")) parts.push("automações pausadas, nada processado");
    else if (matched) parts.push(`${matched} com palavra-chave`);
    else parts.push("nenhum comentário novo com palavra-chave");
    if (r.errors.length) parts.push(`${r.errors.length} erro(s)`);
    return { ok: true, summary: parts.join(" · ") };
  } catch (e) { return fail(e); }
}

export async function retryFailedAction(): Promise<ActionResult<{ count: number }>> {
  await requireSession();
  try {
    const count = await resetFailed();
    revalidatePath("/painel", "layout");
    return { ok: true, count };
  } catch (e) { return fail(e); }
}

/** Inscreve a conta no webhook de comentários (mesmo que POST /api/admin/subscribe). */
export async function subscribeWebhookAction(): Promise<ActionResult> {
  await requireSession();
  try {
    const v = process.env.IG_GRAPH_VERSION || "v24.0";
    const url = new URL(`https://graph.instagram.com/${v}/me/subscribed_apps`);
    url.searchParams.set("subscribed_fields", "comments,messages,messaging_postbacks");
    url.searchParams.set("access_token", await getToken());
    const res = await fetch(url, { method: "POST", cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/entrar");
}

/** Página de posts do perfil para o seletor do construtor. */
export async function listMediaAction(after?: string): Promise<ActionResult<{ items: MediaOption[]; next?: string }>> {
  await requireSession();
  try {
    const r = await listMediaPage(24, after);
    return { ok: true, items: r.items.map(toMediaOption), next: r.next };
  } catch (e) { return fail(e); }
}
