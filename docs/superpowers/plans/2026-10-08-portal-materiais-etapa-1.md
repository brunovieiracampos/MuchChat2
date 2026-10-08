# Portal de materiais, etapa 1 (CMS e portal): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o módulo Materiais no painel (CMS em blocos) e as páginas públicas do portal (biblioteca e página do material), para os links das automações deixarem de apontar para o Notion.

**Architecture:** Tudo no mesmo app Next.js. As regras ficam em módulos puros e testáveis (`lib/material.ts`, `lib/markdown.ts`, `lib/materials.ts`); o acesso ao banco entra pelo `AccountRepo` que já existe, com leitura por RLS e escrita pelo servidor. As páginas públicas (`/m/...`) são renderizadas no servidor com a chave de serviço e só enxergam materiais publicados da conta do endereço.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres + RLS), Vercel Blob privado, zod 4, vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-08-portal-materiais-design.md`. Este plano cobre só a etapa 1 da seção "Entrega em três etapas". Link pessoal, rastreamento, `materialId` na automação e MCP ficam para os planos das etapas 2 e 3.

## Global Constraints

- **Next.js 16 não é o que você conhece.** Antes de escrever rota, layout ou página, leia o guia correspondente em `node_modules/next/dist/docs/01-app/`. Neste repositório `params` e `searchParams` são `Promise` e o arquivo de proxy é `proxy.ts`.
- Textos de interface em português do Brasil, com acentuação correta, no tom das telas existentes.
- Limites (da spec): até 40 blocos por material; texto de até 20.000 caracteres por bloco; arquivo de até 25 MB; imagem de até 8 MB.
- Tipos de bloco: `text`, `prompt`, `file`, `links`, `image`. Nenhum outro.
- Markdown do bloco de Texto nunca aceita HTML cru; links só `http` e `https`.
- Arquivos no Blob privado em `materials/{accountId}/`. Nunca expor o endereço direto: sempre link assinado.
- O usuário logado só lê `materials` (política `owns_account`); gravações passam pelo servidor com a chave de serviço, sempre filtrando por `account_id`. `anon` não tem acesso.
- Visitantes nunca consultam o banco: as páginas do portal usam `lib/portal.ts`, que só devolve materiais `published`.
- Material exclusivo nunca entrega blocos nem arquivos nesta etapa (o desbloqueio vem na etapa 2).
- Sem dependências novas no `package.json`.
- Módulos com `import "server-only"` não são importados pelos testes. Lógica testável fica em módulo sem esse import e recebe dependências por parâmetro (padrão de `lib/publisher.ts`).
- Rodar tudo no ambiente local (`npm run dev:db`, `DRY_RUN=true`). **Não** aplicar migração em produção, **não** fazer push e **não** rodar `vercel deploy`: o push no `main` publica em produção e precisa da confirmação do Bruno.
- Commits em português, no estilo do histórico (`git log --oneline`), terminando com a linha `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Trabalhar na branch `portal-materiais`.

## Review Focus

1. **Endereço digitado à mão com acento, maiúscula ou espaço** ("Prompts do Contador"): a pessoa espera que vire `prompts-do-contador` enquanto digita o título, e que um endereço inválido digitado direto seja recusado com mensagem clara, não gravado. Teste na Task 1.
2. **Markdown com HTML ou link `javascript:`** colado do Notion ou de má-fé: deve aparecer como texto inerte na página pública. Teste na Task 2.
3. **Dois materiais com o mesmo endereço na mesma conta**: o segundo salvar é recusado; o mesmo endereço em contas diferentes é permitido. Testes nas Tasks 3 e 7.
4. **Material exclusivo ou em rascunho acessado pelo endereço direto, ou pelo endereço de download**: não entrega blocos nem arquivo. Teste na Task 1 (`portalView`, `downloadTarget`).
5. **Requisição adulterada com caminho de arquivo de outra conta** num bloco ou na capa: salvar é recusado e nada é apagado. Teste na Task 3.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/material.ts` (novo) | Tipos, limites, validação, endereço, regras de acesso. Puro, roda no navegador |
| `lib/markdown.ts` (novo) | Markdown simples → HTML seguro. Puro |
| `lib/materials.ts` (novo) | Salvar, publicar e excluir material dentro da conta em uso. Sem `server-only` |
| `lib/account-context.ts` | `AccountRepo` e `MemoryRepo` ganham os métodos de material |
| `lib/accounts.ts` | `SupabaseRepo` ganha os métodos; `toMaterial` exportado |
| `lib/media-store.ts` | Links assinados e exclusão para `materials/{accountId}/` |
| `lib/panel.ts` | `getMaterials` |
| `lib/portal.ts` (novo) | Leitura pública por nome de usuário. `server-only` |
| `supabase/migrations/20261008000000_materials.sql` (novo) | Tabela `materials` |
| `app/api/uploads/route.ts` | Aceita envio para `materials/{accountId}/` |
| `app/_portal/blocks.tsx`, `copy-button.tsx`, `portal.css` (novos) | Renderização dos blocos, usada no portal e na pré-visualização do editor |
| `app/painel/materiais/*` (novo) | Lista, editor, ações |
| `app/painel/_components/to-jpeg.ts` (novo) | `toJpeg`, extraído do editor de publicações para ser reusado |
| `app/painel/_components/shell.tsx`, `icons.ts` | Item "Materiais" no menu |
| `app/(portal)/*` (novo) | Layout, biblioteca, página do material, download |
| `scripts/seed-dev.mjs` | Copia `materials` para o ambiente local |
| `tests/material.test.ts`, `markdown.test.ts`, `materials.test.ts` (novos), `tests/isolation.test.ts` | Testes |

---

### Task 1: Regras do material (`lib/material.ts`)

**Files:**
- Create: `lib/material.ts`
- Test: `tests/material.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (usado por todas as tasks seguintes):
  - Tipos `Block`, `BlockType`, `TextBlock`, `PromptBlock`, `FileBlock`, `LinksBlock`, `LinkItem`, `ImageBlock`, `Material`, `MaterialDraft`, `MaterialVisibility`, `MaterialStatus`, `MaterialIssue`, `PortalView`.
  - Constantes `MAX_BLOCKS`, `BLOCK_TEXT_MAX`, `TITLE_MAX`, `DESCRIPTION_MAX`, `SLUG_MAX`, `LINKS_MAX`, `CTA_KEYWORD_MAX`, `FILE_MAX_BYTES`, `MATERIAL_IMAGE_MAX_BYTES`, `FILE_TYPES`, `BLOCK_META`, `SLUG_RE`.
  - Funções `newBlockId()`, `blankBlock(type)`, `slugify(s)`, `isHttpUrl(u)`, `fileExt(name)`, `formatBytes(n)`, `materialPrefix(accountId)`, `ownsMaterialFile(accountId, path)`, `uploadRule(pathname)`, `blockFiles(blocks)`, `materialFiles(m)`, `validateMaterial(draft, { publish })`, `canOpen(m, unlocked?)`, `portalView(m, unlocked?)`, `downloadTarget(m, blockId, unlocked?)`, `isPortalUsername(s)`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/material.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BLOCK_TEXT_MAX, FILE_MAX_BYTES, MATERIAL_IMAGE_MAX_BYTES, MAX_BLOCKS,
  blankBlock, blockFiles, canOpen, downloadTarget, formatBytes, isPortalUsername, materialFiles, ownsMaterialFile,
  portalView, slugify, uploadRule, validateMaterial,
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
  ...draft(), id: "m1", status: "published", publishedAt: 1, createdAt: 1, updatedAt: 1, ...over,
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
    expect(v).toEqual({ locked: true, title: "Prompts do contador", description: "", coverPath: null, ctaPost: "", ctaKeyword: "CONTADOR" });
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/material.test.ts`
Expected: FAIL, com erro de importação de `@/lib/material` (arquivo não existe).

- [ ] **Step 3: Implementar**

Crie `lib/material.ts`:

```ts
/**
 * Materiais do portal: tipos e regras. Sem dependências de servidor: roda também no navegador (editor).
 * Um material é uma página montada em blocos, pública ou exclusiva de quem recebeu o link.
 */

export type TextBlock = { id: string; type: "text"; markdown: string };
export type PromptBlock = { id: string; type: "prompt"; label: string; text: string };
export type FileBlock = { id: string; type: "file"; path: string; name: string; size: number; description: string };
export type LinkItem = { title: string; description: string; url: string };
export type LinksBlock = { id: string; type: "links"; items: LinkItem[] };
export type ImageBlock = { id: string; type: "image"; path: string; width: number; height: number; alt: string; caption: string };
export type Block = TextBlock | PromptBlock | FileBlock | LinksBlock | ImageBlock;
export type BlockType = Block["type"];

export type MaterialVisibility = "public" | "exclusive";
export type MaterialStatus = "draft" | "published";

export type Material = {
  id: string;
  /** Endereço do material dentro do portal da conta: /m/{conta}/{slug}. */
  slug: string;
  title: string;
  description: string;
  /** Capa no armazenamento privado (JPEG). */
  coverPath: string | null;
  blocks: Block[];
  visibility: MaterialVisibility;
  status: MaterialStatus;
  /** Chamada do material trancado: post e palavra que a pessoa comenta para receber. Vazios = sem chamada. */
  ctaPost: string;
  ctaKeyword: string;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

/** O que o editor preenche. */
export type MaterialDraft = Pick<Material, "title" | "slug" | "description" | "coverPath" | "blocks" | "visibility" | "ctaPost" | "ctaKeyword">;

export const MAX_BLOCKS = 40;
export const BLOCK_TEXT_MAX = 20_000;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 300;
export const SLUG_MAX = 80;
export const LINKS_MAX = 30;
export const CTA_KEYWORD_MAX = 60;
export const FILE_MAX_BYTES = 25 * 1024 * 1024;
export const MATERIAL_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** Arquivos aceitos no bloco Arquivo: extensão → tipo. Página HTML e executável ficam de fora. */
export const FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const BLOCK_META: Record<BlockType, { label: string; help: string }> = {
  text: { label: "Texto", help: "Parágrafos, títulos e listas, com Markdown simples" },
  prompt: { label: "Prompt", help: "Texto para copiar, com botão de copiar" },
  file: { label: "Arquivo", help: "PDF, planilha ou outro arquivo para baixar" },
  links: { label: "Lista de links", help: "Ferramentas e referências, cada uma com título e endereço" },
  image: { label: "Imagem", help: "Imagem com legenda opcional" },
};

export function newBlockId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function blankBlock(type: BlockType): Block {
  const id = newBlockId();
  if (type === "text") return { id, type, markdown: "" };
  if (type === "prompt") return { id, type, label: "", text: "" };
  if (type === "file") return { id, type, path: "", name: "", size: 0, description: "" };
  if (type === "links") return { id, type, items: [{ title: "", description: "", url: "" }] };
  return { id, type, path: "", width: 0, height: 0, alt: "", caption: "" };
}

/* ---------- endereço ---------- */

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Prompts do Contador" → "prompts-do-contador". */
export function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, SLUG_MAX).replace(/-+$/, "");
}

/** Nome de usuário do Instagram, como aparece no endereço do portal. */
export const isPortalUsername = (s: string) => /^[a-z0-9._]{1,30}$/.test(s);

export const isHttpUrl = (u: string) => /^https?:\/\/\S+$/i.test(u);

/* ---------- arquivos ---------- */

export const fileExt = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const unit = n < 1024 * 1024 ? "KB" : "MB";
  const v = n / (unit === "KB" ? 1024 : 1024 * 1024);
  return `${(Math.round(v * 10) / 10).toLocaleString("pt-BR")} ${unit}`;
}

/** Cada conta só grava e lê dentro de materials/{accountId}/. */
export const materialPrefix = (accountId: string) => `materials/${accountId}/`;
export const ownsMaterialFile = (accountId: string, path: string) => path.startsWith(materialPrefix(accountId)) && !path.includes("..");

/** Tipo e limite de um envio, pela extensão: .jpg é imagem (capa ou bloco); o resto, só os tipos de FILE_TYPES. */
export function uploadRule(pathname: string): { contentType: string; maxBytes: number } | null {
  const ext = fileExt(pathname);
  if (ext === "jpg") return { contentType: "image/jpeg", maxBytes: MATERIAL_IMAGE_MAX_BYTES };
  const contentType = FILE_TYPES[ext];
  return contentType ? { contentType, maxBytes: FILE_MAX_BYTES } : null;
}

/** Caminhos no armazenamento usados pelos blocos (arquivo e imagem), sem os ainda vazios. */
export function blockFiles(blocks: Block[]): string[] {
  return blocks.flatMap((b) => ((b.type === "file" || b.type === "image") && b.path ? [b.path] : []));
}

/** Todos os arquivos do material: capa e blocos. */
export function materialFiles(m: Pick<Material, "coverPath" | "blocks">): string[] {
  return [...(m.coverPath ? [m.coverPath] : []), ...blockFiles(m.blocks)];
}

/* ---------- validação ---------- */

export type MaterialIssue = { field: "title" | "slug" | "description" | "cover" | "blocks" | "cta"; blockId?: string; message: string };

/**
 * Regras de um material. Limites e formatos valem sempre; conteúdo vazio só impede publicar
 * (rascunho pode ficar pela metade).
 */
