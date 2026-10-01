"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  CAPTION_MAX, CAROUSEL_MAX, HASHTAGS_MAX, KIND_LABEL, MIN_LEAD_MS, countHashtags, kindFor, ratioOk, validatePost,
  type PostMedia, type ScheduledPost,
} from "@/lib/posts";
import { savePostAction } from "./actions";
import { ConfirmModal, Icon, useToast } from "../_components/ui";
import { ICONS } from "../_components/icons";
import { DateTimePicker } from "../_components/datetime-picker";

type Item = { key: string; path?: string; url: string; width: number; height: number; size: number; uploading?: boolean; error?: string };
type AutoMode = "none" | "new" | "existing";

const MAX_SIDE = 1440;

/** Lê qualquer imagem que o navegador abre, reduz para no máximo 1440 px e converte para JPEG. */
async function toJpeg(file: File): Promise<{ blob: Blob; width: number; height: number }> {
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

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function PostEditor({ post, previews, prefix, username, automations, templates, initialWhen }: {
  post?: ScheduledPost;
  /** Data e hora vindas do calendário ("AAAA-MM-DDTHH:MM", horário local), para uma publicação nova. */
  initialWhen?: string;
  previews: Record<string, string>;
  prefix: string;
  username?: string;
  automations: { id: string; name: string }[];
  templates: { id: string; name: string; desc: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [story, setStory] = useState(post?.kind === "story");
  const [items, setItems] = useState<Item[]>(() => (post?.media ?? []).map((m) => ({ key: m.path, path: m.path, url: previews[m.path] ?? "", width: m.width, height: m.height, size: m.size })));
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [when, setWhen] = useState(() => (!post && initialWhen) ? initialWhen : toLocalInput(post?.scheduledAt ?? (Math.ceil(Date.now() / 3600e3) + 1) * 3600e3));
  const [mode, setMode] = useState<AutoMode>(post?.automationId ? "existing" : "none");
  const [existing, setExisting] = useState(post?.automationId ?? automations[0]?.id ?? "");
  const [keyword, setKeyword] = useState("");
  const [link, setLink] = useState("");
  const [template, setTemplate] = useState(templates[0]?.id ?? "");
  const [issues, setIssues] = useState<{ field: string; message: string }[]>([]);
  const [askNow, setAskNow] = useState(false);
  const [current, setCurrent] = useState(0);
  const [pending, start] = useTransition();

  const kind = kindFor(story, items.length);
  const uploading = items.some((i) => i.uploading);
  const scheduledAt = when ? new Date(when).getTime() : null;
  const media: PostMedia[] = items.filter((i) => i.path).map((i) => ({ path: i.path!, width: i.width, height: i.height, size: i.size }));
  const tags = countHashtags(caption);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = story ? 1 - items.length : CAROUSEL_MAX - items.length;
    const list = [...files].slice(0, Math.max(0, room));
    if (!list.length) return toast(story ? "Story tem uma imagem só." : `Carrossel aceita até ${CAROUSEL_MAX} imagens.`, "amber");
    for (const file of list) {
      const key = crypto.randomUUID();
      setItems((xs) => [...xs, { key, url: "", width: 0, height: 0, size: 0, uploading: true }]);
      try {
        const { blob, width, height } = await toJpeg(file);
        const url = URL.createObjectURL(blob);
        setItems((xs) => xs.map((x) => (x.key === key ? { ...x, url, width, height, size: blob.size } : x)));
        const res = await upload(`${prefix}${key}.jpg`, blob, { access: "private", handleUploadUrl: "/api/uploads", contentType: "image/jpeg" });
        setItems((xs) => xs.map((x) => (x.key === key ? { ...x, path: res.pathname, uploading: false } : x)));
      } catch (e) {
        setItems((xs) => xs.map((x) => (x.key === key ? { ...x, uploading: false, error: e instanceof Error ? e.message : "Falha no envio." } : x)));
      }
    }
  };
  const move = (i: number, d: -1 | 1) => setItems((xs) => { const ys = [...xs]; const j = i + d; if (j < 0 || j >= ys.length) return xs; [ys[i], ys[j]] = [ys[j], ys[i]]; return ys; });
  const remove = (i: number) => { setItems((xs) => xs.filter((_, k) => k !== i)); setCurrent(0); };

  const automation = mode === "none" ? { mode: "none" as const }
    : mode === "existing" ? { mode: "existing" as const, id: existing }
    : { mode: "new" as const, keyword: keyword.trim(), link: link.trim(), template };

  const submit = (action: "draft" | "schedule" | "now") => {
    const local = validatePost({ kind, caption: story ? "" : caption, media, scheduledAt: action === "now" ? Date.now() + 3600e3 : scheduledAt }, { schedule: action !== "draft" });
    if (items.some((i) => i.error)) local.push({ field: "media", message: "Remova as imagens que falharam no envio." });
    if (action !== "draft" && mode === "new" && !keyword.trim()) local.push({ field: "media", message: "Informe a palavra-chave da automação, ou escolha “Nenhuma”." });
    if (local.length) { setIssues(local); return; }
    start(async () => {
      const r = await savePostAction({ id: post?.id, story, caption, media, scheduledAt, automation }, action);
      setAskNow(false);
      if (!r.ok) { setIssues(r.issues ?? [{ field: "media", message: r.error ?? "Não foi possível salvar." }]); return; }
      setIssues([]);
      toast(action === "draft" ? "Rascunho salvo" : action === "now" ? "Publicando agora" : "Publicação agendada");
      // Agendou ou publicou: volta para o calendário. Rascunho: continua na publicação para seguir editando.
      router.push(action === "draft" ? `/painel/publicacoes/${r.post.id}` : "/painel/publicacoes");
      router.refresh();
    });
  };

  const preview = items[Math.min(current, items.length - 1)];
  const ratio = preview?.width ? Math.max(4 / 5, Math.min(1.91, preview.width / preview.height)) : 4 / 5;

  return (
    <div className="pn-post-editor">
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <section className="pn-card">
          <div className="pn-row">
            <div className="pn-card-title">Onde publicar</div>
            <div className="pn-seg pn-spacer" role="tablist" aria-label="Formato">
              <button type="button" role="tab" aria-selected={!story} className={!story ? "is-on" : ""} onClick={() => setStory(false)}>Feed</button>
              <button type="button" role="tab" aria-selected={story} className={story ? "is-on" : ""} onClick={() => { setStory(true); setItems((xs) => xs.slice(0, 1)); }}>Story</button>
            </div>
          </div>
          <div className="pn-help" style={{ marginTop: 8 }}>
            {story ? "Story: uma imagem vertical (9:16 é o ideal), sem legenda." : "Uma imagem vira post; duas ou mais viram carrossel (até 10). Proporção de 4:5 a 1,91:1."}
          </div>

          <div className="pn-media-grid" style={{ marginTop: 12 }}>
            {items.map((it, i) => (
              <div key={it.key} className={`pn-media-tile${story ? " is-story" : ""}${it.error || (it.width && !ratioOk(kind, it)) ? " is-bad" : ""}`}>
                {it.url ? <img src={it.url} alt={`Imagem ${i + 1}`} /> : <span className="pn-spinner" />}
                {it.uploading && <span className="pn-media-state">Enviando…</span>}
                {it.error && <span className="pn-media-state is-bad" title={it.error}>Falhou</span>}
                {!it.uploading && !it.error && it.width > 0 && !ratioOk(kind, it) && <span className="pn-media-state is-bad">Proporção</span>}
                <div className="pn-media-tools">
                  {!story && <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover para a esquerda">←</button>}
                  {!story && <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Mover para a direita">→</button>}
                  <button type="button" onClick={() => remove(i)} aria-label={`Remover imagem ${i + 1}`}>×</button>
                </div>
              </div>
            ))}
            {items.length < (story ? 1 : CAROUSEL_MAX) && (
              <button type="button" className={`pn-media-add${story ? " is-story" : ""}`} onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void addFiles(e.dataTransfer.files); }}>
                <Icon d={ICONS.plus} size={18} width={2} />
                <span>{items.length ? "Adicionar" : "Enviar imagem"}</span>
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple={!story} hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          {items.find((i) => i.error) && <div className="pn-error-text">{items.find((i) => i.error)!.error}</div>}
        </section>

        {!story && (
          <section className="pn-card">
            <label className="pn-card-title" htmlFor="caption">Legenda</label>
            <textarea id="caption" className="pn-textarea" rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} style={{ marginTop: 10 }}
              placeholder="Escreva a legenda. Se tiver automação, diga qual palavra comentar para receber o material." />
            <div className="pn-row" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6, gap: 14 }}>
              <span className="pn-num" style={{ color: caption.length > CAPTION_MAX ? "var(--red-text)" : undefined }}>{caption.length}/{CAPTION_MAX} caracteres</span>
              <span className="pn-num" style={{ color: tags > HASHTAGS_MAX ? "var(--red-text)" : undefined }}>{tags}/{HASHTAGS_MAX} hashtags</span>
            </div>
          </section>
        )}

        <section className="pn-card">
          <label className="pn-card-title" htmlFor="when">Quando</label>
          <div style={{ marginTop: 10 }}><DateTimePicker id="when" value={when} onChange={setWhen} min={Date.now() + MIN_LEAD_MS} /></div>
          <div className="pn-help">No horário do seu computador. A mídia é preparada 10 minutos antes; até lá dá para editar ou cancelar.</div>
        </section>

        <section className="pn-card">
          <div className="pn-card-title">Automação deste post</div>
          <div className="pn-help" style={{ marginTop: 4 }}>Ela começa a responder no instante em que o post sair.</div>
          <div className="pn-seg" role="tablist" aria-label="Automação" style={{ marginTop: 10, width: "fit-content" }}>
            <button type="button" role="tab" aria-selected={mode === "none"} className={mode === "none" ? "is-on" : ""} onClick={() => setMode("none")}>Nenhuma</button>
            <button type="button" role="tab" aria-selected={mode === "new"} className={mode === "new" ? "is-on" : ""} onClick={() => setMode("new")}>Criar nova</button>
            <button type="button" role="tab" aria-selected={mode === "existing"} className={mode === "existing" ? "is-on" : ""} onClick={() => setMode("existing")} disabled={!automations.length}>Usar rascunho</button>
          </div>
          {mode === "new" && (
            <div className="pn-auto-grid">
              <div><label className="pn-field-label" htmlFor="kw">Palavra-chave</label><input id="kw" className="pn-input" value={keyword} onChange={(e) => setKeyword(e.target.value.toUpperCase())} placeholder="GUIA" /></div>
              <div><label className="pn-field-label" htmlFor="lk">Link do material</label><input id="lk" className="pn-input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="pn-field-label" htmlFor="tpl">Fluxo</label>
                <select id="tpl" className="pn-select" value={template} onChange={(e) => setTemplate(e.target.value)}>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}: {t.desc}</option>)}
                </select>
                <div className="pn-help">Dá para ajustar o fluxo depois, em Automações.</div>
              </div>
            </div>
          )}
          {mode === "existing" && (
            <div style={{ marginTop: 12 }}>
              <select className="pn-select" value={existing} onChange={(e) => setExisting(e.target.value)} aria-label="Automação em rascunho">
                {automations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <div className="pn-help">Aparecem as automações pausadas e sem post. Ela será ativada quando o post sair.</div>
            </div>
          )}
        </section>

        {issues.length > 0 && (
          <div className="pn-alert is-red" role="alert">
            <Icon d={ICONS.error} size={17} color="var(--red)" width={1.8} style={{ marginTop: 1 }} />
            <div>{issues.map((i, k) => <div key={k} className="pn-alert-body" style={{ color: "var(--red-title)" }}>{i.message}</div>)}</div>
          </div>
        )}

        <div className="pn-row" style={{ gap: 8 }}>
          <button type="button" className="pn-btn is-primary" disabled={pending || uploading} onClick={() => submit("schedule")}>
            {post?.status === "scheduled" ? "Salvar e manter agendada" : "Agendar"}
          </button>
          <button type="button" className="pn-btn" disabled={pending || uploading} onClick={() => submit("draft")}>Salvar rascunho</button>
          <button type="button" className="pn-btn pn-spacer" disabled={pending || uploading} onClick={() => setAskNow(true)}>Publicar agora</button>
        </div>
      </div>

      <aside className="pn-post-preview" aria-label="Pré-visualização">
        <div className="pn-section-label">Pré-visualização</div>
        <div className={`pn-ig${story ? " is-story" : ""}`}>
          {!story && <div className="pn-ig-head"><span className="pn-avatar-grad" style={{ width: 26, height: 26, fontSize: 10 }}>{(username ?? "?")[0]?.toUpperCase()}</span><b>{username ?? "seu_perfil"}</b></div>}
          <div className="pn-ig-media" style={{ aspectRatio: story ? "9 / 16" : String(ratio) }}>
            {preview?.url ? <img src={preview.url} alt="" /> : <span className="pn-muted" style={{ fontSize: 12 }}>A imagem aparece aqui</span>}
            {items.length > 1 && (
              <>
                <button type="button" className="pn-ig-nav is-left" onClick={() => setCurrent((c) => Math.max(0, c - 1))} aria-label="Anterior">‹</button>
                <button type="button" className="pn-ig-nav is-right" onClick={() => setCurrent((c) => Math.min(items.length - 1, c + 1))} aria-label="Próxima">›</button>
                <div className="pn-ig-dots">{items.map((_, i) => <span key={i} className={i === Math.min(current, items.length - 1) ? "is-on" : ""} />)}</div>
              </>
            )}
          </div>
          {!story && <div className="pn-ig-caption"><b>{username ?? "seu_perfil"}</b> {caption || <span className="pn-muted">sua legenda</span>}</div>}
        </div>
        <div className="pn-help" style={{ textAlign: "center" }}>{KIND_LABEL[kind]}{items.length > 1 ? ` com ${items.length} imagens` : ""}</div>
      </aside>

      {askNow && (
        <ConfirmModal
          title="Publicar agora?"
          body="O post vai para o seu perfil em cerca de um minuto. Depois de publicado, só dá para apagar pelo Instagram."
          confirmLabel="Publicar agora"
          busy={pending}
          onConfirm={() => submit("now")}
          onClose={() => setAskNow(false)}
        />
      )}
    </div>
  );
}
