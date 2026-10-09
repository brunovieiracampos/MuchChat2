import { describe, expect, it } from "vitest";
import {
  BLOCK_TEXT_MAX, FILE_MAX_BYTES, MATERIAL_IMAGE_MAX_BYTES, MAX_BLOCKS,
  blankBlock, blockFiles, canOpen, downloadTarget, formatBytes, isPortalUsername, materialFiles, ownsMaterialFile,
  portalView, slugify, uploadRule, validateMaterial,
  blockSummary, coverLetters, dateLabel, materialCard, numberLabel, promptPieces,
  type Block, type Material, type MaterialDraft,
} from "@/lib/material";

const text = (markdown = "Olá"): Block => ({ id: "t1", type: "text", markdown });
const file = (path = "materials/acc-test/guia.pdf"): Block => ({ id: "f1", type: "file", path, name: "guia.pdf", size: 1000, description: "" });
const image = (path = "materials/acc-test/capa.jpg"): Block => ({ id: "i1", type: "image", path, width: 800, height: 600, alt: "", caption: "" });

const draft = (over: Partial<MaterialDraft> = {}): MaterialDraft => ({
  title: "Prompts do contador", slug: "prompts-do-contador", description: "", coverPath: null,
  blocks: [text()], visibility: "public", ctaPost: "", ctaKeyword: "", ...over,
});
const material = (over: Partial<Material> = {}): Material => ({
  ...draft(), id: "m1", number: 1, status: "published", publishedAt: 1, createdAt: 1, updatedAt: 1, ...over,
});
const messages = (d: MaterialDraft, publish = true) => validateMaterial(d, { publish }).map((i) => i.message);

describe("endereço do material", () => {
  it("vira minúsculo, sem acento e com hífen", () => {
    expect(slugify("Prompts do Contador")).toBe("prompts-do-contador");
    expect(slugify("  Automação: 3 passos!  ")).toBe("automacao-3-passos");
    expect(slugify("---")).toBe("");
  });

  it("corta em 80 caracteres sem deixar hífen no fim", () => {
    const s = slugify(`${"a".repeat(79)} b c`);
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("-")).toBe(false);
  });

  it("endereço digitado com maiúscula, acento ou espaço é recusado", () => {
    for (const slug of ["Prompts", "prompts do contador", "automação", "-inicio", "fim-", "a--b", ""]) {
      expect(validateMaterial(draft({ slug }), { publish: false }).some((i) => i.field === "slug")).toBe(true);
    }
    expect(validateMaterial(draft({ slug: "guia-2026" }), { publish: false })).toEqual([]);
  });
});

describe("validação do material", () => {
  it("rascunho precisa só de título e endereço válidos", () => {
    expect(messages(draft({ blocks: [] }), false)).toEqual([]);
    expect(messages(draft({ title: "  " }), false)).toEqual(["Dê um título ao material."]);
  });

  it("publicar exige pelo menos um bloco", () => {
    expect(messages(draft({ blocks: [] }))).toEqual(["Adicione pelo menos um bloco antes de publicar."]);
  });

  it("publicar recusa bloco vazio, apontando o bloco", () => {
    const issues = validateMaterial(draft({ blocks: [text("   "), blankBlock("prompt"), blankBlock("file"), blankBlock("links"), blankBlock("image")] }), { publish: true });
    expect(issues).toHaveLength(5);
    expect(issues.every((i) => i.field === "blocks" && !!i.blockId)).toBe(true);
  });

  it("capa e bloco de imagem precisam ser .jpg", () => {
    expect(messages(draft({ coverPath: "materials/acc-test/guia.pdf" }), false)).toEqual(["A capa precisa ser uma imagem."]);
    expect(messages(draft({ coverPath: "materials/acc-test/capa.jpg" }), false)).toEqual([]);
    expect(messages(draft({ blocks: [image("materials/acc-test/guia.pdf")] }), false)).toEqual(["Envie uma imagem neste bloco."]);
    expect(messages(draft({ blocks: [image()] }))).toEqual([]);
  });

  it("rascunho aceita bloco vazio", () => {
    expect(messages(draft({ blocks: [blankBlock("prompt"), blankBlock("file")] }), false)).toEqual([]);
  });

  it("limita quantidade de blocos e tamanho do texto, mesmo em rascunho", () => {
    const many = Array.from({ length: MAX_BLOCKS + 1 }, (_, i): Block => ({ id: `b${i}`, type: "text", markdown: "x" }));
    expect(messages(draft({ blocks: many }), false)).toEqual([`Um material pode ter até ${MAX_BLOCKS} blocos.`]);
    expect(messages(draft({ blocks: [text("x".repeat(BLOCK_TEXT_MAX + 1))] }), false)).toHaveLength(1);
  });

  it("link da lista e post da chamada precisam ser http ou https", () => {
    const links: Block = { id: "l1", type: "links", items: [{ title: "Ferramenta", description: "", url: "javascript:alert(1)" }] };
    expect(messages(draft({ blocks: [links] }), false)).toHaveLength(1);
    expect(validateMaterial(draft({ ctaPost: "instagram.com/p/abc" }), { publish: false })[0].field).toBe("cta");
    expect(messages(draft({ ctaPost: "https://www.instagram.com/p/abc/" }), false)).toEqual([]);
  });

  it("recusa arquivo acima do limite e bloco com id repetido", () => {
    const big: Block = { ...(file() as Extract<Block, { type: "file" }>), size: FILE_MAX_BYTES + 1 };
    expect(messages(draft({ blocks: [big] }), false)).toHaveLength(1);
    expect(messages(draft({ blocks: [text(), text()] }), false)).toEqual(["Há blocos repetidos. Recarregue a página e tente de novo."]);
  });
});