export function validateMaterial(m: MaterialDraft, opts: { publish: boolean }): MaterialIssue[] {
  const out: MaterialIssue[] = [];
  if (!m.title.trim()) out.push({ field: "title", message: "Dê um título ao material." });
  else if (m.title.length > TITLE_MAX) out.push({ field: "title", message: `O título pode ter até ${TITLE_MAX} caracteres.` });
  if (!SLUG_RE.test(m.slug) || m.slug.length > SLUG_MAX) {
    out.push({ field: "slug", message: `O endereço aceita letras minúsculas sem acento, números e hífen (até ${SLUG_MAX} caracteres).` });
  }
  if (m.description.length > DESCRIPTION_MAX) out.push({ field: "description", message: `A descrição pode ter até ${DESCRIPTION_MAX} caracteres.` });
  if (m.ctaPost && !isHttpUrl(m.ctaPost)) out.push({ field: "cta", message: "O link do post precisa começar com http:// ou https://." });
  if (m.ctaKeyword.length > CTA_KEYWORD_MAX) out.push({ field: "cta", message: `A palavra-chave pode ter até ${CTA_KEYWORD_MAX} caracteres.` });

  if (m.blocks.length > MAX_BLOCKS) out.push({ field: "blocks", message: `Um material pode ter até ${MAX_BLOCKS} blocos.` });
  if (new Set(m.blocks.map((b) => b.id)).size !== m.blocks.length) out.push({ field: "blocks", message: "Há blocos repetidos. Recarregue a página e tente de novo." });
  if (opts.publish && !m.blocks.length) out.push({ field: "blocks", message: "Adicione pelo menos um bloco antes de publicar." });

  for (const b of m.blocks) {
    const add = (message: string) => out.push({ field: "blocks", blockId: b.id, message });
    if (b.type === "text") {
      if (b.markdown.length > BLOCK_TEXT_MAX) add(`O bloco de texto pode ter até ${BLOCK_TEXT_MAX.toLocaleString("pt-BR")} caracteres.`);
      else if (opts.publish && !b.markdown.trim()) add("Escreva o texto ou remova o bloco.");
    }
    if (b.type === "prompt") {
      if (b.text.length > BLOCK_TEXT_MAX) add(`O prompt pode ter até ${BLOCK_TEXT_MAX.toLocaleString("pt-BR")} caracteres.`);
      else if (opts.publish && !b.text.trim()) add("Escreva o prompt ou remova o bloco.");
    }
    if (b.type === "file") {
      if (b.size > FILE_MAX_BYTES) add("O arquivo passa de 25 MB.");
      else if (b.path && !FILE_TYPES[fileExt(b.path)]) add("Esse tipo de arquivo não é aceito.");
      else if (opts.publish && (!b.path || !b.name.trim())) add("Envie o arquivo ou remova o bloco.");
    }
    if (b.type === "links") {
      const filled = b.items.filter((i) => i.title.trim() || i.url.trim());
      if (b.items.length > LINKS_MAX) add(`A lista pode ter até ${LINKS_MAX} links.`);
      else if (filled.some((i) => i.url.trim() && !isHttpUrl(i.url.trim()))) add("Os links precisam começar com http:// ou https://.");
      else if (opts.publish && (!filled.length || filled.some((i) => !i.title.trim() || !i.url.trim()))) add("Cada link precisa de título e endereço.");
    }
    if (b.type === "image") {
      if (opts.publish && !b.path) add("Envie a imagem ou remova o bloco.");
    }
  }
  return out;
}

/* ---------- acesso no portal ---------- */

/** O visitante pode abrir? `unlocked` = ids dos exclusivos liberados no aparelho (vazio até a etapa do link pessoal). */
export function canOpen(m: Pick<Material, "id" | "status" | "visibility">, unlocked: readonly string[] = []): boolean {
  return m.status === "published" && (m.visibility === "public" || unlocked.includes(m.id));
}

export type PortalView =
  | { locked: false; material: Material }
  | { locked: true; title: string; description: string; coverPath: string | null; ctaPost: string; ctaKeyword: string };

/**
 * O que a página pública pode mostrar. Material não publicado não tem visão (null).
 * A visão trancada não leva os blocos: nada do conteúdo chega à página.
 */
export function portalView(m: Material, unlocked: readonly string[] = []): PortalView | null {
  if (m.status !== "published") return null;
  if (canOpen(m, unlocked)) return { locked: false, material: m };
  return { locked: true, title: m.title, description: m.description, coverPath: m.coverPath, ctaPost: m.ctaPost, ctaKeyword: m.ctaKeyword };
}

