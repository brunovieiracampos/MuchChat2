import { describe, expect, it, vi } from "vitest";
import { currentAccount } from "@/lib/account-context";
import type { Block } from "@/lib/material";
import { getMaterial, listMaterials, removeMaterial, saveMaterial, setMaterialStatus, type MaterialDeps, type MaterialInput } from "@/lib/materials";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const deps = () => ({ deleteFiles: vi.fn(async (_paths: string[]) => {}), now: () => NOW }) satisfies MaterialDeps;

const text: Block = { id: "t1", type: "text", markdown: "Olá" };
const file = (path: string): Block => ({ id: "f1", type: "file", path, name: "guia.pdf", size: 1000, description: "" });
const input = (over: Partial<MaterialInput> = {}): MaterialInput => ({
  title: "Prompts do contador", slug: "prompts-do-contador", description: "", coverPath: null,
  blocks: [text], visibility: "public", ctaPost: "", ctaKeyword: "", ...over,
});

async function saved(over: Partial<MaterialInput> = {}, status: "draft" | "published" = "draft") {
  const r = await saveMaterial(input(over), status, deps());
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join("; "));
  return r.material;
}

describe("salvar material", () => {
  it("cria como rascunho, sem data de publicação", async () => {
    const m = await saved({ title: "  Prompts do contador  " });
    expect(m).toMatchObject({ title: "Prompts do contador", slug: "prompts-do-contador", status: "draft", publishedAt: null });
    expect(await listMaterials()).toHaveLength(1);
  });

  it("publica e guarda a primeira data de publicação", async () => {
    const m = await saved({}, "published");
    expect(m).toMatchObject({ status: "published", publishedAt: NOW });
    const later = await saveMaterial({ ...input({ title: "Novo título" }), id: m.id }, "published", { ...deps(), now: () => NOW + 5000 });
    expect(later.ok && later.material).toMatchObject({ title: "Novo título", publishedAt: NOW });
  });

  it("não publica material sem bloco, e nada é gravado", async () => {
    const r = await saveMaterial(input({ blocks: [] }), "published", deps());
    expect(r.ok).toBe(false);
    expect(await listMaterials()).toEqual([]);
  });

  it("recusa endereço repetido na conta, mas deixa o material manter o próprio", async () => {
    const a = await saved();
    const dup = await saveMaterial(input({ title: "Outro" }), "draft", deps());
    expect(dup).toEqual({ ok: false, issues: [{ field: "slug", message: "Já existe um material com esse endereço. Escolha outro." }] });
    const same = await saveMaterial({ ...input({ title: "Mesmo, editado" }), id: a.id }, "draft", deps());
    expect(same.ok).toBe(true);
    expect(await listMaterials()).toHaveLength(1);
  });

  it("recusa arquivo de outra conta, no bloco ou na capa, sem gravar nem apagar", async () => {
    const d = deps();
    for (const over of [{ blocks: [file("materials/outra-conta/guia.pdf")] }, { coverPath: "materials/outra-conta/capa.jpg" }, { coverPath: "posts/acc-test/x.jpg" }]) {
      const r = await saveMaterial(input(over), "draft", d);
      expect(r.ok).toBe(false);
    }
    expect(await listMaterials()).toEqual([]);
    expect(d.deleteFiles).not.toHaveBeenCalled();
  });

  it("editar um material que não existe mais devolve erro", async () => {
    const r = await saveMaterial({ ...input(), id: "sumiu" }, "draft", deps());
    expect(r).toEqual({ ok: false, issues: [{ field: "title", message: "Este material não existe mais." }] });
  });

  it("apaga do armazenamento os arquivos que saíram do material", async () => {
    const m = await saved({ coverPath: "materials/acc-test/capa.jpg", blocks: [file("materials/acc-test/v1.pdf")] });
    const d = deps();
    await saveMaterial({ ...input({ coverPath: "materials/acc-test/capa.jpg", blocks: [file("materials/acc-test/v2.pdf")] }), id: m.id }, "draft", d);
    expect(d.deleteFiles).toHaveBeenCalledWith(["materials/acc-test/v1.pdf"]);
  });

  it("falha ao apagar arquivo antigo não desfaz o salvamento", async () => {
    const m = await saved({ blocks: [file("materials/acc-test/v1.pdf")] });
    const d = { ...deps(), deleteFiles: vi.fn(async () => { throw new Error("blob fora do ar"); }) };
    const r = await saveMaterial({ ...input({ blocks: [text] }), id: m.id }, "draft", d);
    expect(r.ok).toBe(true);
    expect((await getMaterial(m.id))?.blocks).toEqual([text]);
  });
});

describe("publicar, despublicar e excluir", () => {
  it("publicar pela lista valida o conteúdo", async () => {
    const empty = await saved({ blocks: [] });
    expect((await setMaterialStatus(empty.id, "published", deps())).ok).toBe(false);
    expect((await getMaterial(empty.id))?.status).toBe("draft");
  });

  it("despublicar mantém a data da primeira publicação", async () => {
    const m = await saved({}, "published");
    const r = await setMaterialStatus(m.id, "draft", deps());
    expect(r.ok && r.material).toMatchObject({ status: "draft", publishedAt: NOW });
  });

  it("excluir apaga o material e os arquivos dele", async () => {
    const m = await saved({ coverPath: "materials/acc-test/capa.jpg", blocks: [file("materials/acc-test/guia.pdf")] });
    const d = deps();
    expect((await removeMaterial(m.id, d)).ok).toBe(true);
    expect(await listMaterials()).toEqual([]);
    expect(d.deleteFiles).toHaveBeenCalledWith(["materials/acc-test/capa.jpg", "materials/acc-test/guia.pdf"]);
  });

  it("excluir ou publicar o que não existe devolve erro", async () => {
    expect((await removeMaterial("sumiu", deps())).ok).toBe(false);
    expect((await setMaterialStatus("sumiu", "published", deps())).ok).toBe(false);
  });

  it("a conta em uso é a de teste", () => {
    expect(currentAccount().accountId).toBe("acc-test");
  });
});
