"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { BlocksView } from "@/app/_portal/blocks";
import "@/app/_portal/portal.css";
import {
  BLOCK_META, CTA_KEYWORD_MAX, DESCRIPTION_MAX, FILE_MAX_BYTES, FILE_TYPES, LINKS_MAX, MAX_BLOCKS, TITLE_MAX,
  blankBlock, fileExt, fileTypeMessage, fileTypesText, formatBytes, slugify, validateMaterial,
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
      if (!contentType) throw new Error(`“${file.name}”: ${fileTypeMessage().replace(/^Esse/, "esse")}`);
      if (file.size > FILE_MAX_BYTES) throw new Error("O arquivo passa de 25 MB.");
      // Pasta com UUID evita colisão e deixa o nome legível no download.
      const base = slugify(file.name.replace(/\.[^.]*$/, "")) || "arquivo";
      const res = await upload(`${prefix}${crypto.randomUUID()}/${base}.${ext}`, file, {
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
      let r;
      try { r = await saveMaterialAction({ ...draft, id: material?.id }, status); } catch {
        toast("Não foi possível salvar. Confira a conexão e tente de novo.", "red");
        return;
      }
      if (!r.ok) { setIssues(r.issues ?? [{ field: "title", message: r.error ?? "Não foi possível salvar." }]); return; }
      setIssues([]);
      toast(status === "published" ? "Material publicado" : published ? "Material voltou para rascunho" : "Rascunho salvo", status === "published" ? "green" : undefined);
      router.push(`/painel/materiais/${r.material.id}`);
      router.refresh();
    });
  };

  const destroy = () => start(async () => {
    if (!material) return;
    let r;
    try { r = await deleteMaterialAction(material.id); } catch {
      setAskDelete(false);
      return toast("Não foi possível excluir. Confira a conexão e tente de novo.", "red");
    }
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
              : "Aparece na biblioteca como exclusivo, com o convite para comentar no post, mas por enquanto ninguém consegue abrir: a liberação por link pessoal ainda não existe."}
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
                <span className="pn-help" style={{ display: "block" }}>Os dois campos são opcionais. Com a palavra e o link preenchidos, o material exclusivo mostra “Comente {ctaKeyword.trim() || "PALAVRA"} neste post para receber”.</span>
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
                <span className="pn-help">{fileTypesText()}, até 25 MB.</span>
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
            <BlocksView blocks={blocks} urls={urls} fileHref={() => null} preview />
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
          <input className="pn-input" value={it.url} onChange={(e) => set(i, { url: e.target.value })} placeholder="https://…" inputMode="url" aria-label={`URL do link ${i + 1}`} />
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
