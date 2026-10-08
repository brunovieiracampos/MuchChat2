"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentAccount } from "@/lib/account-context";
import { BLOCK_TEXT_MAX, FILE_MAX_BYTES, LINKS_MAX, MAX_BLOCKS, type Material, type MaterialIssue, type MaterialStatus } from "@/lib/material";
import { removeMaterial, saveMaterial, setMaterialStatus, type MaterialDeps, type MaterialInput, type MaterialResult } from "@/lib/materials";
import { deleteMaterialFiles } from "@/lib/media-store";
import { inAccount } from "@/lib/panel";
import { requireSession } from "@/lib/session";

export type MaterialActionResult = { ok: true; material: Material } | { ok: false; error?: string; issues?: MaterialIssue[] };

const deps = (): MaterialDeps => ({
  deleteFiles: (paths) => deleteMaterialFiles(currentAccount().accountId, paths),
  now: Date.now,
});

function fail(e: unknown): MaterialActionResult {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[materiais]", e);
  if (msg === "Conecte sua conta do Instagram primeiro.") return { ok: false, error: msg };
  return { ok: false, error: "Não foi possível concluir agora. Tente de novo em instantes." };
}

/** Formato aceito do navegador, com folga nos tamanhos (as mensagens de limite vêm de validateMaterial). */
const blockId = z.string().min(1).max(20);
const blockSchema = z.discriminatedUnion("type", [
  z.object({ id: blockId, type: z.literal("text"), markdown: z.string().max(BLOCK_TEXT_MAX + 200) }).strict(),
  z.object({ id: blockId, type: z.literal("prompt"), label: z.string().max(200), text: z.string().max(BLOCK_TEXT_MAX + 200) }).strict(),
  z.object({
    id: blockId, type: z.literal("file"), path: z.string().max(300), name: z.string().max(200),
    size: z.number().int().nonnegative().max(FILE_MAX_BYTES + 1), description: z.string().max(400),
  }).strict(),
  z.object({
    id: blockId, type: z.literal("links"),
    items: z.array(z.object({ title: z.string().max(200), description: z.string().max(400), url: z.string().max(2000) }).strict()).max(LINKS_MAX + 10),
  }).strict(),
  z.object({
    id: blockId, type: z.literal("image"), path: z.string().max(300),
    width: z.number().int().nonnegative().max(20000), height: z.number().int().nonnegative().max(20000),
    alt: z.string().max(300), caption: z.string().max(300),
  }).strict(),
]);

const inputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(300),
  slug: z.string().max(200),
  description: z.string().max(600),
  coverPath: z.string().max(300).nullable(),
  blocks: z.array(blockSchema).max(MAX_BLOCKS + 10),
  visibility: z.enum(["public", "exclusive"]),
  ctaPost: z.string().max(2000),
  ctaKeyword: z.string().max(200),
}).strict();

const statusSchema = z.enum(["draft", "published"]);
const idSchema = z.string().uuid();
const BAD: MaterialActionResult = { ok: false, error: "Dados inválidos. Recarregue a página e tente de novo." };

async function run(fn: () => Promise<MaterialResult>): Promise<MaterialActionResult> {
  await requireSession();
  try {
    const r = await inAccount(fn);
    // O portal público também muda: a página do material e a biblioteca são dinâmicas, mas o painel guarda cache por rota.
    revalidatePath("/painel", "layout");
    return r.ok ? r : { ok: false, issues: r.issues };
  } catch (e) { return fail(e); }
}

export async function saveMaterialAction(input: MaterialInput, status: MaterialStatus): Promise<MaterialActionResult> {
  const parsed = inputSchema.safeParse(input);
  const st = statusSchema.safeParse(status);
  if (!parsed.success || !st.success) { await requireSession(); return BAD; }
  return run(() => saveMaterial(parsed.data, st.data, deps()));
}

export async function setMaterialStatusAction(id: string, status: MaterialStatus): Promise<MaterialActionResult> {
  const st = statusSchema.safeParse(status);
  if (!idSchema.safeParse(id).success || !st.success) { await requireSession(); return BAD; }
  return run(() => setMaterialStatus(id, st.data, deps()));
}

export async function deleteMaterialAction(id: string): Promise<MaterialActionResult> {
  if (!idSchema.safeParse(id).success) { await requireSession(); return BAD; }
  return run(() => removeMaterial(id, deps()));
}
