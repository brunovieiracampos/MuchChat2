"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { inAccount } from "@/lib/panel";
import { CAPTION_MAX, CAROUSEL_MAX, VIDEO_MAX_BYTES, type ScheduledPost } from "@/lib/posts";
import { cancelPost, removePost, savePost, type PostInput } from "@/lib/scheduling";
import { requireSession } from "@/lib/session";

export type PostActionResult = { ok: true; post: ScheduledPost } | { ok: false; error?: string; issues?: { field: string; message: string }[] };

function fail(e: unknown): PostActionResult {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[publicações]", e);
  if (msg === "Conecte sua conta do Instagram primeiro.") return { ok: false, error: msg };
  return { ok: false, error: "Não foi possível concluir agora. Tente de novo em instantes." };
}

/** Formato aceito do navegador (o resto das regras fica em validatePost). */
const inputSchema = z.object({
  id: z.string().uuid().optional(),
  story: z.boolean(),
  caption: z.string().max(CAPTION_MAX + 200),
  media: z.array(z.object({
    path: z.string().min(1).max(300),
    width: z.number().int().positive().max(20000),
    height: z.number().int().positive().max(20000),
    // O limite por tipo (8 MB imagem, 100 ou 300 MB vídeo) é conferido em validatePost.
    size: z.number().int().positive().max(VIDEO_MAX_BYTES),
    type: z.enum(["image", "video"]).optional(),
    duration: z.number().positive().max(24 * 3600).optional(),
    cover: z.string().min(1).max(300).optional(),
  }).strict()).max(CAROUSEL_MAX),
  scheduledAt: z.number().int().positive().nullable(),
  automation: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("none") }),
    z.object({ mode: z.literal("existing"), id: z.string().max(100) }),
    z.object({ mode: z.literal("new"), keyword: z.string().max(60), link: z.string().max(2000), template: z.string().max(60), name: z.string().max(120).optional() }),
  ]).optional(),
});

/** mode: "draft" salva sem agendar; "schedule" agenda no horário de `input.scheduledAt`; "now" publica em seguida. */
export async function savePostAction(input: PostInput, mode: "draft" | "schedule" | "now"): Promise<PostActionResult> {
  await requireSession();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || !["draft", "schedule", "now"].includes(mode)) return { ok: false, error: "Dados inválidos. Recarregue a página e tente de novo." };
  const data = parsed.data as PostInput;
  try {
    const r = await inAccount(() => savePost(data, mode === "draft" ? null : mode === "now" ? "now" : data.scheduledAt));
    revalidatePath("/painel", "layout");
    return r;
  } catch (e) { return fail(e); }
}

export async function cancelPostAction(id: string): Promise<PostActionResult> {
  await requireSession();
  try {
    const r = await inAccount(() => cancelPost(id));
    revalidatePath("/painel", "layout");
    return r.ok ? r : { ok: false, issues: r.issues };
  } catch (e) { return fail(e); }
}

export async function deletePostAction(id: string): Promise<PostActionResult> {
  await requireSession();
  try {
    const r = await inAccount(() => removePost(id));
    revalidatePath("/painel", "layout");
    return r.ok ? r : { ok: false, issues: r.issues };
  } catch (e) { return fail(e); }
}
