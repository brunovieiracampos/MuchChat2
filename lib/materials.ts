import { currentAccount } from "@/lib/account-context";
import { materialFiles, ownsMaterialFile, validateMaterial, type Material, type MaterialDraft, type MaterialIssue, type MaterialStatus } from "@/lib/material";

/**
 * Materiais do portal (painel; depois, MCP). Roda dentro da conta em uso.
 * Sem "server-only" e sem acesso direto ao armazenamento: quem chama passa `deps`, e os testes também.
 */

export type MaterialInput = MaterialDraft & { id?: string };
export type MaterialDeps = {
  /** Apaga arquivos do armazenamento (só os da conta em uso). */
  deleteFiles(paths: string[]): Promise<void>;
  now(): number;
};
export type MaterialResult = { ok: true; material: Material } | { ok: false; issues: MaterialIssue[] };

const GONE: MaterialResult = { ok: false, issues: [{ field: "title", message: "Este material não existe mais." }] };

export async function listMaterials(): Promise<Material[]> {
  return currentAccount().repo.listMaterials();
}

export async function getMaterial(id: string): Promise<Material | null> {
  return currentAccount().repo.getMaterial(id);
}

/** Arquivo que saiu do material não serve mais para nada. Falha aqui não desfaz o que já foi salvo. */
async function dropFiles(paths: string[], deps: MaterialDeps): Promise<void> {
  if (!paths.length) return;
  try { await deps.deleteFiles(paths); } catch (e) { console.error("[materiais] falha ao apagar arquivos", paths, e); }
}

/** Cria ou atualiza. `status` "published" exige o material completo; "draft" aceita pela metade. */
export async function saveMaterial(input: MaterialInput, status: MaterialStatus, deps: MaterialDeps): Promise<MaterialResult> {
  const { accountId, repo } = currentAccount();
  const draft: MaterialDraft = {
    title: input.title.trim(), slug: input.slug.trim(), description: input.description.trim(), coverPath: input.coverPath || null,
    blocks: input.blocks, visibility: input.visibility, ctaPost: input.ctaPost.trim(), ctaKeyword: input.ctaKeyword.trim(),
  };
  const existing = input.id ? await repo.getMaterial(input.id) : null;
  if (input.id && !existing) return GONE;

  const issues = validateMaterial(draft, { publish: status === "published" });
  const files = materialFiles(draft);
  if (files.some((p) => !ownsMaterialFile(accountId, p))) issues.push({ field: "blocks", message: "Um dos arquivos não pertence a esta conta. Envie de novo." });
  if ((await repo.listMaterials()).some((m) => m.slug === draft.slug && m.id !== existing?.id)) {
    issues.push({ field: "slug", message: "Já existe um material com esse endereço. Escolha outro." });
  }
  if (issues.length) return { ok: false, issues };

  const publishedAt = existing?.publishedAt ?? (status === "published" ? deps.now() : null);
  const material = existing
    ? await repo.updateMaterial(existing.id, { ...draft, status, publishedAt })
    : await repo.createMaterial({ ...draft, status, publishedAt });
  if (!material) return GONE;

  if (existing) await dropFiles(materialFiles(existing).filter((p) => !files.includes(p)), deps);
  return { ok: true, material };
}

/** Publica ou volta para rascunho, sem mexer no conteúdo. */
export async function setMaterialStatus(id: string, status: MaterialStatus, deps: MaterialDeps): Promise<MaterialResult> {
  const { repo } = currentAccount();
  const existing = await repo.getMaterial(id);
  if (!existing) return GONE;
  if (status === "published") {
    const issues = validateMaterial(existing, { publish: true });
    if (issues.length) return { ok: false, issues };
  }
  const material = await repo.updateMaterial(id, { status, publishedAt: existing.publishedAt ?? (status === "published" ? deps.now() : null) });
  return material ? { ok: true, material } : GONE;
}

export async function removeMaterial(id: string, deps: MaterialDeps): Promise<MaterialResult> {
  const { repo } = currentAccount();
  const existing = await repo.getMaterial(id);
  if (!existing) return GONE;
  await repo.deleteMaterial(id);
  await dropFiles(materialFiles(existing), deps);
  return { ok: true, material: existing };
}