describe("arquivos do material", () => {
  it("lista os caminhos dos blocos e da capa, sem os vazios", () => {
    expect(blockFiles([text(), file(), image(), blankBlock("file")])).toEqual(["materials/acc-test/guia.pdf", "materials/acc-test/capa.jpg"]);
    expect(materialFiles({ coverPath: "materials/acc-test/c.jpg", blocks: [file()] })).toEqual(["materials/acc-test/c.jpg", "materials/acc-test/guia.pdf"]);
  });

  it("só reconhece arquivos dentro da pasta da própria conta", () => {
    expect(ownsMaterialFile("acc-1", "materials/acc-1/a.pdf")).toBe(true);
    expect(ownsMaterialFile("acc-1", "materials/acc-2/a.pdf")).toBe(false);
    expect(ownsMaterialFile("acc-1", "materials/acc-1/../acc-2/a.pdf")).toBe(false);
    expect(ownsMaterialFile("acc-1", "posts/acc-1/a.jpg")).toBe(false);
    expect(ownsMaterialFile("acc-1", "materials/acc-1/uuid/guia-de-prompts.pdf")).toBe(true);
    expect(uploadRule("materials/acc-1/uuid/guia-de-prompts.pdf")).toEqual({ contentType: "application/pdf", maxBytes: FILE_MAX_BYTES });
  });

  it("define tipo e limite de envio pela extensão", () => {
    expect(uploadRule("materials/a/x.jpg")).toEqual({ contentType: "image/jpeg", maxBytes: MATERIAL_IMAGE_MAX_BYTES });
    expect(uploadRule("materials/a/Guia.PDF")).toEqual({ contentType: "application/pdf", maxBytes: FILE_MAX_BYTES });
    expect(uploadRule("materials/a/virus.exe")).toBeNull();
    expect(uploadRule("materials/a/pagina.html")).toBeNull();
    expect(uploadRule("materials/a/sem-extensao")).toBeNull();
  });

  it("mostra o tamanho de forma legível", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });
});

describe("acesso no portal", () => {
  it("público publicado abre; rascunho nunca; exclusivo só desbloqueado", () => {
    expect(canOpen(material())).toBe(true);
    expect(canOpen(material({ status: "draft" }))).toBe(false);
    expect(canOpen(material({ visibility: "exclusive" }))).toBe(false);
    expect(canOpen(material({ visibility: "exclusive" }), ["m1"])).toBe(true);
    expect(canOpen(material({ status: "draft", visibility: "exclusive" }), ["m1"])).toBe(false);
  });

  it("a visão trancada não carrega os blocos", () => {
    const v = portalView(material({ visibility: "exclusive", ctaKeyword: "CONTADOR", blocks: [text("segredo"), file()] }));
    expect(v).toEqual({
      locked: true, number: 1, slug: "prompts-do-contador", title: "Prompts do contador", description: "", coverPath: null, ctaPost: "", ctaKeyword: "CONTADOR",
      summary: [{ n: 1, label: "PDF" }],
    });
    expect(JSON.stringify(v)).not.toContain("segredo");
    expect(JSON.stringify(v)).not.toContain("guia.pdf");
  });

  it("rascunho não tem visão; público entrega o material", () => {
    expect(portalView(material({ status: "draft" }))).toBeNull();
    const v = portalView(material());
    expect(v && !v.locked && v.material.id).toBe("m1");
  });

  it("download só de bloco de arquivo, em material que a pessoa pode abrir", () => {
    const m = material({ blocks: [text(), file(), image(), blankBlock("file")] });
    expect(downloadTarget(m, "f1")).toEqual({ path: "materials/acc-test/guia.pdf", name: "guia.pdf" });
    expect(downloadTarget(m, "t1")).toBeNull();
    expect(downloadTarget(m, "i1")).toBeNull();
    expect(downloadTarget(m, "nao-existe")).toBeNull();
    expect(downloadTarget({ ...m, visibility: "exclusive" }, "f1")).toBeNull();
    expect(downloadTarget({ ...m, status: "draft" }, "f1")).toBeNull();
  });

  it("nome de conta do endereço: só o formato do Instagram", () => {
    expect(isPortalUsername("d.ia.riamente")).toBe(true);
    expect(isPortalUsername("nome_123")).toBe(true);
    for (const bad of ["", "Nome", "a b", "a%b", "a/b", "x".repeat(31)]) expect(isPortalUsername(bad)).toBe(false);
  });
});

