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