/** Arquivo de um bloco, só se a pessoa pode abrir o material. */
export function downloadTarget(m: Material, blockId: string, unlocked: readonly string[] = []): { path: string; name: string } | null {
  if (!canOpen(m, unlocked)) return null;
  const b = m.blocks.find((x) => x.id === blockId);
  return b?.type === "file" && b.path ? { path: b.path, name: b.name } : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/material.test.ts && npm run typecheck`
Expected: todos os testes PASS e o typecheck sem erros.

- [ ] **Step 5: Commit**

```bash
git add lib/material.ts tests/material.test.ts
git commit -m "Materiais: tipos, validação e regras de acesso

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Markdown seguro (`lib/markdown.ts`)

**Files:**
- Create: `lib/markdown.ts`
- Test: `tests/markdown.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `escapeHtml(s: string): string` e `renderMarkdown(src: string): string` (HTML pronto para `dangerouslySetInnerHTML`). Títulos `#`, `##`, `###` viram `<h2>`, `<h3>`, `<h4>`, porque o `<h1>` da página é o título do material.

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/markdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { escapeHtml, renderMarkdown } from "@/lib/markdown";

describe("markdown do bloco de texto", () => {
  it("parágrafos, com quebra de linha simples virando <br>", () => {
    expect(renderMarkdown("linha 1\nlinha 2\n\noutro")).toBe("<p>linha 1<br>linha 2</p>\n<p>outro</p>");
  });

  it("títulos descem um nível", () => {
    expect(renderMarkdown("# Um\n## Dois\n### Três")).toBe("<h2>Um</h2>\n<h3>Dois</h3>\n<h4>Três</h4>");
  });

  it("listas com e sem número", () => {
    expect(renderMarkdown("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(renderMarkdown("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
    expect(renderMarkdown("- a\n1. b")).toBe("<ul><li>a</li></ul>\n<ol><li>b</li></ol>");
  });

  it("citação", () => {
    expect(renderMarkdown("> dica\n> importante")).toBe("<blockquote>dica<br>importante</blockquote>");
  });

  it("negrito, itálico e código", () => {
    expect(renderMarkdown("Olá **mundo** e *você*")).toBe("<p>Olá <strong>mundo</strong> e <em>você</em></p>");
    expect(renderMarkdown("use `**isso**` assim")).toBe("<p>use <code>**isso**</code> assim</p>");
  });

  it("link http abre em nova aba", () => {
    expect(renderMarkdown("[site](https://exemplo.com/a?b=1&c=2)")).toBe(
      '<p><a href="https://exemplo.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow">site</a></p>');
  });

  it("HTML cru vira texto", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("link que não é http ou https não vira link", () => {
    for (const src of ["[clique](javascript:alert(1))", "[clique](data:text/html,x)", "[clique](//exemplo.com)", "[clique](/painel)"]) {
      const html = renderMarkdown(src);
      expect(html).not.toContain("<a ");
      expect(html).not.toContain("javascript:");
      expect(html).toContain("clique");
    }
  });

  it("aspas no endereço não escapam do atributo", () => {
    const html = renderMarkdown('[x](https://a.com"onmouseover="alert(1))');
    expect(html).not.toContain('"onmouseover');
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("texto vazio devolve vazio; caractere nulo é descartado", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("a\u00000\u0000b")).toBe("<p>a0b</p>");
  });

  it("escapa os cinco caracteres do HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/markdown.test.ts`
Expected: FAIL, com erro de importação de `@/lib/markdown`.

- [ ] **Step 3: Implementar**

Crie `lib/markdown.ts`:

```ts
/**
 * Markdown simples do bloco de Texto → HTML seguro. Sem dependências: roda no servidor e no navegador.
 * Aceita títulos (#, ##, ###), listas (- e 1.), citação (>), **negrito**, *itálico*, `código` e [links](https://…).
 * Todo o texto é escapado antes: HTML cru nunca passa. Links só http e https.
 */

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

const HELD = /\u0000(\d+)\u0000/g;

/** Formatação dentro da linha. Código e links ficam guardados para o negrito e o itálico não mexerem neles. */
function inline(raw: string): string {
  const held: string[] = [];
  const hold = (html: string) => { held.push(html); return `\u0000${held.length - 1}\u0000`; };
  let s = escapeHtml(raw);
  s = s.replace(/`([^`]+)`/g, (_, code: string) => hold(`<code>${code}</code>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) =>
    /^https?:\/\//i.test(url) ? hold(`<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`) : label);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  // Um link pode ter código no rótulo (um marcador dentro de outro): por isso mais de uma passada.
  for (let pass = 0; pass < 3 && s.includes("\u0000"); pass++) s = s.replace(HELD, (_, i: string) => held[Number(i)]);
  return s;
}

type List = { tag: "ul" | "ol"; items: string[] };

export function renderMarkdown(src: string): string {
  const out: string[] = [];
  const st = { para: [] as string[], quote: [] as string[], list: null as List | null };
  const flush = () => {
    if (st.para.length) out.push(`<p>${st.para.map(inline).join("<br>")}</p>`);
    if (st.quote.length) out.push(`<blockquote>${st.quote.map(inline).join("<br>")}</blockquote>`);
    if (st.list) out.push(`<${st.list.tag}>${st.list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${st.list.tag}>`);
    st.para = []; st.quote = []; st.list = null;
  };

  for (const rawLine of src.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) { flush(); continue; }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flush();
      const level = heading[1].length + 1;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ul || ol) {
      const tag = ul ? "ul" : "ol";
      if (st.para.length || st.quote.length || (st.list && st.list.tag !== tag)) flush();
      st.list ??= { tag, items: [] };
      st.list.items.push((ul ?? ol)![1]);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      if (st.para.length || st.list) flush();
      st.quote.push(quote[1]);
      continue;
    }

    if (st.list || st.quote.length) flush();
    st.para.push(line.trim());
  }
  flush();
  return out.join("\n");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/markdown.test.ts && npm run typecheck`
Expected: todos PASS, typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add lib/markdown.ts tests/markdown.test.ts
git commit -m "Materiais: Markdown simples convertido em HTML seguro

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Banco, repositório e serviço

**Files:**
- Create: `supabase/migrations/20261008000000_materials.sql`
- Create: `lib/materials.ts`
- Modify: `lib/account-context.ts` (interface `AccountRepo` e classe `MemoryRepo`)
- Modify: `lib/accounts.ts` (classe `SupabaseRepo`, conversões)
- Modify: `scripts/seed-dev.mjs`
- Test: `tests/materials.test.ts`

**Interfaces:**
- Consumes (Task 1): `Material`, `MaterialDraft`, `MaterialStatus`, `MaterialIssue`, `Block`, `MaterialVisibility`, `validateMaterial`, `materialFiles`, `ownsMaterialFile`.
- Produces:
  - Em `AccountRepo`:
    - `listMaterials(): Promise<Material[]>` (mais novo primeiro)
    - `getMaterial(id: string): Promise<Material | null>`
    - `createMaterial(m: NewMaterial): Promise<Material>`
    - `updateMaterial(id: string, patch: Partial<NewMaterial>): Promise<Material | null>`
    - `deleteMaterial(id: string): Promise<void>`
    - tipo `NewMaterial = Omit<Material, "id" | "createdAt" | "updatedAt">`, exportado de `lib/account-context.ts`
  - Em `lib/accounts.ts`: `toMaterial(row: Record<string, unknown>): Material`, exportado.
  - Em `lib/materials.ts`:
    - `type MaterialInput = MaterialDraft & { id?: string }`
    - `type MaterialDeps = { deleteFiles(paths: string[]): Promise<void>; now(): number }`
    - `type MaterialResult = { ok: true; material: Material } | { ok: false; issues: MaterialIssue[] }`
    - `listMaterials(): Promise<Material[]>`, `getMaterial(id): Promise<Material | null>`
    - `saveMaterial(input: MaterialInput, status: MaterialStatus, deps: MaterialDeps): Promise<MaterialResult>`
    - `setMaterialStatus(id: string, status: MaterialStatus, deps: MaterialDeps): Promise<MaterialResult>`
    - `removeMaterial(id: string, deps: MaterialDeps): Promise<MaterialResult>`

- [ ] **Step 1: Escrever a migração**

Crie `supabase/migrations/20261008000000_materials.sql`:

```sql
-- Materiais do portal de uma conta do Instagram (CMS em blocos).
-- blocks: [{ "id": "ab12cd", "type": "text" | "prompt" | "file" | "links" | "image", ... }], em ordem (ver lib/material.ts).
-- cover_path e os caminhos dentro de blocks apontam para o Blob privado, em materials/{account_id}/.
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.instagram_accounts (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null default '',
  description text not null default '',
  cover_path text,
  blocks jsonb not null default '[]'::jsonb,
  visibility text not null default 'public' check (visibility in ('public', 'exclusive')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  cta_post text not null default '',
  cta_keyword text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, slug)
);
create index if not exists materials_account on public.materials (account_id, created_at desc);

alter table public.materials enable row level security;

-- O navegador só lê os materiais da própria conta. Criar, alterar e excluir passam pelo servidor, que valida
-- os blocos e confere o dono de cada arquivo. O visitante do portal não lê o banco: as páginas públicas são
-- renderizadas no servidor (lib/portal.ts).
revoke all on public.materials from anon, authenticated;
grant select on public.materials to authenticated;

drop policy if exists "material: ver os da própria conta" on public.materials;
create policy "material: ver os da própria conta" on public.materials
  for select to authenticated using (public.owns_account(account_id));
```

- [ ] **Step 2: Aplicar no banco local e conferir**

Run:

```bash
npm run dev:db
npx supabase migration up --local
psql "$(grep '^POSTGRES_URL_NON_POOLING=' .env.development.local | cut -d= -f2-)" -c '\d public.materials'
```

Expected: a descrição da tabela `public.materials` com as 14 colunas, a restrição `materials_account_id_slug_key` e a política de leitura. Se `supabase migration up` não reconhecer a migração, aplique direto: `psql "<mesma URL>" -v ON_ERROR_STOP=1 -f supabase/migrations/20261008000000_materials.sql`. Confirme que a URL contém `127.0.0.1` antes de rodar: **nunca** aplique com a URL do `.env.local`, que é a produção.

- [ ] **Step 3: Escrever os testes que falham**

Crie `tests/materials.test.ts`:

```ts
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
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run tests/materials.test.ts`
Expected: FAIL, com erro de importação de `@/lib/materials`.

- [ ] **Step 5: Estender o repositório em `lib/account-context.ts`**

No topo, junto dos outros imports de tipo:

```ts
import type { Material } from "@/lib/material";
```

Logo antes de `export interface AccountRepo`:

```ts
/** Material ainda sem id e datas (o banco preenche). */
export type NewMaterial = Omit<Material, "id" | "createdAt" | "updatedAt">;
```

Dentro de `AccountRepo`, depois de `deletePost`:

```ts
  /** Materiais do portal, do mais novo para o mais antigo. */
  listMaterials(): Promise<Material[]>;
  getMaterial(id: string): Promise<Material | null>;
  createMaterial(m: NewMaterial): Promise<Material>;
  /** Devolve null se o material não existe mais. */
  updateMaterial(id: string, patch: Partial<NewMaterial>): Promise<Material | null>;
  deleteMaterial(id: string): Promise<void>;
```

Dentro de `MemoryRepo`, depois de `deletePost`:

```ts
  materials: Material[] = [];
  private materialSeq = 0;
  async listMaterials() { return [...this.materials].sort((a, b) => b.createdAt - a.createdAt).map((m) => structuredClone(m)); }
  async getMaterial(id: string) { const m = this.materials.find((x) => x.id === id); return m ? structuredClone(m) : null; }
  async createMaterial(m: NewMaterial) {
    // O contador só desempata a ordem de materiais criados no mesmo milissegundo.
    const now = Date.now() + this.materialSeq++;
    const created: Material = { ...structuredClone(m), id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    this.materials.push(created);
    return structuredClone(created);
  }
  async updateMaterial(id: string, patch: Partial<NewMaterial>) {
    const i = this.materials.findIndex((x) => x.id === id);
    if (i < 0) return null;
    this.materials[i] = { ...this.materials[i], ...structuredClone(patch), id, updatedAt: Date.now() };
    return structuredClone(this.materials[i]);
  }
  async deleteMaterial(id: string) { this.materials = this.materials.filter((m) => m.id !== id); }
```

- [ ] **Step 6: Implementar no Supabase, em `lib/accounts.ts`**

Nos imports:

```ts
import type { AccountCtx, AccountRepo, NewMaterial, PostCond } from "@/lib/account-context";
import type { Material } from "@/lib/material";
```

(a primeira linha substitui o import atual de `@/lib/account-context`).

Dentro de `SupabaseRepo`, depois de `deletePost`:

```ts
  async listMaterials(): Promise<Material[]> {
    const { data, error } = await this.db.from("materials").select("*").eq("account_id", this.accountId).order("created_at", { ascending: false });
    if (error) throw new Error(`Falha ao ler materiais: ${error.message}`);
    return (data ?? []).map(toMaterial);
  }

  async getMaterial(id: string): Promise<Material | null> {
    const { data, error } = await this.db.from("materials").select("*").eq("account_id", this.accountId).eq("id", id).maybeSingle();
    if (error) throw new Error(`Falha ao ler o material: ${error.message}`);
    return data ? toMaterial(data) : null;
  }

  // Escritas de materiais só pelo servidor (o navegador tem acesso só de leitura), sempre filtrando pela conta.
  async createMaterial(m: NewMaterial): Promise<Material> {
    const { data, error } = await createAdminClient().from("materials").insert({ ...fromMaterial(m), account_id: this.accountId }).select("*").single();
    if (error) throw new Error(`Falha ao criar o material: ${error.message}`);
    return toMaterial(data);
  }

  async updateMaterial(id: string, patch: Partial<NewMaterial>): Promise<Material | null> {
    const { data, error } = await createAdminClient().from("materials").update({ ...fromMaterial(patch), updated_at: new Date().toISOString() })
      .eq("account_id", this.accountId).eq("id", id).select("*").maybeSingle();
    if (error) throw new Error(`Falha ao salvar o material: ${error.message}`);
    return data ? toMaterial(data) : null;
  }

  async deleteMaterial(id: string): Promise<void> {
    const { error } = await createAdminClient().from("materials").delete().eq("account_id", this.accountId).eq("id", id);
    if (error) throw new Error(`Falha ao excluir o material: ${error.message}`);
  }
```

Depois da função `fromPost`, antes de `toCtx`:

```ts
/* ---------- materiais: linha do banco ↔ objeto ---------- */

/** Uma consulta que não seleciona `blocks` (a biblioteca do portal) devolve o material com a lista vazia. */
export function toMaterial(r: Record<string, unknown>): Material {
  return {
    id: String(r.id), slug: String(r.slug), title: String(r.title ?? ""), description: String(r.description ?? ""),
    coverPath: (r.cover_path as string) ?? null, blocks: (r.blocks as Material["blocks"]) ?? [],
    visibility: r.visibility as Material["visibility"], status: r.status as Material["status"],
    ctaPost: String(r.cta_post ?? ""), ctaKeyword: String(r.cta_keyword ?? ""),
    publishedAt: ms(r.published_at), createdAt: ms(r.created_at) ?? Date.now(), updatedAt: ms(r.updated_at) ?? Date.now(),
  };
}

/** Só os campos presentes em `m` vão para o banco. */
function fromMaterial(m: Partial<NewMaterial>): Record<string, unknown> {
  const map: [keyof NewMaterial, string, (v: never) => unknown][] = [
    ["slug", "slug", (v) => v], ["title", "title", (v) => v], ["description", "description", (v) => v],
    ["coverPath", "cover_path", (v) => v], ["blocks", "blocks", (v) => v], ["visibility", "visibility", (v) => v],
    ["status", "status", (v) => v], ["ctaPost", "cta_post", (v) => v], ["ctaKeyword", "cta_keyword", (v) => v],
    ["publishedAt", "published_at", iso],
  ];
  const row: Record<string, unknown> = {};
  for (const [k, col, f] of map) if (k in m) row[col] = f(m[k] as never);
  return row;
}
```

- [ ] **Step 7: Implementar o serviço**

Crie `lib/materials.ts`:

```ts
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
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run tests/materials.test.ts && npm run typecheck`
Expected: todos PASS, typecheck limpo. Se o typecheck reclamar de outra classe que implementa `AccountRepo`, procure com `grep -rn "implements AccountRepo" .` e complete: só `MemoryRepo` e `SupabaseRepo` devem aparecer.

- [ ] **Step 9: Incluir `materials` no seed do ambiente local**

Em `scripts/seed-dev.mjs`, logo depois da linha `const posts = rows("select * from public.scheduled_posts");`:

```js
const materials = rows("select * from public.materials");
```

Troque a linha que monta os inserts por:

```js
sql += insert("public.instagram_accounts", accounts) + insert("public.automations", automations) + insert("public.scheduled_posts", posts) + insert("public.materials", materials);
```

E a linha do `console.log` por:

```js
console.log(`  ${users.length} usuário(s), ${accounts.length} conta(s), ${automations.length} automação(ões), ${posts.length} publicação(ões), ${materials.length} material(is) → supabase/seed.sql`);
```

Não rode `npm run db:seed` agora: a tabela ainda não existe em produção e a leitura falharia. O seed volta a funcionar depois que a migração for aplicada lá (ver "Publicação", no fim).

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20261008000000_materials.sql lib/account-context.ts lib/accounts.ts lib/materials.ts scripts/seed-dev.mjs tests/materials.test.ts
git commit -m "Materiais: tabela, repositório e regras de salvar, publicar e excluir

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Painel: lista de Materiais, ações e menu

**Files:**
- Modify: `lib/media-store.ts`
- Modify: `lib/panel.ts`
- Modify: `app/painel/_components/icons.ts`
- Modify: `app/painel/_components/shell.tsx`
- Create: `app/painel/materiais/actions.ts`
- Create: `app/painel/materiais/page.tsx`
- Create: `app/painel/materiais/list.tsx`

**Interfaces:**
- Consumes (Task 1): `Material`, `MaterialIssue`, limites, `ownsMaterialFile`. (Task 3): `saveMaterial`, `setMaterialStatus`, `removeMaterial`, `listMaterials`, `MaterialInput`, `MaterialDeps`.
- Produces:
  - `lib/media-store.ts`: `materialSignedUrls(accountId: string, paths: string[], ttlMs?: number): Promise<Record<string, string>>` e `deleteMaterialFiles(accountId: string, paths: string[]): Promise<void>`.
  - `lib/panel.ts`: `getMaterials(): Promise<Material[]>`.
  - `app/painel/materiais/actions.ts`: `type MaterialActionResult = { ok: true; material: Material } | { ok: false; error?: string; issues?: MaterialIssue[] }`; `saveMaterialAction(input: MaterialInput, status: MaterialStatus)`, `setMaterialStatusAction(id: string, status: MaterialStatus)`, `deleteMaterialAction(id: string)`, todas devolvendo `Promise<MaterialActionResult>`.

Esta task não tem lógica nova para testar por unidade (as regras estão nas Tasks 1 e 3); a verificação é typecheck, build e uso no navegador.

- [ ] **Step 1: Armazenamento dos materiais em `lib/media-store.ts`**

Acrescente ao import de `@/lib/posts` uma linha nova de import:

```ts
import { ownsMaterialFile } from "@/lib/material";
```

E, depois da função `deleteMedia`:

```ts
/* ---------- materiais do portal (materials/{accountId}/) ---------- */

/** Links temporários só para arquivos de material da conta (padrão: 1 hora). Arquivo que falhar fica de fora. */
export async function materialSignedUrls(accountId: string, paths: string[], ttlMs = 3600e3): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(paths.filter((p) => ownsMaterialFile(accountId, p)).map(async (p) => { try { out[p] = await signedUrl(p, ttlMs); } catch { /* arquivo já apagado */ } }));
  return out;
}

/** Apaga só arquivos de material da conta. */
export async function deleteMaterialFiles(accountId: string, paths: string[]): Promise<void> {
  const mine = paths.filter((p) => ownsMaterialFile(accountId, p));
  if (mine.length) await del(mine);
}
```

- [ ] **Step 2: Leitura para as telas, em `lib/panel.ts`**

Nos imports:

```ts
import type { Material } from "@/lib/material";
import { listMaterials } from "@/lib/materials";
```

Depois de `getPosts`:

```ts
/** Materiais do portal da conta, do mais novo para o mais antigo. */
export const getMaterials = cache(async (): Promise<Material[]> => scoped(() => listMaterials(), []));
```

- [ ] **Step 3: Ações do servidor**

Crie `app/painel/materiais/actions.ts`:

```ts
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
```

- [ ] **Step 4: Página e lista**

Crie `app/painel/materiais/page.tsx`:

```tsx
import { getAccount, getMaterials } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { MaterialList, type MaterialRow } from "./list";

export default async function Materiais() {
  await requireSession();
  const [account, materials] = await Promise.all([getAccount(), getMaterials()]);
  const rows: MaterialRow[] = materials.map((m) => ({
    id: m.id, title: m.title, slug: m.slug, visibility: m.visibility, status: m.status, blocks: m.blocks.length, updatedAt: m.updatedAt,
  }));
  return <MaterialList rows={rows} username={account?.username ?? null} />;
}
```

Crie `app/painel/materiais/list.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { relTime } from "@/lib/format";
import type { MaterialStatus, MaterialVisibility } from "@/lib/material";
import { setMaterialStatusAction } from "./actions";
import { Badge, Icon, Toggle, useToast } from "../_components/ui";
import { ICONS } from "../_components/icons";

export type MaterialRow = {
  id: string; title: string; slug: string; visibility: MaterialVisibility; status: MaterialStatus; blocks: number; updatedAt: number;
};

const FILTERS = ["Todos", "Publicados", "Rascunhos"] as const;
const COLS = "minmax(0,2.4fr) 110px 110px 130px 190px";
const NARROW = "minmax(150px,1fr) 100px 110px";

export function MaterialList({ rows, username }: { rows: MaterialRow[]; username: string | null }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Todos");
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const list = rows.filter((r) => (filter === "Publicados" ? r.status === "published" : filter === "Rascunhos" ? r.status === "draft" : true));

  const toggle = (r: MaterialRow) => {
    const publish = r.status !== "published";
    setBusy(r.id);
    start(async () => {
      const res = await setMaterialStatusAction(r.id, publish ? "published" : "draft");
      setBusy(null);
      if (!res.ok) return toast(res.issues?.[0]?.message ?? res.error ?? "Não foi possível alterar", "red");
      toast(publish ? `“${r.title}” publicado` : `“${r.title}” voltou para rascunho`, publish ? "green" : "amber");
      router.refresh();
    });
  };

  return (
    <div className="pn-page">
      <div className="pn-row">
        <div className="pn-row" style={{ gap: 6 }}>
          {FILTERS.map((f) => (
            <button key={f} type="button" className={`pn-chip${filter === f ? " is-on" : ""}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>{f}</button>
          ))}
        </div>
        <div className="pn-row pn-spacer" style={{ gap: 8 }}>
          {username && <a href={`/m/${username}`} target="_blank" rel="noopener noreferrer" className="pn-btn">Ver o portal</a>}
          <Link href="/painel/materiais/novo" className="pn-btn is-primary"><Icon d={ICONS.plus} size={14} width={2} />Criar material</Link>
        </div>
      </div>

      <div className="pn-card is-flush">
        <div className="pn-thead" data-narrow style={{ gridTemplateColumns: COLS, ["--narrow" as string]: NARROW }}>
          <div>Material</div>
          <div>Status</div>
          <div className="pn-wide-only">Acesso</div>
          <div className="pn-wide-only">Última alteração</div>
          <div style={{ textAlign: "right" }}>Ações</div>
        </div>
        {list.map((r) => (
          <div key={r.id} className="pn-trow" data-narrow style={{ gridTemplateColumns: COLS, ["--narrow" as string]: NARROW }}>
            <div style={{ minWidth: 0 }}>
              <Link href={`/painel/materiais/${r.id}`} style={{ color: "var(--text)", fontSize: 13.5, fontWeight: 500 }}>{r.title}</Link>
              <div className="pn-cell-sub pn-ellipsis">/{r.slug} · {r.blocks} bloco{r.blocks === 1 ? "" : "s"}</div>
            </div>
            <div><Badge tone={r.status === "published" ? "green" : ""}>{r.status === "published" ? "Publicado" : "Rascunho"}</Badge></div>
            <div className="pn-wide-only" style={{ fontSize: 12.5, color: "var(--text-3)" }}>{r.visibility === "public" ? "Público" : "Exclusivo"}</div>
            <div className="pn-wide-only" style={{ fontSize: 12.5, color: "var(--muted)" }}>{relTime(r.updatedAt)}</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
              {username && r.status === "published" && (
                <a href={`/m/${username}/${r.slug}`} target="_blank" rel="noopener noreferrer" className="pn-btn is-sm pn-wide-only">Abrir</a>
              )}
              <Link href={`/painel/materiais/${r.id}`} className="pn-btn is-sm">Editar</Link>
              <Toggle on={r.status === "published"} disabled={busy === r.id}
                label={r.status === "published" ? `Voltar ${r.title} para rascunho` : `Publicar ${r.title}`} onChange={() => toggle(r)} />
            </div>
          </div>
        ))}
        {!list.length && (
          <div className="pn-table-empty">
            {rows.length ? "Nenhum material com esse filtro" : <>Nenhum material ainda. <Link href="/painel/materiais/novo">Criar o primeiro</Link></>}
          </div>
        )}
      </div>
    </div>
  );
}
```

Confira que as classes `pn-ellipsis`, `pn-wide-only` e `pn-narrow-only` existem em `app/painel/painel.css` (`grep -n "pn-ellipsis\|pn-wide-only" app/painel/painel.css`); elas já são usadas na lista de automações.

- [ ] **Step 5: Item no menu**

Em `app/painel/_components/icons.ts`, dentro de `ICONS`, depois de `calendar`:

```ts
  book: "M5 4.5h10.5a3 3 0 013 3V20H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10.5M9 8.5h6",
```

Em `app/painel/_components/shell.tsx`, no array `NAV`, depois da linha de "Publicações":

```ts
  { href: "/painel/materiais", label: "Materiais", icon: ICONS.book },
```

E em `titleFor`, antes da linha de `/painel/contatos`:

```ts
  if (path === "/painel/materiais/novo" || /^\/painel\/materiais\/[^/]+$/.test(path)) return "Material";
  if (path.startsWith("/painel/materiais")) return "Materiais";
```

- [ ] **Step 6: Verificar**

Run: `npm run typecheck && npm test`
Expected: typecheck limpo e todos os testes PASS.

Depois, com `npm run dev` (ambiente local), entre em `http://localhost:3000/painel/materiais` com um usuário do seed (senha `muchchat-dev`). Expected: o item "Materiais" aparece no menu, a página abre com "Nenhum material ainda. Criar o primeiro" e o cabeçalho mostra "Materiais". O botão "Criar material" ainda leva a uma página inexistente (vem na Task 5).

- [ ] **Step 7: Commit**

```bash
git add lib/media-store.ts lib/panel.ts app/painel/_components/icons.ts app/painel/_components/shell.tsx app/painel/materiais
git commit -m "Materiais: lista no painel, ações do servidor e item no menu

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Painel: editor em blocos, envio de arquivos e pré-visualização

**Files:**
- Create: `app/_portal/blocks.tsx`
- Create: `app/_portal/copy-button.tsx`
- Create: `app/_portal/portal.css`
- Create: `app/painel/_components/to-jpeg.ts`
- Modify: `app/painel/publicacoes/editor.tsx` (passa a importar `toJpeg`)
- Modify: `app/api/uploads/route.ts`
- Create: `app/painel/materiais/data.ts`
- Create: `app/painel/materiais/editor.tsx`
- Create: `app/painel/materiais/novo/page.tsx`
- Create: `app/painel/materiais/[id]/page.tsx`

**Interfaces:**
- Consumes (Task 1): tipos de bloco, `BLOCK_META`, `blankBlock`, `slugify`, `validateMaterial`, `fileExt`, `formatBytes`, `FILE_TYPES`, `FILE_MAX_BYTES`, `materialPrefix`, `ownsMaterialFile`, `uploadRule`, `materialFiles`. (Task 2): `renderMarkdown`. (Task 4): `saveMaterialAction`, `deleteMaterialAction`, `materialSignedUrls`.
- Produces (usado pela Task 6):
  - `app/_portal/blocks.tsx`: `BlocksView({ blocks, urls, fileHref }: { blocks: Block[]; urls: Record<string, string>; fileHref: (blockId: string) => string | null })`. `urls` mapeia caminho de imagem → endereço para mostrar; `fileHref` devolve o endereço de download de um bloco de arquivo, ou `null` para mostrar o bloco sem link.
  - `app/_portal/portal.css`: classes `pt-*`, incluindo `.pt` (raiz), `.pt-wrap`, `.pt-head`, `.pt-title`, `.pt-desc`, `.pt-cover`, `.pt-notice`, `.pt-grid`, `.pt-card`, `.pt-lock`.
  - `app/painel/_components/to-jpeg.ts`: `toJpeg(file: File): Promise<{ blob: Blob; width: number; height: number }>`.

- [ ] **Step 1: Extrair `toJpeg`**

Crie `app/painel/_components/to-jpeg.ts`, com o corpo copiado sem alteração de `app/painel/publicacoes/editor.tsx`:

```ts
const MAX_SIDE = 1440;

/** Lê qualquer imagem que o navegador abre, reduz para no máximo 1440 px e converte para JPEG. */
export async function toJpeg(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch {
    throw new Error(`O navegador não abre “${file.name}”. Exporte como JPEG ou PNG e tente de novo.`);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale), height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("Não foi possível converter a imagem.");
  return { blob, width, height };
}
```

Em `app/painel/publicacoes/editor.tsx`: apague a constante `const MAX_SIDE = 1440;`, apague a função `toJpeg` inteira com o comentário acima dela, e acrescente aos imports:

```ts
import { toJpeg } from "../_components/to-jpeg";
```

Run: `npm run typecheck`
Expected: limpo (a constante `COVER_SIDE` continua no editor de publicações, usada por `readVideo`).

- [ ] **Step 2: Aceitar envio de arquivos de material em `app/api/uploads/route.ts`**

Acrescente aos imports:

```ts
import { ownsMaterialFile, uploadRule } from "@/lib/material";
```

Atualize o comentário acima de `POST`, acrescentando ao fim: `Materiais do portal gravam em materials/{accountId}/: .jpg até 8 MB e os tipos de FILE_TYPES até 25 MB.`

Dentro de `onBeforeGenerateToken`, substitua a linha

```ts
        if (!pathname.startsWith(mediaPrefix(account.accountId)) || pathname.includes("..")) throw new Error("Caminho de envio inválido.");
```

por

```ts
        const forMaterial = ownsMaterialFile(account.accountId, pathname);
        if ((!forMaterial && !pathname.startsWith(mediaPrefix(account.accountId))) || pathname.includes("..")) throw new Error("Caminho de envio inválido.");
```

E, logo depois da linha do limite de envios (`allowKey`), antes de `const ext = ...`:

```ts
        if (forMaterial) {
          const rule = uploadRule(pathname);
          if (!rule) throw new Error("Tipo de arquivo não aceito. Envie imagem, PDF, ZIP, CSV, TXT, MD, JSON, XLSX, DOCX ou PPTX.");
          return { allowedContentTypes: [rule.contentType], maximumSizeInBytes: rule.maxBytes, addRandomSuffix: true, validUntil: Date.now() + 10 * 60e3 };
        }
```

- [ ] **Step 3: Estilos do portal**

Crie `app/_portal/portal.css`. As cores vêm de `app/theme.css` (claro e escuro) e as fontes das variáveis de `.pn`; por isso a raiz do portal é sempre `class="pn pt"`.

```css
/* Portal de materiais: páginas públicas (/m/...) e a pré-visualização do editor. Raiz: <div class="pn pt">. */

.pt { min-height: 100dvh; font-size: 16px; line-height: 1.6; }
.pt.is-preview { min-height: 0; font-size: 14px; border: 1px solid var(--line-2); border-radius: 16px; overflow: hidden; }
.pt-wrap { width: 100%; max-width: 720px; margin: 0 auto; padding: 20px 20px 56px; }
.pt.is-preview .pt-wrap { padding: 16px 14px 24px; }

.pt-head { display: flex; align-items: center; gap: 10px; padding-bottom: 16px; margin-bottom: 20px; border-bottom: 1px solid var(--line); }
.pt-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--card-3); color: var(--text); display: grid; place-items: center; font-size: 13px; font-weight: 600; flex: none; }
.pt-head-name { font-family: var(--display); font-weight: 600; font-size: 15px; color: var(--text); }
.pt-head-sub { font-size: 12.5px; color: var(--muted); }
.pt-head a.pt-back { margin-left: auto; font-size: 13.5px; }

.pt-title { font-family: var(--display); font-size: 28px; line-height: 1.2; font-weight: 700; margin: 0; }
.pt.is-preview .pt-title { font-size: 20px; }
.pt-desc { color: var(--muted); margin: 8px 0 0; }
.pt-cover { width: 100%; height: auto; border-radius: 12px; display: block; margin: 20px 0 0; border: 1px solid var(--line); }
.pt-notice { border: 1px solid var(--amber-line); background: var(--amber-bg-2); color: var(--amber-body); border-radius: 10px; padding: 12px 14px; font-size: 14px; margin-bottom: 20px; }

.pt-blocks { display: flex; flex-direction: column; gap: 22px; margin-top: 28px; }

.pt-text { overflow-wrap: anywhere; }
.pt-text > :first-child { margin-top: 0; }
.pt-text > :last-child { margin-bottom: 0; }
.pt-text h2, .pt-text h3, .pt-text h4 { font-family: var(--display); line-height: 1.25; margin: 1.4em 0 .5em; }
.pt-text h2 { font-size: 1.35em; }
.pt-text h3 { font-size: 1.15em; }
.pt-text h4 { font-size: 1em; }
.pt-text p { margin: 0 0 1em; }
.pt-text ul, .pt-text ol { margin: 0 0 1em; padding-left: 1.4em; }
.pt-text li { margin: .25em 0; }
.pt-text blockquote { margin: 0 0 1em; padding: 2px 0 2px 14px; border-left: 3px solid var(--line-2); color: var(--muted); }
.pt-text code { font-family: var(--mono); font-size: .9em; background: var(--card-3); border-radius: 4px; padding: 1px 5px; }
.pt-text a { text-decoration: underline; text-underline-offset: 2px; }

.pt-prompt { margin: 0; border: 1px solid var(--line-2); border-radius: 12px; background: var(--card); overflow: hidden; }
.pt-prompt figcaption { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; border-bottom: 1px solid var(--line); font-size: 13px; font-weight: 500; color: var(--muted); }
.pt-prompt pre { margin: 0; padding: 14px; font-family: var(--mono); font-size: 13.5px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.pt-copy { margin-left: auto; min-height: 36px; padding: 6px 14px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--card-3); color: var(--text); font-size: 13px; font-weight: 500; cursor: pointer; }
.pt-copy.is-done { border-color: var(--sage); color: var(--sage-text); }

.pt-file { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--line-2); border-radius: 12px; background: var(--card); color: var(--text); text-decoration: none; }
a.pt-file:hover { border-color: var(--text); color: var(--text); }
.pt-file-ext { flex: none; min-width: 46px; text-align: center; font-family: var(--mono); font-size: 11.5px; text-transform: uppercase; padding: 8px 6px; border-radius: 8px; background: var(--card-3); color: var(--muted); }
.pt-file-name { font-weight: 500; overflow-wrap: anywhere; }
.pt-file-sub { font-size: 13px; color: var(--muted); }
.pt-file-go { margin-left: auto; flex: none; font-size: 13.5px; font-weight: 500; color: var(--violet-3); }
.pt-file.is-off { opacity: .7; }

.pt-links { display: flex; flex-direction: column; gap: 8px; list-style: none; margin: 0; padding: 0; }
.pt-link { display: block; padding: 12px 14px; border: 1px solid var(--line-2); border-radius: 12px; background: var(--card); color: var(--text); text-decoration: none; }
a.pt-link:hover { border-color: var(--text); color: var(--text); }
.pt-link-title { font-weight: 500; overflow-wrap: anywhere; }
.pt-link-desc { font-size: 13.5px; color: var(--muted); margin-top: 2px; }
.pt-link-host { font-size: 12px; color: var(--violet-3); margin-top: 4px; font-family: var(--mono); overflow-wrap: anywhere; }

.pt-image { margin: 0; }
.pt-image img { width: 100%; height: auto; border-radius: 12px; display: block; border: 1px solid var(--line); }
.pt-image figcaption { font-size: 13px; color: var(--muted); margin-top: 6px; text-align: center; }
.pt-empty { border: 1px dashed var(--line-2); border-radius: 12px; padding: 14px; font-size: 13px; color: var(--muted); text-align: center; }

.pt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; margin-top: 24px; }
.pt-card { display: flex; flex-direction: column; border: 1px solid var(--line-2); border-radius: 12px; background: var(--card); overflow: hidden; color: var(--text); text-decoration: none; }
a.pt-card:hover { border-color: var(--text); color: var(--text); }
.pt-card-cover { aspect-ratio: 16 / 9; background: var(--card-3); display: grid; place-items: center; color: var(--muted-2); font-size: 12.5px; }
.pt-card-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pt-card-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 4px; }
.pt-card-title { font-family: var(--display); font-weight: 600; font-size: 15.5px; line-height: 1.3; }
.pt-card-desc { font-size: 13.5px; color: var(--muted); }
.pt-card-lock { font-size: 12.5px; color: var(--amber-body); margin-top: 4px; }

.pt-lock { margin-top: 28px; border: 1px solid var(--line-2); border-radius: 12px; background: var(--card); padding: 22px 20px; text-align: center; }
.pt-lock-title { font-family: var(--display); font-weight: 600; font-size: 17px; }
.pt-lock p { margin: 8px 0 0; color: var(--muted); }
.pt-lock .pn-btn { margin-top: 16px; min-height: 44px; }

@media (max-width: 520px) {
  .pt-title { font-size: 24px; }
  .pt-file { flex-wrap: wrap; }
  .pt-file-go { margin-left: 58px; }
}
```

Antes de seguir, confirme que as variáveis usadas existem em `app/theme.css`, nos dois temas: `grep -c -- "--amber-body\|--amber-bg-2\|--amber-line\|--sage-text\|--card-3\|--violet-3\|--muted-2" app/theme.css`. Se alguma faltar, troque pela equivalente que o `painel.css` usa para o mesmo papel.

- [ ] **Step 4: Renderização dos blocos**

Crie `app/_portal/copy-button.tsx`:

```tsx
"use client";

import { useState } from "react";

/** Copia o prompt. O navegador interno do Instagram às vezes bloqueia a área de transferência: há um caminho alternativo. */
export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
    }
    setState(ok ? "done" : "fail");
    setTimeout(() => setState("idle"), 2000);
  };

  return (
    <button type="button" className={`pt-copy${state === "done" ? " is-done" : ""}`} onClick={copy} aria-live="polite">
      {state === "done" ? "Copiado" : state === "fail" ? "Selecione e copie" : "Copiar"}
    </button>
  );
}
```

Crie `app/_portal/blocks.tsx` (sem `"use client"`: serve ao servidor e ao editor):

```tsx
import { renderMarkdown } from "@/lib/markdown";
import { fileExt, formatBytes, isHttpUrl, type Block } from "@/lib/material";
import { CopyButton } from "./copy-button";

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/**
 * Blocos de um material, na ordem. Usado na página pública e na pré-visualização do editor.
 * Bloco ainda vazio (rascunho) não aparece, exceto arquivo e imagem sem endereço, que mostram um aviso.
 */