describe("o que o portal mostra de um material", () => {
  it("resume o conteúdo contando prompts, arquivos por tipo e links", () => {
    const blocks: Block[] = [
      text(),
      { id: "p1", type: "prompt", label: "", text: "um" },
      { id: "p2", type: "prompt", label: "", text: "dois" },
      { id: "p3", type: "prompt", label: "", text: "   " },
      file("materials/acc-test/x/guia.pdf"),
      { id: "f2", type: "file", path: "materials/acc-test/y/custos.xlsx", name: "custos.xlsx", size: 1, description: "" },
      { id: "f3", type: "file", path: "materials/acc-test/z/dados.csv", name: "dados.csv", size: 1, description: "" },
      blankBlock("file"),
      { id: "l1", type: "links", items: [{ title: "A", description: "", url: "https://a.com" }, { title: "", description: "", url: "https://b.com" }, { title: "C", description: "", url: "javascript:x" }] },
      { id: "l2", type: "links", items: [{ title: "D", description: "", url: "https://d.com" }] },
      image(),
    ];
    expect(blockSummary(blocks)).toEqual([{ n: 2, label: "prompts" }, { n: 1, label: "PDF" }, { n: 2, label: "planilhas" }, { n: 2, label: "links" }]);
  });

  it("singular quando há um só, e nada quando o material é só texto", () => {
    expect(blockSummary([{ id: "p1", type: "prompt", label: "", text: "um" }, { id: "l1", type: "links", items: [{ title: "A", description: "", url: "https://a.com" }] }]))
      .toEqual([{ n: 1, label: "prompt" }, { n: 1, label: "link" }]);
    expect(blockSummary([text(), image()])).toEqual([]);
  });

  it("data e número no formato do portal", () => {
    expect(dateLabel(Date.parse("2026-10-08T15:00:00Z"))).toBe("08 out 2026");
    // 01:30 UTC ainda é o dia anterior em Brasília.
    expect(dateLabel(Date.parse("2026-01-01T01:30:00Z"))).toBe("31 dez 2025");
    expect(numberLabel(7)).toBe("Nº 07");
    expect(numberLabel(140)).toBe("Nº 140");
  });

  it("letras da capa sem imagem vêm da primeira palavra do título", () => {
    expect(coverLetters("Guia: revisar contrato")).toEqual(["G", "u"]);
    expect(coverLetters("  3 prompts para e-mail")).toEqual(["3", ""]);
    expect(coverLetters("É simples")).toEqual(["É", ""]);
    expect(coverLetters("")).toEqual(["·", ""]);
  });

  it("separa as variáveis [ENTRE COLCHETES] de uma linha de prompt", () => {
    expect(promptPieces("em: [LISTA DE CATEGORIAS].")).toEqual([
      { text: "em: ", variable: false }, { text: "[LISTA DE CATEGORIAS]", variable: true }, { text: ".", variable: false },
    ]);
    expect(promptPieces("[A1] e [B2]")).toEqual([{ text: "[A1]", variable: true }, { text: " e ", variable: false }, { text: "[B2]", variable: true }]);
    expect(promptPieces("sem variável, [] vazio e [x] curto")).toEqual([{ text: "sem variável, [] vazio e [x] curto", variable: false }]);
    expect(promptPieces("")).toEqual([]);
  });

  it("o cartão da biblioteca leva o resumo, nunca os blocos", () => {
    const card = materialCard(material({ visibility: "exclusive", ctaKeyword: "ATA", blocks: [{ id: "p1", type: "prompt", label: "", text: "SEGREDO do prompt" }, file()] }));
    expect(card.summary).toEqual([{ n: 1, label: "prompt" }, { n: 1, label: "PDF" }]);
    expect(card).not.toHaveProperty("blocks");
    expect(JSON.stringify(card)).not.toContain("SEGREDO");
    expect(JSON.stringify(card)).not.toContain("guia.pdf");
  });
});