export function BlocksView({ blocks, urls, fileHref }: {
  blocks: Block[];
  /** Caminho da imagem no armazenamento → endereço para mostrar. */
  urls: Record<string, string>;
  /** Endereço de download de um bloco de arquivo; null mostra o bloco sem link. */
  fileHref: (blockId: string) => string | null;
}) {
  return (
    <div className="pt-blocks">
      {blocks.map((b) => {
        if (b.type === "text") {
          return b.markdown.trim() ? <div key={b.id} className="pt-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(b.markdown) }} /> : null;
        }
        if (b.type === "prompt") {
          return b.text.trim() ? (
            <figure key={b.id} className="pt-prompt">
              <figcaption>{b.label.trim() || "Prompt"}<CopyButton text={b.text} /></figcaption>
              <pre>{b.text}</pre>
            </figure>
          ) : null;
        }
        if (b.type === "file") {
          if (!b.path) return null;
          const href = fileHref(b.id);
          const inner = (
            <>
              <span className="pt-file-ext">{fileExt(b.name) || fileExt(b.path) || "arq"}</span>
              <span style={{ minWidth: 0 }}>
                <span className="pt-file-name" style={{ display: "block" }}>{b.name}</span>
                <span className="pt-file-sub">{b.description.trim() ? `${b.description.trim()} · ` : ""}{formatBytes(b.size)}</span>
              </span>
              <span className="pt-file-go">{href ? "Baixar" : "Indisponível"}</span>
            </>
          );
          return href
            ? <a key={b.id} className="pt-file" href={href}>{inner}</a>
            : <div key={b.id} className="pt-file is-off">{inner}</div>;
        }
        if (b.type === "links") {
          const items = b.items.filter((i) => i.title.trim() && isHttpUrl(i.url.trim()));
          return items.length ? (
            <ul key={b.id} className="pt-links">
              {items.map((i, n) => (
                <li key={n}>
                  <a className="pt-link" href={i.url.trim()} target="_blank" rel="noopener noreferrer nofollow">
                    <span className="pt-link-title" style={{ display: "block" }}>{i.title}</span>
                    {i.description.trim() && <span className="pt-link-desc" style={{ display: "block" }}>{i.description}</span>}
                    <span className="pt-link-host" style={{ display: "block" }}>{host(i.url.trim())}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null;
        }
        if (!b.path) return null;
        return urls[b.path] ? (
          <figure key={b.id} className="pt-image">
            <img src={urls[b.path]} alt={b.alt} width={b.width || undefined} height={b.height || undefined} loading="lazy" />
            {b.caption.trim() && <figcaption>{b.caption}</figcaption>}
          </figure>
        ) : <div key={b.id} className="pt-empty">Imagem indisponível no momento.</div>;
      })}
    </div>
  );
}
```

- [ ] **Step 5: Dados do editor**

Crie `app/painel/materiais/data.ts`:

```ts
import "server-only";
import { materialFiles, materialPrefix, type Material } from "@/lib/material";
import { materialSignedUrls } from "@/lib/media-store";
import { getAccount } from "@/lib/panel";

/** Tudo o que o editor precisa: prefixo de envio, pré-visualizações assinadas das imagens e o nome da conta. */
export async function editorProps(material?: Material) {
  const account = await getAccount();
  if (!account) return null;
  const previews = material ? await materialSignedUrls(account.accountId, materialFiles(material)) : {};
  return { material, previews, prefix: materialPrefix(account.accountId), username: account.username };
}
```

- [ ] **Step 6: Páginas do editor**

Crie `app/painel/materiais/novo/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { editorProps } from "../data";
import { MaterialEditor } from "../editor";

export default async function NovoMaterial() {
  await requireSession();
  const props = await editorProps();
  if (!props) redirect("/painel/conexao");
  return (
    <div className="pn-page">
      <Link href="/painel/materiais" className="pn-link-back">← Materiais</Link>
      <MaterialEditor {...props} />
    </div>
  );
}
```

Crie `app/painel/materiais/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMaterial } from "@/lib/materials";
import { getAccount, inAccount } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { editorProps } from "../data";
import { MaterialEditor } from "../editor";

export default async function EditarMaterial({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  if (!(await getAccount())) redirect("/painel/conexao");
  const material = await inAccount(() => getMaterial(id));
  if (!material) notFound();
  const props = await editorProps(material);
  if (!props) redirect("/painel/conexao");
  return (
    <div className="pn-page">
      <Link href="/painel/materiais" className="pn-link-back">← Materiais</Link>
      <MaterialEditor key={material.updatedAt} {...props} />
    </div>
  );
}
```

O `id` vem da URL: o repositório filtra por conta, então um id de outra conta devolve `null` e a página responde 404. Um id que não é UUID faz o Postgres devolver erro em vez de `null`; para isso também virar 404, valide antes de consultar, logo depois de `const { id } = await params;`:

```ts
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
```

- [ ] **Step 7: O editor**

Crie `app/painel/materiais/editor.tsx`:

```tsx
"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { BlocksView } from "@/app/_portal/blocks";
import "@/app/_portal/portal.css";
import {
  BLOCK_META, CTA_KEYWORD_MAX, DESCRIPTION_MAX, FILE_MAX_BYTES, FILE_TYPES, LINKS_MAX, MAX_BLOCKS, TITLE_MAX,
  blankBlock, fileExt, formatBytes, slugify, validateMaterial,
  type Block, type BlockType, type LinkItem, type Material, type MaterialDraft, type MaterialIssue, type MaterialStatus, type MaterialVisibility,
} from "@/lib/material";
import { deleteMaterialAction, saveMaterialAction } from "./actions";
import { toJpeg } from "../_components/to-jpeg";
import { ConfirmModal, Icon, useToast } from "../_components/ui";
import { ICONS } from "../_components/icons";

const TYPES: BlockType[] = ["text", "prompt", "file", "links", "image"];
const ACCEPT_FILES = Object.keys(FILE_TYPES).map((e) => `.${e}`).join(",");

export function MaterialEditor({ material, previews, prefix, username }: {
  material?: Material;
  /** Caminho no armazenamento → endereço assinado das imagens já salvas. */
  previews: Record<string, string>;
  /** Pasta de envio da conta: materials/{accountId}/. */
  prefix: string;
  username: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const coverRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(material?.title ?? "");
  const [slug, setSlug] = useState(material?.slug ?? "");
  // Num material novo, o endereço acompanha o título até a pessoa mexer nele.
  const [slugEdited, setSlugEdited] = useState(!!material);
  const [description, setDescription] = useState(material?.description ?? "");
  const [coverPath, setCoverPath] = useState<string | null>(material?.coverPath ?? null);
  const [visibility, setVisibility] = useState<MaterialVisibility>(material?.visibility ?? "public");
  const [ctaPost, setCtaPost] = useState(material?.ctaPost ?? "");
  const [ctaKeyword, setCtaKeyword] = useState(material?.ctaKeyword ?? "");
  const [blocks, setBlocks] = useState<Block[]>(material?.blocks ?? []);
  const [urls, setUrls] = useState<Record<string, string>>(previews);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [issues, setIssues] = useState<MaterialIssue[]>([]);
  const [askDelete, setAskDelete] = useState(false);
  const [pending, start] = useTransition();

  const published = material?.status === "published";
  const uploading = Object.values(sending).some(Boolean);
  const draft: MaterialDraft = { title, slug, description, coverPath, blocks, visibility, ctaPost, ctaKeyword };

  const patch = (id: string, p: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...p } as Block) : b)));
  const move = (i: number, d: -1 | 1) => setBlocks((bs) => { const ys = [...bs]; const j = i + d; if (j < 0 || j >= ys.length) return bs; [ys[i], ys[j]] = [ys[j], ys[i]]; return ys; });
  const remove = (id: string) => setBlocks((bs) => bs.filter((b) => b.id !== id));
  const add = (type: BlockType) => {
    if (blocks.length >= MAX_BLOCKS) return toast(`Um material pode ter até ${MAX_BLOCKS} blocos.`, "amber");
    setBlocks((bs) => [...bs, blankBlock(type)]);
  };

  /** Roda um envio marcando a chave (id do bloco ou "cover") como ocupada; erro vira aviso. */
  const send = async (key: string, fn: () => Promise<void>) => {
    setSending((s) => ({ ...s, [key]: true }));
    try { await fn(); } catch (e) { toast(e instanceof Error ? e.message : "Falha no envio.", "red"); } finally { setSending((s) => ({ ...s, [key]: false })); }
  };

  const sendImage = async (file: File) => {
    const { blob, width, height } = await toJpeg(file);
    const res = await upload(`${prefix}${crypto.randomUUID()}.jpg`, blob, { access: "private", handleUploadUrl: "/api/uploads", contentType: "image/jpeg" });
    setUrls((u) => ({ ...u, [res.pathname]: URL.createObjectURL(blob) }));
    return { path: res.pathname, width, height };
  };

  const pickCover = (file: File | undefined) => {
    if (file) void send("cover", async () => setCoverPath((await sendImage(file)).path));
  };
  const pickImage = (id: string, file: File | undefined) => {
    if (file) void send(id, async () => patch(id, await sendImage(file)));
  };
  const pickFile = (id: string, file: File | undefined) => {
    if (!file) return;
    void send(id, async () => {
      const ext = fileExt(file.name);
      const contentType = FILE_TYPES[ext];
      if (!contentType) throw new Error(`“${file.name}” não é um tipo aceito. Envie PDF, ZIP, CSV, TXT, MD, JSON, XLSX, DOCX ou PPTX.`);
      if (file.size > FILE_MAX_BYTES) throw new Error("O arquivo passa de 25 MB.");
      const res = await upload(`${prefix}${crypto.randomUUID()}.${ext}`, file, {
        access: "private", handleUploadUrl: "/api/uploads", contentType, multipart: file.size > 8 * 1024 * 1024,
      });
      patch(id, { path: res.pathname, name: file.name, size: file.size });
    });
  };

  const submit = (status: MaterialStatus) => {
    if (uploading) return toast("Espere o envio dos arquivos terminar.", "amber");
    const local = validateMaterial({ ...draft, title: title.trim(), slug: slug.trim() }, { publish: status === "published" });
    if (local.length) { setIssues(local); return; }
    start(async () => {
      const r = await saveMaterialAction({ ...draft, id: material?.id }, status);
      if (!r.ok) { setIssues(r.issues ?? [{ field: "title", message: r.error ?? "Não foi possível salvar." }]); return; }
      setIssues([]);
      toast(status === "published" ? "Material publicado" : published ? "Material voltou para rascunho" : "Rascunho salvo", status === "published" ? "green" : undefined);
      router.push(`/painel/materiais/${r.material.id}`);
      router.refresh();
    });
  };

  const destroy = () => start(async () => {
    if (!material) return;
    const r = await deleteMaterialAction(material.id);
    setAskDelete(false);
    if (!r.ok) return toast(r.issues?.[0]?.message ?? r.error ?? "Não foi possível excluir.", "red");
    toast("Material excluído");
    router.push("/painel/materiais");
    router.refresh();
  });

  const general = issues.filter((i) => !i.blockId);
  const blockIssue = (id: string) => issues.find((i) => i.blockId === id)?.message;
  const fieldIssue = (f: MaterialIssue["field"]) => general.find((i) => i.field === f)?.message;

  return (
    <div className="pn-post-editor">
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {general.length > 0 && (
          <div className="pn-alert is-red" role="alert">
            <Icon d={ICONS.error} size={18} />
            <div>
              <div className="pn-alert-title">Antes de salvar, ajuste:</div>
              <div className="pn-alert-body">{general.map((i, n) => <div key={n}>{i.message}</div>)}</div>
            </div>
          </div>
        )}

        <section className="pn-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="pn-card-title">Sobre o material</div>
          <label>
            <span className="pn-field-label">Título</span>
            <input className={`pn-input${fieldIssue("title") ? " is-error" : ""}`} value={title} maxLength={TITLE_MAX + 20}
              onChange={(e) => { setTitle(e.target.value); if (!slugEdited) setSlug(slugify(e.target.value)); }} placeholder="Ex.: 2 prompts para o contador" />
          </label>
          <label>
            <span className="pn-field-label">Endereço</span>
            <input className={`pn-input${fieldIssue("slug") ? " is-error" : ""}`} value={slug} spellCheck={false} autoCapitalize="none"
              onChange={(e) => { setSlugEdited(true); setSlug(e.target.value); }} onBlur={() => setSlug((s) => slugify(s))} />
            <span className="pn-help" style={{ display: "block" }}>
              /m/{username}/{slug || "endereco-do-material"}
              {published && " · Mudar o endereço quebra os links já enviados."}
            </span>
          </label>
          <label>
            <span className="pn-field-label">Descrição curta</span>
            <textarea className="pn-textarea" rows={2} value={description} maxLength={DESCRIPTION_MAX + 50} onChange={(e) => setDescription(e.target.value)}
              placeholder="Aparece na biblioteca e abaixo do título." />
            <span className="pn-help" style={{ display: "block" }}>{description.length}/{DESCRIPTION_MAX}</span>
          </label>

          <div>
            <span className="pn-field-label">Capa</span>
            <div className="pn-row" style={{ gap: 10 }}>
              {coverPath && urls[coverPath] && <img src={urls[coverPath]} alt="" style={{ width: 120, height: 68, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line-2)" }} />}
              <button type="button" className="pn-btn" disabled={sending.cover} onClick={() => coverRef.current?.click()}>
                {sending.cover ? "Enviando…" : coverPath ? "Trocar capa" : "Enviar capa"}
              </button>
              {coverPath && <button type="button" className="pn-btn is-ghost" onClick={() => setCoverPath(null)}>Remover</button>}
              <input ref={coverRef} type="file" accept="image/*" hidden onChange={(e) => { pickCover(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <span className="pn-help" style={{ display: "block" }}>Opcional. Imagem horizontal fica melhor na biblioteca.</span>
          </div>
        </section>

        <section className="pn-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="pn-row">
            <div className="pn-card-title">Quem pode abrir</div>
            <div className="pn-seg pn-spacer" role="tablist" aria-label="Acesso">
              <button type="button" role="tab" aria-selected={visibility === "public"} className={visibility === "public" ? "is-on" : ""} onClick={() => setVisibility("public")}>Público</button>
              <button type="button" role="tab" aria-selected={visibility === "exclusive"} className={visibility === "exclusive" ? "is-on" : ""} onClick={() => setVisibility("exclusive")}>Exclusivo</button>
            </div>
          </div>
          <div className="pn-help">
            {visibility === "public"
              ? "Qualquer pessoa com o endereço abre, e o material aparece na biblioteca."
              : "Aparece trancado na biblioteca, com a chamada para comentar no post. Por enquanto ninguém consegue abrir um material exclusivo: a liberação por link pessoal chega na próxima etapa."}
          </div>
          {visibility === "exclusive" && (
            <>
              <label>
                <span className="pn-field-label">Palavra que a pessoa comenta</span>
                <input className="pn-input" value={ctaKeyword} maxLength={CTA_KEYWORD_MAX} onChange={(e) => setCtaKeyword(e.target.value)} placeholder="Ex.: CONTADOR" />
              </label>
              <label>
                <span className="pn-field-label">Link do post</span>
                <input className={`pn-input${fieldIssue("cta") ? " is-error" : ""}`} value={ctaPost} onChange={(e) => setCtaPost(e.target.value)} placeholder="https://www.instagram.com/p/…" inputMode="url" />
                <span className="pn-help" style={{ display: "block" }}>Os dois são opcionais. Preenchidos, a página trancada mostra “Comente {ctaKeyword.trim() || "PALAVRA"} neste post para receber”.</span>
              </label>
            </>
          )}
        </section>

        {blocks.map((b, i) => (
          <section key={b.id} className="pn-card" style={{ display: "flex", flexDirection: "column", gap: 12, borderColor: blockIssue(b.id) ? "var(--red-line)" : undefined }}>
            <div className="pn-row" style={{ gap: 6 }}>
              <div className="pn-card-title">{BLOCK_META[b.type].label}</div>
              <div className="pn-row pn-spacer" style={{ gap: 4 }}>
                <button type="button" className="pn-btn is-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover bloco para cima">↑</button>
                <button type="button" className="pn-btn is-sm" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Mover bloco para baixo">↓</button>
                <button type="button" className="pn-btn is-sm" onClick={() => remove(b.id)} aria-label={`Remover bloco ${BLOCK_META[b.type].label}`}>Remover</button>
              </div>
            </div>

            {b.type === "text" && (
              <>
                <textarea className="pn-textarea" rows={8} value={b.markdown} onChange={(e) => patch(b.id, { markdown: e.target.value })}
                  placeholder={"Escreva aqui. Dá para colar direto do Notion.\n\n# Título\n**negrito**, *itálico*, - lista, [link](https://…)"} aria-label="Texto do bloco" />
                <span className="pn-help">Markdown simples: # título, **negrito**, *itálico*, - lista, 1. lista numerada, &gt; citação, [texto](https://link).</span>
              </>
            )}

            {b.type === "prompt" && (
              <>
                <label>
                  <span className="pn-field-label">Nome do prompt (opcional)</span>
                  <input className="pn-input" value={b.label} maxLength={120} onChange={(e) => patch(b.id, { label: e.target.value })} placeholder="Ex.: Extrato em PDF vira tabela" />
                </label>
                <textarea className="pn-textarea" rows={8} value={b.text} onChange={(e) => patch(b.id, { text: e.target.value })}
                  style={{ fontFamily: "var(--mono)" }} placeholder="O texto exato que a pessoa vai copiar." aria-label="Texto do prompt" />
              </>
            )}

            {b.type === "file" && (
              <>
                <div className="pn-row" style={{ gap: 10 }}>
                  {b.path && <span style={{ fontSize: 13.5, minWidth: 0, overflowWrap: "anywhere" }}>{b.name} · {formatBytes(b.size)}</span>}
                  <label className="pn-btn" style={{ cursor: sending[b.id] ? "not-allowed" : "pointer" }}>
                    {sending[b.id] ? "Enviando…" : b.path ? "Trocar arquivo" : "Enviar arquivo"}
                    <input type="file" accept={ACCEPT_FILES} hidden disabled={sending[b.id]} onChange={(e) => { pickFile(b.id, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                </div>
                <span className="pn-help">PDF, ZIP, CSV, TXT, MD, JSON, XLSX, DOCX ou PPTX, até 25 MB.</span>
                {b.path && (
                  <>
                    <label>
                      <span className="pn-field-label">Nome exibido</span>
                      <input className="pn-input" value={b.name} maxLength={120} onChange={(e) => patch(b.id, { name: e.target.value })} />
                    </label>
                    <label>
                      <span className="pn-field-label">Descrição (opcional)</span>
                      <input className="pn-input" value={b.description} maxLength={200} onChange={(e) => patch(b.id, { description: e.target.value })} />
                    </label>
                  </>
                )}
              </>
            )}

            {b.type === "links" && (
              <LinksEditor items={b.items} onChange={(items) => patch(b.id, { items })} />
            )}

            {b.type === "image" && (
              <>
                <div className="pn-row" style={{ gap: 10 }}>
                  {b.path && urls[b.path] && <img src={urls[b.path]} alt="" style={{ width: 120, maxHeight: 120, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line-2)" }} />}
                  <label className="pn-btn" style={{ cursor: sending[b.id] ? "not-allowed" : "pointer" }}>
                    {sending[b.id] ? "Enviando…" : b.path ? "Trocar imagem" : "Enviar imagem"}
                    <input type="file" accept="image/*" hidden disabled={sending[b.id]} onChange={(e) => { pickImage(b.id, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                </div>
                {b.path && (
                  <>
                    <label>
                      <span className="pn-field-label">Descrição da imagem (para leitores de tela)</span>
                      <input className="pn-input" value={b.alt} maxLength={200} onChange={(e) => patch(b.id, { alt: e.target.value })} />
                    </label>
                    <label>
                      <span className="pn-field-label">Legenda (opcional)</span>
                      <input className="pn-input" value={b.caption} maxLength={200} onChange={(e) => patch(b.id, { caption: e.target.value })} />
                    </label>
                  </>
                )}
              </>
            )}

            {blockIssue(b.id) && <div style={{ fontSize: 12.5, color: "var(--red-text)" }} role="alert">{blockIssue(b.id)}</div>}
          </section>
        ))}

        <section className="pn-card">
          <div className="pn-card-title">Adicionar bloco</div>
          <div className="pn-row" style={{ gap: 8, marginTop: 12 }}>
            {TYPES.map((t) => (
              <button key={t} type="button" className="pn-btn" title={BLOCK_META[t].help} onClick={() => add(t)}>
                <Icon d={ICONS.plus} size={13} width={2} />{BLOCK_META[t].label}
              </button>
            ))}
          </div>
          <div className="pn-help" style={{ marginTop: 10 }}>{blocks.length} de {MAX_BLOCKS} blocos.</div>
        </section>

        <div className="pn-row" style={{ gap: 8 }}>
          <button type="button" className="pn-btn is-primary" disabled={pending || uploading} onClick={() => submit("published")}>
            {pending ? "Salvando…" : published ? "Salvar e manter publicado" : "Publicar"}
          </button>
          <button type="button" className="pn-btn" disabled={pending || uploading} onClick={() => submit("draft")}>
            {published ? "Voltar para rascunho" : "Salvar rascunho"}
          </button>
          {published && (
            <a className="pn-btn" href={`/m/${username}/${material!.slug}`} target="_blank" rel="noopener noreferrer">Abrir no portal</a>
          )}
          {material && <button type="button" className="pn-btn is-danger pn-spacer" disabled={pending} onClick={() => setAskDelete(true)}>Excluir</button>}
        </div>
      </div>

      <aside className="pn-post-preview">
        <div className="pn-field-label" style={{ margin: 0 }}>Como fica no celular</div>
        <div className="pn pt is-preview">
          <div className="pt-wrap">
            <h1 className="pt-title">{title.trim() || "Título do material"}</h1>
            {description.trim() && <p className="pt-desc">{description}</p>}
            {coverPath && urls[coverPath] && <img className="pt-cover" src={urls[coverPath]} alt="" />}
            <BlocksView blocks={blocks} urls={urls} fileHref={() => null} />
            {!blocks.length && <div className="pt-empty" style={{ marginTop: 20 }}>Adicione um bloco para ver aqui.</div>}
          </div>
        </div>
      </aside>

      {askDelete && (
        <ConfirmModal title="Excluir este material?" tone="danger" confirmLabel="Excluir" busy={pending} onConfirm={destroy} onClose={() => setAskDelete(false)}
          body={<>O material sai do portal e os arquivos são apagados. {published && "Os links já enviados deixam de funcionar. "}Não dá para desfazer.</>} />
      )}
    </div>
  );
}

function LinksEditor({ items, onChange }: { items: LinkItem[]; onChange: (items: LinkItem[]) => void }) {
  const set = (i: number, p: Partial<LinkItem>) => onChange(items.map((it, k) => (k === i ? { ...it, ...p } : it)));
  return (
    <>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
          <div className="pn-row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <input className="pn-input" value={it.title} maxLength={120} onChange={(e) => set(i, { title: e.target.value })} placeholder="Título" aria-label={`Título do link ${i + 1}`} />
            <button type="button" className="pn-btn is-sm" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label={`Remover link ${i + 1}`}>Remover</button>
          </div>
          <input className="pn-input" value={it.url} onChange={(e) => set(i, { url: e.target.value })} placeholder="https://…" inputMode="url" aria-label={`Endereço do link ${i + 1}`} />
          <input className="pn-input" value={it.description} maxLength={200} onChange={(e) => set(i, { description: e.target.value })} placeholder="Descrição (opcional)" aria-label={`Descrição do link ${i + 1}`} />
        </div>
      ))}
      <div>
        <button type="button" className="pn-btn" disabled={items.length >= LINKS_MAX} onClick={() => onChange([...items, { title: "", description: "", url: "" }])}>
          <Icon d={ICONS.plus} size={13} width={2} />Adicionar link
        </button>
      </div>
    </>
  );
}
```

Confira que `--red-text` e `--red-line` existem em `app/theme.css` (a lista de automações já usa `--red-text`).

- [ ] **Step 8: Verificar**

Run: `npm run typecheck && npm test && npm run build`
Expected: tudo limpo. Se o build reclamar do import de CSS dentro de um componente cliente (`@/app/_portal/portal.css` em `editor.tsx`), mova esse import para `app/painel/materiais/novo/page.tsx` e `app/painel/materiais/[id]/page.tsx`.

Depois, com `npm run dev`, em `http://localhost:3000/painel/materiais/novo`:

1. Digite o título "Prompts do Contador". Expected: o endereço vira `prompts-do-contador` sozinho.
2. Digite o endereço "Meu Endereço" e saia do campo. Expected: vira `meu-endereco`.
3. Adicione um bloco Texto com `# Título\n\n**negrito** e <b>html</b>`. Expected: a pré-visualização mostra o título e o negrito, e `<b>html</b>` aparece como texto.
4. Adicione um bloco Prompt e um bloco Lista de links com um link `https://`. Expected: aparecem na pré-visualização; o botão "Copiar" copia o prompt.
5. Clique em "Publicar" com um bloco Prompt vazio. Expected: o bloco fica com borda vermelha e a mensagem "Escreva o prompt ou remova o bloco."
6. Preencha e publique. Expected: aviso "Material publicado", a URL passa a ser `/painel/materiais/{id}` e a lista mostra o material como Publicado.
7. Crie outro material com o mesmo endereço. Expected: "Já existe um material com esse endereço. Escolha outro."

Envio de capa, imagem e arquivo **não funciona no ambiente local** (não há Blob; ver `scripts/dev-db.sh`). Expected local: aviso vermelho de falha no envio, sem travar o editor. O envio de verdade é conferido depois da publicação (ver "Publicação").

- [ ] **Step 9: Commit**

```bash
git add app/_portal app/painel/_components/to-jpeg.ts app/painel/publicacoes/editor.tsx app/api/uploads/route.ts app/painel/materiais
git commit -m "Materiais: editor em blocos com envio de arquivos e pré-visualização

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Portal público: biblioteca, página do material e download

**Files:**
- Create: `lib/portal.ts`
- Create: `app/(portal)/layout.tsx`
- Create: `app/(portal)/_components/portal-head.tsx`
- Create: `app/(portal)/m/[conta]/page.tsx`
- Create: `app/(portal)/m/[conta]/not-found.tsx`
- Create: `app/(portal)/m/[conta]/[slug]/page.tsx`
- Create: `app/(portal)/m/[conta]/[slug]/arquivo/[blockId]/route.ts`

**Interfaces:**
- Consumes (Task 1): `Material`, `SLUG_RE`, `isPortalUsername`, `ownsMaterialFile`, `portalView`, `downloadTarget`, `materialFiles`. (Task 3): `toMaterial`. (Task 5): `BlocksView`, `portal.css`. Já existentes: `signedUrl` (`lib/media-store.ts`), `createAdminClient` (`lib/supabase/server.ts`), `allowKey`, `clientIp`, `RATE_MESSAGE` (`lib/ratelimit.ts`), `initials` (`app/painel/_components/icons.ts`), `PRODUCT` (`config/site.ts`).
- Produces:
  - `lib/portal.ts`: `type PortalAccount = { accountId: string; username: string }`; `portalAccount(raw: string): Promise<PortalAccount | null>`; `portalLibrary(accountId: string): Promise<Material[]>` (publicados, sem `blocks`); `portalMaterial(accountId: string, slug: string): Promise<Material | null>` (só publicado); `portalUrls(accountId: string, paths: string[]): Promise<Record<string, string>>`.

Antes de começar, leia em `node_modules/next/dist/docs/01-app/` os guias de rotas dinâmicas, `route.ts`, `not-found` e `generateMetadata` da versão instalada.

As regras de acesso desta task já estão testadas na Task 1 (`portalView`, `downloadTarget`, `isPortalUsername`). `lib/portal.ts` é `server-only` e só faz consulta; a verificação é pelo navegador.

- [ ] **Step 1: Leitura pública**

Crie `lib/portal.ts`:

```ts
import "server-only";
import { cache } from "react";
import { toMaterial } from "@/lib/accounts";
import { SLUG_RE, isPortalUsername, ownsMaterialFile, type Material } from "@/lib/material";
import { signedUrl } from "@/lib/media-store";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Leitura do portal público (/m/...). Não há usuário logado: usa a chave de serviço, sempre filtrando pela conta
 * do endereço e por status "published". Nada daqui devolve rascunho.
 */

export type PortalAccount = { accountId: string; username: string };

/** Conta dona do portal, pelo nome de usuário do endereço. */
export const portalAccount = cache(async (raw: string): Promise<PortalAccount | null> => {
  const username = raw.replace(/^@/, "").toLowerCase();
  if (!isPortalUsername(username)) return null;
  // O nome não é único no banco (uma conta desconectada pode ter deixado um nome antigo): vale a mais recente.
  const { data, error } = await createAdminClient().from("instagram_accounts").select("id, username")
    .eq("username", username).order("updated_at", { ascending: false }).limit(1);
  if (error) throw new Error(`Falha ao ler a conta do portal: ${error.message}`);
  const row = data?.[0];
  return row ? { accountId: row.id as string, username: row.username as string } : null;
});

// A biblioteca não carrega os blocos: o conteúdo dos exclusivos não sai do banco só para montar a lista.
const CARD_COLUMNS = "id, slug, title, description, cover_path, visibility, status, cta_post, cta_keyword, published_at, created_at, updated_at";

/** Materiais publicados da conta, do mais recente para o mais antigo, sem os blocos. */
export async function portalLibrary(accountId: string): Promise<Material[]> {
  const { data, error } = await createAdminClient().from("materials").select(CARD_COLUMNS)
    .eq("account_id", accountId).eq("status", "published").order("published_at", { ascending: false });
  if (error) throw new Error(`Falha ao ler a biblioteca: ${error.message}`);
  return (data ?? []).map(toMaterial);
}

/** Um material publicado, pelo endereço. */
export const portalMaterial = cache(async (accountId: string, slug: string): Promise<Material | null> => {
  if (!SLUG_RE.test(slug)) return null;
  const { data, error } = await createAdminClient().from("materials").select("*")
    .eq("account_id", accountId).eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw new Error(`Falha ao ler o material: ${error.message}`);
  return data ? toMaterial(data) : null;
});

/** Endereços temporários (1 hora) para capas e imagens da conta. O que falhar fica de fora. */
export async function portalUrls(accountId: string, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(paths.filter((p) => ownsMaterialFile(accountId, p)).map(async (p) => {
    try { out[p] = await signedUrl(p, 3600e3); } catch (e) { console.error("[portal] falha ao assinar", p, e); }
  }));
  return out;
}
```

- [ ] **Step 2: Layout e cabeçalho**

Crie `app/(portal)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import "../painel/painel.css";
import "../_portal/portal.css";

/** Portal de materiais: páginas públicas, sem menu nem login do painel. */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <div className="pn pt">{children}</div>;
}
```

Crie `app/(portal)/_components/portal-head.tsx`:

```tsx
import Link from "next/link";
import { initials } from "@/app/painel/_components/icons";

/** Topo do portal: de quem é e, na página de um material, o caminho de volta para a biblioteca. */
export function PortalHead({ username, back }: { username: string; back?: boolean }) {
  return (
    <header className="pt-head">
      <span className="pt-avatar" aria-hidden>{initials(username)}</span>
      <span style={{ minWidth: 0 }}>
        <span className="pt-head-name" style={{ display: "block" }}>@{username}</span>
        <a className="pt-head-sub" href={`https://www.instagram.com/${username}/`} target="_blank" rel="noopener noreferrer">Ver no Instagram</a>
      </span>
      {back && <Link className="pt-back" href={`/m/${username}`}>Todos os materiais</Link>}
    </header>
  );
}
```

A spec fala em mostrar a foto da conta. Nesta etapa o topo mostra as iniciais: a foto do Instagram vem da API com um endereço que expira, e buscá-la a cada visita gastaria o limite de chamadas da conta. Fica registrado como pendência na Task 7.

- [ ] **Step 3: Biblioteca**

Crie `app/(portal)/m/[conta]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { portalAccount, portalLibrary, portalUrls } from "@/lib/portal";
import { PRODUCT } from "@/config/site";
import { PortalHead } from "../../_components/portal-head";

// Os endereços das capas são assinados e expiram: a página não pode ficar em cache.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ conta: string }>; searchParams: Promise<{ aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const account = await portalAccount((await params).conta);
  if (!account) return { title: PRODUCT.name, robots: { index: false } };
  return { title: `Materiais de @${account.username}`, description: `Guias, prompts e arquivos de @${account.username}.` };
}

export default async function Biblioteca({ params, searchParams }: Props) {
  const [{ conta }, sp] = await Promise.all([params, searchParams]);
  const account = await portalAccount(conta);
  if (!account) notFound();
  const items = await portalLibrary(account.accountId);
  const urls = await portalUrls(account.accountId, items.flatMap((m) => (m.coverPath ? [m.coverPath] : [])));

  return (
    <main className="pt-wrap" style={{ maxWidth: 960 }}>
      <PortalHead username={account.username} />
      {sp.aviso === "material" && <div className="pt-notice" role="status">Esse material não está mais disponível. Veja os outros abaixo.</div>}
      <h1 className="pt-title">Materiais</h1>
      <p className="pt-desc">Tudo o que @{account.username} compartilha por aqui.</p>

      {items.length ? (
        <div className="pt-grid">
          {items.map((m) => (
            <Link key={m.id} href={`/m/${account.username}/${m.slug}`} className="pt-card">
              <span className="pt-card-cover">
                {m.coverPath && urls[m.coverPath] ? <img src={urls[m.coverPath]} alt="" loading="lazy" /> : <span>{m.visibility === "exclusive" ? "Exclusivo" : "Material"}</span>}
              </span>
              <span className="pt-card-body">
                <span className="pt-card-title">{m.title}</span>
                {m.description && <span className="pt-card-desc">{m.description}</span>}
                {m.visibility === "exclusive" && (
                  <span className="pt-card-lock">
                    {m.ctaKeyword ? `Exclusivo: comente ${m.ctaKeyword} para receber` : "Exclusivo: enviado no direct"}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="pt-empty" style={{ marginTop: 24 }}>Ainda não há materiais publicados.</div>
      )}
    </main>
  );
}
```

Crie `app/(portal)/m/[conta]/not-found.tsx`:

```tsx
import Link from "next/link";

export default function PortalNaoEncontrado() {
  return (
    <main className="pt-wrap">
      <h1 className="pt-title">Página não encontrada</h1>
      <p className="pt-desc">Esse endereço não existe ou mudou. Confira o link que você recebeu.</p>
      <p style={{ marginTop: 20 }}><Link href="/">Ir para a página inicial</Link></p>
    </main>
  );
}
```

- [ ] **Step 4: Página do material**

Crie `app/(portal)/m/[conta]/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BlocksView } from "@/app/_portal/blocks";
import { materialFiles, portalView } from "@/lib/material";
import { portalAccount, portalMaterial, portalUrls } from "@/lib/portal";
import { PRODUCT } from "@/config/site";
import { PortalHead } from "../../../_components/portal-head";

// Os endereços das imagens são assinados e expiram: a página não pode ficar em cache.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ conta: string; slug: string }>; searchParams: Promise<{ aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { conta, slug } = await params;
  const account = await portalAccount(conta);
  const material = account ? await portalMaterial(account.accountId, slug) : null;
  if (!account || !material) return { title: PRODUCT.name, robots: { index: false } };
  return {
    title: `${material.title} · @${account.username}`,
    description: material.description || undefined,
    // Material exclusivo não deve aparecer em buscador.
    robots: material.visibility === "exclusive" ? { index: false } : undefined,
  };
}

export default async function PaginaDoMaterial({ params, searchParams }: Props) {
  const [{ conta, slug }, sp] = await Promise.all([params, searchParams]);
  const account = await portalAccount(conta);
  if (!account) notFound();
  const material = await portalMaterial(account.accountId, slug);
  const view = material ? portalView(material) : null;
  // Endereço de material que não existe, foi excluído ou voltou para rascunho: leva à biblioteca com um aviso.
  if (!view) redirect(`/m/${account.username}?aviso=material`);

  if (view.locked) {
    const urls = await portalUrls(account.accountId, view.coverPath ? [view.coverPath] : []);
    return (
      <main className="pt-wrap">
        <PortalHead username={account.username} back />
        <h1 className="pt-title">{view.title}</h1>
        {view.description && <p className="pt-desc">{view.description}</p>}
        {view.coverPath && urls[view.coverPath] && <img className="pt-cover" src={urls[view.coverPath]} alt="" />}
        <div className="pt-lock">
          <div className="pt-lock-title">Este material é exclusivo</div>
          {view.ctaKeyword ? (
            <p>
              Comente <strong>{view.ctaKeyword}</strong> {view.ctaPost ? "neste post" : `em um post de @${account.username}`} para receber o link no direct.
            </p>
          ) : (
            <p>Ele é enviado no direct para quem participa das publicações de @{account.username}.</p>
          )}
          {view.ctaPost && <a className="pn-btn is-primary" href={view.ctaPost} target="_blank" rel="noopener noreferrer">Abrir o post</a>}
          <p><Link href={`/m/${account.username}`}>Ver os outros materiais</Link></p>
        </div>
      </main>
    );
  }

  const m = view.material;
  // Só capa e imagens precisam de endereço para mostrar; os arquivos saem pela rota de download.
  const urls = await portalUrls(account.accountId, materialFiles(m).filter((p) => p.endsWith(".jpg")));
  return (
    <main className="pt-wrap">
      <PortalHead username={account.username} back />
      {sp.aviso === "arquivo" && <div className="pt-notice" role="status">Esse arquivo está indisponível no momento. Tente de novo mais tarde.</div>}
      <article>
        <h1 className="pt-title">{m.title}</h1>
        {m.description && <p className="pt-desc">{m.description}</p>}
        {m.coverPath && urls[m.coverPath] && <img className="pt-cover" src={urls[m.coverPath]} alt="" />}
        <BlocksView blocks={m.blocks} urls={urls} fileHref={(id) => `/m/${account.username}/${m.slug}/arquivo/${id}`} />
      </article>
    </main>
  );
}
```

`redirect()` dentro de um Server Component encerra a renderização (o TypeScript trata como `never`), então depois do `if (!view) redirect(...)` a variável `view` é não nula. Se o typecheck não estreitar o tipo, acrescente `return null;` logo depois da chamada.

- [ ] **Step 5: Download**

Crie `app/(portal)/m/[conta]/[slug]/arquivo/[blockId]/route.ts`:

```ts
import { head } from "@vercel/blob";
import { downloadTarget, ownsMaterialFile } from "@/lib/material";
import { signedUrl } from "@/lib/media-store";
import { portalAccount, portalMaterial } from "@/lib/portal";
import { RATE_MESSAGE, allowKey, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download de um bloco de arquivo. Confere que o material está publicado e que o visitante pode abrir
 * (nesta etapa: só os públicos), e então redireciona para um link assinado que vale 5 minutos.
 */
export async function GET(req: Request, { params }: { params: Promise<{ conta: string; slug: string; blockId: string }> }) {
  const { conta, slug, blockId } = await params;
  if (!(await allowKey(`portal-dl:${await clientIp()}`, { limit: 60, windowSec: 600 }))) return new Response(RATE_MESSAGE, { status: 429 });

  const account = await portalAccount(conta);
  const material = account ? await portalMaterial(account.accountId, slug) : null;
  const target = material ? downloadTarget(material, blockId) : null;
  if (!account || !target || !ownsMaterialFile(account.accountId, target.path)) return new Response("Arquivo não encontrado.", { status: 404 });

  try {
    await head(target.path); // lança se o arquivo sumiu do armazenamento
    return Response.redirect(await signedUrl(target.path, 5 * 60e3), 302);
  } catch (e) {
    console.error("[portal] arquivo indisponível", target.path, e);
    return Response.redirect(new URL(`/m/${account.username}/${slug}?aviso=arquivo`, req.url), 302);
  }
}
```

Confira em `node_modules/@vercel/blob/dist/index.d.ts` a assinatura de `head` (`head(urlOrPathname: string, options?)`) e como `lib/media-store.ts` chama `signedUrl` para a loja privada. Se `head` exigir alguma opção para loja privada na versão instalada, passe-a; se não houver como checar a existência, remova a chamada e deixe só o redirecionamento.

- [ ] **Step 6: Verificar**

Run: `npm run typecheck && npm test && npm run build`
Expected: tudo limpo, e o resumo do build lista as rotas `/m/[conta]`, `/m/[conta]/[slug]` e `/m/[conta]/[slug]/arquivo/[blockId]` como dinâmicas.

Depois, com `npm run dev` e o material publicado na Task 5 (troque `CONTA` pelo nome de usuário da conta do seed, visível no topo do painel):

1. `http://localhost:3000/m/CONTA` em janela anônima. Expected: a biblioteca abre sem pedir login e mostra o material publicado.
2. Clique no material. Expected: título, texto formatado, prompt com botão "Copiar" e lista de links.
3. No painel, mude o material para Exclusivo com a palavra "CONTADOR" e salve publicado. Recarregue a página pública. Expected: "Este material é exclusivo" e "Comente CONTADOR…", **sem** nenhum bloco. Confira no código-fonte da página (Ver código-fonte) que o texto do prompt não aparece.
4. Volte o material para rascunho. Recarregue. Expected: redireciona para `/m/CONTA?aviso=material` com o aviso "Esse material não está mais disponível."
5. `http://localhost:3000/m/conta-que-nao-existe` e `http://localhost:3000/m/CONTA%2F..%2Fpainel`. Expected: "Página não encontrada", sem erro 500.
6. `http://localhost:3000/m/CONTA/ENDERECO/arquivo/xyz` com o material público. Expected: "Arquivo não encontrado." (404).
7. Reduza a janela para 375 px de largura. Expected: nada estoura a largura; botões com área de toque confortável.

- [ ] **Step 7: Commit**

```bash
git add lib/portal.ts "app/(portal)"
git commit -m "Portal de materiais: biblioteca, página do material e download

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Isolamento entre contas, revisões e fechamento

**Files:**
- Modify: `tests/isolation.test.ts`
- Modify: `docs/superpowers/specs/2026-10-08-portal-materiais-design.md`
- Modify: `README.md` (se houver seção de variáveis ou de estrutura que liste os módulos do painel)

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: nada novo.

- [ ] **Step 1: Escrever o teste de isolamento**

Em `tests/isolation.test.ts`, acrescente aos imports:

```ts
import { listMaterials, removeMaterial, saveMaterial, type MaterialDeps, type MaterialInput } from "@/lib/materials";
```

E, dentro do `describe("isolamento entre contas", ...)`, depois do último `it`:

```ts
  it("cada conta só vê, edita e exclui os próprios materiais; o mesmo endereço pode existir nas duas", async () => {
    setAccountForTests(null);
    setStoreForTests(new MemoryStore());
    const a = account("111", []);
    const b = account("222", []);
    const mdeps: MaterialDeps = { deleteFiles: vi.fn(async () => {}), now: () => NOW };
    const input = (title: string, over: Partial<MaterialInput> = {}): MaterialInput => ({
      title, slug: "guia", description: "", coverPath: null, blocks: [{ id: "t1", type: "text", markdown: title }],
      visibility: "public", ctaPost: "", ctaKeyword: "", ...over,
    });

    const inA = await withAccount(a, () => saveMaterial(input("Guia da conta A"), "published", mdeps));
    const inB = await withAccount(b, () => saveMaterial(input("Guia da conta B"), "published", mdeps));
    expect(inA.ok && inB.ok).toBe(true);
    if (!inA.ok || !inB.ok) return;

    expect((await withAccount(a, listMaterials)).map((m) => m.title)).toEqual(["Guia da conta A"]);
    expect((await withAccount(b, listMaterials)).map((m) => m.title)).toEqual(["Guia da conta B"]);

    // A conta B tenta editar e excluir o material da A pelo id: não encontra.
    const edit = await withAccount(b, () => saveMaterial({ ...input("Invadido", { slug: "outro" }), id: inA.material.id }, "published", mdeps));
    expect(edit.ok).toBe(false);
    expect((await withAccount(b, () => removeMaterial(inA.material.id, mdeps))).ok).toBe(false);

    // A conta B tenta usar um arquivo da pasta da A.
    const steal = await withAccount(b, () => saveMaterial(input("Com arquivo alheio", {
      slug: "roubo", blocks: [{ id: "f1", type: "file", path: "materials/acc-111/guia.pdf", name: "guia.pdf", size: 10, description: "" }],
    }), "draft", mdeps));
    expect(steal.ok).toBe(false);

    expect((await withAccount(a, listMaterials)).map((m) => m.title)).toEqual(["Guia da conta A"]);
    expect(mdeps.deleteFiles).not.toHaveBeenCalled();
  });
```

O `MemoryRepo` gera um id aleatório por material (Task 3), então o id da conta A não existe na conta B: é isso que o teste confere.

- [ ] **Step 2: Rodar**

Run: `npm test`
Expected: todos PASS, incluindo o teste novo e os de `tests/materials.test.ts` (que não dependem do formato do id).

- [ ] **Step 3: Revisão de segurança**

Acione o agente `revisor-seguranca` com este recorte: "Revise a branch `portal-materiais` contra `main` (`git diff main...portal-materiais`). Foco: (1) vazamento de conteúdo de material exclusivo ou em rascunho pelas rotas `/m/...` e pela rota de download; (2) acesso a material ou arquivo de outra conta nas ações de `app/painel/materiais/actions.ts` e em `lib/portal.ts`, que usa a chave de serviço; (3) XSS pelo Markdown (`lib/markdown.ts`, `dangerouslySetInnerHTML` em `app/_portal/blocks.tsx`) e pelos links da lista; (4) envio de arquivos em `app/api/uploads/route.ts`; (5) a migração `supabase/migrations/20261008000000_materials.sql` (RLS e grants)." Corrija o que ele apontar como médio ou alto, com teste quando for regra de negócio. Registre os achados baixos que ficarem para depois no Step 5.

- [ ] **Step 4: Revisão de texto**

Acione o agente `revisor-texto-ptbr` sobre os arquivos novos de `app/painel/materiais`, `app/(portal)`, `app/_portal` e as mensagens de `lib/material.ts` e `lib/materials.ts`. Aplique as correções de ortografia, acentuação e consistência (por exemplo: sempre "material", "endereço", "exclusivo", "rascunho"). Se alguma mensagem testada mudar, atualize o teste correspondente e rode `npm test`.

- [ ] **Step 5: Atualizar a spec com o que mudou na execução**

Em `docs/superpowers/specs/2026-10-08-portal-materiais-design.md`:

1. Na tabela de `materials`, troque a linha `| \`account_id\`, \`id\` | Chave primária composta, como em \`automations\` |` por `| \`id\`, \`account_id\` | \`id\` uuid gerado pelo banco, como em \`scheduled_posts\` |`.
2. Na seção "Erros", troque o item "Endereço de conta ou material inexistente: página 404 do portal, com link para a biblioteca quando a conta existir." por "Conta inexistente: página 404 do portal. Material inexistente, excluído ou em rascunho numa conta que existe: redireciona para a biblioteca com um aviso."
3. Na seção "Experiência → Visitante", troque "com o nome de usuário e a foto da conta" por "com o nome de usuário da conta (as iniciais no lugar da foto; a foto do Instagram fica como pendência)".
4. No fim do arquivo, acrescente uma seção `## Pendências da etapa 1` com: a foto do perfil no topo do portal; e os achados de severidade baixa da revisão de segurança que não foram corrigidos (se não houver nenhum, escreva "Nenhum achado pendente da revisão de segurança.").

Se o `README.md` tiver uma lista das áreas do painel ou das tabelas do banco, acrescente Materiais e `materials` no mesmo formato. Se não tiver, não crie.

- [ ] **Step 6: Verificação final**

Run: `npm run typecheck && npm test && npm run build`
Expected: tudo limpo.

Run: `git status --short && git log --oneline main..portal-materiais`
Expected: só os arquivos deste plano alterados; `.claude/settings.json` e `example/` continuam fora do Git, como estavam.

- [ ] **Step 7: Commit**

```bash
git add tests/isolation.test.ts docs/superpowers/specs/2026-10-08-portal-materiais-design.md
git add -u
git commit -m "Materiais: teste de isolamento entre contas e correções das revisões

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Publicação (só com a confirmação do Bruno)

Nada desta seção é feito pelo executor por conta própria. Cada passo altera a produção.

1. **Aplicar a migração em produção.** `psql "$(grep '^POSTGRES_URL_NON_POOLING=' .env.local | cut -d= -f2-)" -v ON_ERROR_STOP=1 -f supabase/migrations/20261008000000_materials.sql`. A migração só cria uma tabela nova; não mexe nas existentes.
2. **Publicar.** Merge de `portal-materiais` no `main` e push (o push publica na Vercel).
3. **Conferir o que não dá para testar no local**, no painel de produção, com um material de teste em rascunho e depois público:
   - enviar capa, imagem e um PDF; conferir a pré-visualização;
   - abrir `/m/d.ia.riamente/{endereço}` no celular, pelo navegador do Instagram: imagens aparecem, "Copiar" funciona, "Baixar" entrega o PDF;
   - excluir o material de teste e conferir que os arquivos saíram do Blob.
4. **Trocar os links do Notion.** Recriar os materiais no portal e, em cada automação, trocar o campo de link pelo endereço `/m/d.ia.riamente/{endereço}`. O rastreamento de quem abriu só começa na etapa 2.
5. Depois da migração aplicada em produção, `npm run db:seed` volta a funcionar no ambiente local.
