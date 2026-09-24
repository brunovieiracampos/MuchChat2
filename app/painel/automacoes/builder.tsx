"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DM_MAX, normalizeInput, renderDm, validateAutomation, type AutomationInput, type Issue } from "@/lib/automation-input";
import { relTime } from "@/lib/format";
import { hasKeyword, postKey } from "@/lib/match";
import { deleteAutomationAction, saveAutomationAction } from "../actions";
import { Badge, ConfirmModal, Dot, Icon, Toggle, useToast } from "../_components/ui";
import { ICONS } from "../_components/icons";
import type { MediaOption, OtherAutomation } from "./builder-data";

type NodeId = "trigger" | "dm" | "reply";

const NODE_COLOR = { trigger: "#7C3AED", dm: "#A78BFA", reply: "#A78BFA", end: "#5F5F6E" };
const FIELD_NODE: Record<Issue["field"], NodeId | null> = { name: null, posts: "trigger", keywords: "trigger", link: "dm", dm: "dm", publicReplies: "reply" };

export function Builder({ initial, isNew, updatedAt, media, connected, others, defaultReplies }: {
  initial: AutomationInput;
  isNew?: boolean;
  updatedAt?: number;
  media: MediaOption[];
  connected: boolean;
  others: OtherAutomation[];
  defaultReplies: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<AutomationInput>(initial);
  const [saved, setSaved] = useState<AutomationInput>(initial);
  const [sel, setSel] = useState<NodeId>("trigger");
  const [showPath, setShowPath] = useState(false);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [askDelete, setAskDelete] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  // Numa automação nova, os erros só aparecem nos blocos depois da primeira tentativa de salvar.
  const [showErrors, setShowErrors] = useState(!isNew);
  const [pending, start] = useTransition();
  const testRef = useRef<HTMLTextAreaElement>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const clean = useMemo(() => normalizeInput(form), [form]);
  // Problemas para publicar (checagem completa), mostrados nos blocos o tempo todo.
  const publishIssues = useMemo(() => validateAutomation({ ...clean, active: true }, others), [clean, others]);
  const issues = serverIssues.length ? serverIssues : publishIssues;
  const nodeIssues = (n: NodeId) => (showErrors ? issues.filter((i) => FIELD_NODE[i.field] === n) : []);
  const nameIssue = showErrors && issues.find((i) => i.field === "name");

  const set = <K extends keyof AutomationInput>(k: K, v: AutomationInput[K]) => {
    setServerIssues([]);
    setForm((f) => ({ ...f, [k]: v }));
  };

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = (active: boolean) => start(async () => {
    setShowErrors(true);
    if (active && publishIssues.length) {
      const n = FIELD_NODE[publishIssues[0].field];
      if (n) setSel(n);
      return toast(publishIssues[0].message, "red");
    }
    const r = await saveAutomationAction({ ...form, active });
    if (!r.ok) {
      if (r.issues?.length) {
        setServerIssues(r.issues);
        const n = FIELD_NODE[r.issues[0].field];
        if (n) setSel(n);
        return toast(r.issues[0].message, "red");
      }
      return toast(r.error ?? "Não foi possível salvar", "red");
    }
    const next = { ...clean, id: r.id, active };
    setForm(next);
    setSaved(next);
    toast(active && !saved.active ? "Automação publicada e ativa" : active ? "Alterações salvas" : saved.active ? "Automação pausada" : "Rascunho salvo", active ? "green" : "amber");
    if (isNew) router.replace(`/painel/automacoes/${r.id}/editar`);
    else router.refresh();
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!pending && (dirty || isNew)) save(form.active);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const remove = () => start(async () => {
    const r = await deleteAutomationAction(form.id!);
    if (!r.ok) return toast(r.error ?? "Erro ao excluir", "red");
    setSaved(form);
    toast("Automação excluída", "amber");
    router.push("/painel/automacoes");
  });

  const anyPost = clean.posts.some((p) => postKey(p) === "*");
  const kwTitle = clean.keywords.length ? `Comentário contém ${clean.keywords.map((k) => `“${k}”`).join(" ou ")}` : "Defina a palavra-chave";
  const dmPreview = renderDm(clean, "usuario");
  const replies = clean.publicReplies.length ? clean.publicReplies : defaultReplies;

  const status = isNew && !form.id ? { label: "Rascunho", tone: "" } : saved.active ? { label: "Ativa", tone: "green" } : { label: "Pausada", tone: "amber" };

  return (
    <div className="pn-builder">
      <div className="pn-builder-bar">
        <Link href={form.id ? `/painel/automacoes/${form.id}` : "/painel/automacoes"} className="pn-link-back" aria-label="Voltar">←</Link>
        <div style={{ minWidth: 0 }}>
          <input className="pn-builder-name" value={form.name} onChange={(e) => set("name", e.target.value)} aria-label="Nome da automação"
            style={nameIssue ? { borderColor: "var(--red-line)" } : undefined} />
          <div style={{ fontSize: 11, color: "var(--muted)", paddingLeft: 6 }}>
            {dirty ? "Alterações não salvas" : updatedAt ? `Salvo ${relTime(updatedAt)}` : "Ainda não salvo"}
          </div>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
        {showErrors && publishIssues.length > 0 && (
          <span className="pn-badge is-red" title={publishIssues.map((i) => i.message).join("\n")}>
            {publishIssues.length} {publishIssues.length === 1 ? "problema impede" : "problemas impedem"} a publicação
          </span>
        )}
        <div className="pn-row pn-spacer" style={{ gap: 8 }}>
          <label className="pn-hide-sm" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--text-3)", cursor: "pointer" }}>
            <input type="checkbox" checked={showPath} onChange={() => setShowPath(!showPath)} style={{ accentColor: "#7C3AED", width: 14, height: 14 }} />
            Caminho de execução
          </label>
          {form.id && <button type="button" className="pn-btn is-danger" style={{ fontSize: 12, padding: "7px 12px" }} onClick={() => setAskDelete(true)}>Excluir</button>}
          <button type="button" className="pn-btn" style={{ fontSize: 12, padding: "7px 12px" }}
            onClick={() => { setShowPath(true); setTestOpen(true); requestAnimationFrame(() => testRef.current?.focus()); }}>Testar</button>
          {saved.active && form.id ? (
            <>
              <button type="button" className="pn-btn" style={{ fontSize: 12, padding: "7px 12px" }} disabled={pending} onClick={() => save(false)}>Pausar</button>
              <button type="button" className="pn-btn is-primary" style={{ fontSize: 12, padding: "7px 13px" }} disabled={pending || !dirty} onClick={() => save(true)}>
                {pending ? "Salvando…" : "Salvar alterações"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="pn-btn" style={{ fontSize: 12, padding: "7px 12px" }} disabled={pending || (!dirty && !isNew)} onClick={() => save(false)}>Salvar rascunho</button>
              <button type="button" className="pn-btn is-primary" style={{ fontSize: 12, padding: "7px 13px" }} disabled={pending}
                onClick={() => save(true)}>
                {pending ? "Publicando…" : "Publicar"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="pn-builder-body">
        {testOpen && <div className="pn-builder-backdrop" onClick={() => setTestOpen(false)} />}
        <aside className={`pn-builder-left${testOpen ? " is-open" : ""}`} aria-label="Teste">
          <button type="button" className="pn-close pn-builder-left-close" onClick={() => setTestOpen(false)} aria-label="Fechar teste">×</button>
          <TestPanel form={clean} replies={replies} testRef={testRef} anyPost={anyPost} />
        </aside>

        <div className="pn-canvas">
          <div className="pn-canvas-inner">
            <FlowNode id="trigger" sel={sel} onSelect={setSel} color={NODE_COLOR.trigger} type="Gatilho" title={kwTitle}
              sub={anyPost ? "Qualquer post ou Reels do perfil" : clean.posts.length ? `${clean.posts.length} post${clean.posts.length > 1 ? "s" : ""} selecionado${clean.posts.length > 1 ? "s" : ""}` : "Nenhum post escolhido"}
              issues={nodeIssues("trigger")} />
            <Edge hot={showPath} />
            <FlowNode id="dm" sel={sel} onSelect={setSel} color={NODE_COLOR.dm} type="Mensagem" title="Enviar Direct privado"
              sub={clean.dm ? dmPreview : "Escreva a mensagem"} issues={nodeIssues("dm")} />
            <Edge hot={showPath} label="se a DM for entregue" />
            <FlowNode id="reply" sel={sel} onSelect={setSel} color={NODE_COLOR.reply} type="Mensagem" title="Responder comentário"
              sub={clean.publicReplies.length ? `${clean.publicReplies.length} frase${clean.publicReplies.length > 1 ? "s" : ""}, uma sorteada por comentário` : `Frases padrão (${defaultReplies.length}), uma sorteada por comentário`}
              issues={nodeIssues("reply")} />
            <Edge hot={showPath} />
            <div className="pn-node" style={{ ["--node" as string]: NODE_COLOR.end, cursor: "default" }}>
              <div className="pn-row" style={{ gap: 8 }}><Dot color={NODE_COLOR.end} size={8} /><span className="pn-node-type">Fim</span></div>
              <div className="pn-node-title">Encerrar fluxo</div>
              <div className="pn-node-sub">Cada comentário recebe no máximo uma DM, mesmo se a pessoa comentar de novo.</div>
            </div>
          </div>
        </div>

        <aside className="pn-builder-right" aria-label="Configuração do bloco">
          <div className="pn-section-label" style={{ marginBottom: 0 }}>Configuração do bloco</div>
          {sel === "trigger" && (
            <TriggerConfig form={form} set={set} media={media} connected={connected} issues={nodeIssues("trigger")} />
          )}
          {sel === "dm" && <DmConfig form={form} set={set} rendered={dmPreview} issues={nodeIssues("dm")} />}
          {sel === "reply" && <ReplyConfig form={form} set={set} defaults={defaultReplies} issues={nodeIssues("reply")} />}
        </aside>
      </div>

      {askDelete && (
        <ConfirmModal title="Excluir esta automação?" confirmLabel="Excluir" tone="danger" busy={pending}
          body="Os comentários novos deixam de ser respondidos por ela. O histórico de execuções continua em Execuções."
          onConfirm={remove} onClose={() => setAskDelete(false)} />
      )}
    </div>
  );
}

function FlowNode({ id, sel, onSelect, color, type, title, sub, issues }: {
  id: NodeId; sel: NodeId; onSelect: (n: NodeId) => void; color: string; type: string; title: string; sub: string; issues: Issue[];
}) {
  const on = sel === id;
  return (
    <button type="button" className={`pn-node${on ? " is-sel" : ""}${issues.length ? " is-error" : ""}`} style={{ ["--node" as string]: color }}
      onClick={() => onSelect(id)} aria-pressed={on}>
      <div className="pn-row" style={{ gap: 8, flexWrap: "nowrap" }}>
        <Dot color={color} size={8} />
        <span className="pn-node-type">{type}</span>
      </div>
      <div className="pn-node-title">{title}</div>
      <div className="pn-node-sub">{sub}</div>
      {issues.slice(0, 2).map((i) => (
        <div className="pn-node-err" key={i.message}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#E4544F", marginTop: 5, flex: "none" }} />
          {i.message}
        </div>
      ))}
    </button>
  );
}

function Edge({ hot, label }: { hot: boolean; label?: string }) {
  return (
    <div className={`pn-edge${hot ? " is-hot" : ""}`}>
      <svg width="12" height="40" viewBox="0 0 12 40" aria-hidden>
        <path d="M6 0 V32" stroke="#3A3A47" strokeWidth={hot ? 2 : 1.4} fill="none" />
        <path d="M1.5 30 L6 37 L10.5 30z" fill={hot ? "#7C3AED" : "#3A3A47"} />
      </svg>
      {label && <span style={{ position: "absolute", left: 14, top: 12, fontSize: 10.5, color: "var(--muted-2)", whiteSpace: "nowrap" }}>{label}</span>}
    </div>
  );
}

type Setter = <K extends keyof AutomationInput>(k: K, v: AutomationInput[K]) => void;

function FieldIssues({ issues, field }: { issues: Issue[]; field: Issue["field"] }) {
  return <>{issues.filter((i) => i.field === field).map((i) => <div className="pn-error-text" key={i.message}>{i.message}</div>)}</>;
}

function TriggerConfig({ form, set, media, connected, issues }: { form: AutomationInput; set: Setter; media: MediaOption[]; connected: boolean; issues: Issue[] }) {
  const [kw, setKw] = useState("");
  const [url, setUrl] = useState("");
  const anyPost = form.posts.some((p) => postKey(p) === "*");
  const selectedKeys = new Set(form.posts.map(postKey));
  const isSel = (m: MediaOption) => selectedKeys.has(m.id) || (!!m.shortcode && selectedKeys.has(m.shortcode));
  const extra = form.posts.filter((p) => postKey(p) !== "*" && !media.some((m) => postKey(p) === m.id || postKey(p) === m.shortcode));

  const addKw = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (parts.length) set("keywords", [...new Set([...form.keywords, ...parts])]);
    setKw("");
  };
  const toggleMedia = (m: MediaOption) => {
    if (isSel(m)) set("posts", form.posts.filter((p) => { const k = postKey(p); return k !== m.id && k !== m.shortcode; }));
    else set("posts", [...form.posts.filter((p) => postKey(p) !== "*"), m.permalink ?? m.id]);
  };
  const addUrl = () => {
    const v = url.trim();
    if (!v) return;
    set("posts", [...form.posts.filter((p) => postKey(p) !== "*"), v]);
    setUrl("");
  };

  return (
    <>
      <div className="pn-row" style={{ gap: 8, marginTop: 10 }}>
        <Dot color={NODE_COLOR.trigger} size={8} />
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>Gatilho: comentário</div>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>Quando alguém comentar a palavra num dos posts escolhidos.</div>

      <div style={{ marginTop: 16 }}>
        <label className="pn-field-label" htmlFor="kw-input">Palavras-chave</label>
        <div className="pn-kw-box" style={issues.some((i) => i.field === "keywords") ? { borderColor: "var(--red-line)" } : undefined}
          onClick={() => document.getElementById("kw-input")?.focus()}>
          {form.keywords.map((k) => (
            <span className="pn-kw" key={k}>{k}
              <button type="button" aria-label={`Remover ${k}`} onClick={() => set("keywords", form.keywords.filter((x) => x !== k))}>×</button>
            </span>
          ))}
          <input id="kw-input" className="pn-kw-input" value={kw} placeholder={form.keywords.length ? "" : "Ex.: CONTADOR"}
            onChange={(e) => { const v = e.target.value; if (/[\s,;]$/.test(v)) addKw(v); else setKw(v); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addKw(kw); }
              if (e.key === "Backspace" && !kw && form.keywords.length) set("keywords", form.keywords.slice(0, -1));
            }}
            onBlur={() => kw && addKw(kw)} />
        </div>
        <div className="pn-help">Sem diferença de maiúsculas e acentos. A palavra precisa vir inteira: “contador!” dispara, “contadores” não. Enter ou vírgula adiciona.</div>
        <FieldIssues issues={issues} field="keywords" />
      </div>

      <div style={{ marginTop: 18 }}>
        <label className="pn-field-label">Em quais posts</label>
        <div className="pn-row" style={{ gap: 10, flexWrap: "nowrap", border: "1px solid #22222B", background: "var(--card)", borderRadius: 8, padding: "10px 11px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5 }}>Qualquer post ou Reels</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Inclui os posts que você publicar depois</div>
          </div>
          <Toggle on={anyPost} label="Qualquer post" onChange={() => set("posts", anyPost ? [] : ["*"])} />
        </div>

        {!anyPost && (
          <>
            {connected ? (
              media.length ? (
                <div className="pn-post-grid" style={{ marginTop: 10 }}>
                  {media.map((m) => {
                    const on = isSel(m);
                    return (
                      <button key={m.id} type="button" className={`pn-post${on ? " is-on" : ""}`} onClick={() => toggleMedia(m)}
                        aria-pressed={on} title={m.caption || m.shortcode}>
                        {m.thumb ? <img src={m.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
                        {!m.thumb && <span className="pn-post-cap" style={{ position: "static", background: "none" }}>{m.caption || m.shortcode}</span>}
                        {m.thumb && m.caption && <span className="pn-post-cap">{m.caption.slice(0, 40)}</span>}
                        {on && <span className="pn-post-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              ) : <div className="pn-help">Nenhum post encontrado na conta.</div>
            ) : (
              <div className="pn-help">Conecte o Instagram para escolher entre os posts recentes. Enquanto isso, cole o link do post abaixo.</div>
            )}

            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <input className="pn-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Colar link do post ou Reels"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} aria-label="Link do post" />
              <button type="button" className="pn-btn is-sm" onClick={addUrl}>Adicionar</button>
            </div>
            {extra.map((p) => (
              <div key={p} className="pn-row" style={{ gap: 8, flexWrap: "nowrap", marginTop: 6, fontSize: 12 }}>
                <Icon d={ICONS.link} size={13} color="#8A8A99" />
                <span className="pn-ellipsis pn-mono" style={{ flex: 1, fontSize: 11.5 }}>{postKey(p)}</span>
                <button type="button" className="pn-btn is-sm" onClick={() => set("posts", form.posts.filter((x) => x !== p))}>Remover</button>
              </div>
            ))}
          </>
        )}
        <FieldIssues issues={issues} field="posts" />
      </div>
    </>
  );
}

function DmConfig({ form, set, rendered, issues }: { form: AutomationInput; set: Setter; rendered: string; issues: Issue[] }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (token: string) => {
    const el = ref.current;
    if (!el) return set("dm", form.dm + token);
    const a = el.selectionStart, b = el.selectionEnd;
    set("dm", form.dm.slice(0, a) + token + form.dm.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length); });
  };
  const len = rendered.length;
  return (
    <>
      <div className="pn-row" style={{ gap: 8, marginTop: 10 }}>
        <Dot color={NODE_COLOR.dm} size={8} />
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>Enviar Direct privado</div>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>Resposta privada ao comentário: uma por comentário, até 7 dias depois dele.</div>

      <div style={{ marginTop: 16 }}>
        <label className="pn-field-label" htmlFor="dm-text">Texto da mensagem</label>
        <textarea id="dm-text" ref={ref} className={`pn-textarea${issues.some((i) => i.field === "dm") ? " is-error" : ""}`} rows={8}
          value={form.dm} onChange={(e) => set("dm", e.target.value)} />
        <div className="pn-row" style={{ gap: 6, marginTop: 6 }}>
          <button type="button" className="pn-chip" onClick={() => insert("{link}")}>+ {"{link}"}</button>
          <button type="button" className="pn-chip" onClick={() => insert("{usuario}")}>+ {"{usuario}"}</button>
          <span className="pn-spacer pn-mono" style={{ fontSize: 11, color: len > DM_MAX ? "var(--red)" : "var(--muted-2)" }}>{len}/{DM_MAX}</span>
        </div>
        <div className="pn-help">{"{link}"} vira o link abaixo. {"{usuario}"} vira o @ de quem comentou.</div>
        <FieldIssues issues={issues} field="dm" />
      </div>

      <div style={{ marginTop: 16 }}>
        <label className="pn-field-label" htmlFor="dm-link">Link do material</label>
        <input id="dm-link" className={`pn-input${issues.some((i) => i.field === "link") ? " is-error" : ""}`} type="url" inputMode="url"
          placeholder="https://…" value={form.link} onChange={(e) => set("link", e.target.value)} />
        {form.link && /^https?:\/\//.test(form.link) && (
          <a href={form.link} target="_blank" rel="noreferrer" className="pn-help" style={{ display: "inline-block", color: "var(--violet-3)" }}>Abrir link ↗</a>
        )}
        <FieldIssues issues={issues} field="link" />
      </div>
    </>
  );
}

function ReplyConfig({ form, set, defaults, issues }: { form: AutomationInput; set: Setter; defaults: string[]; issues: Issue[] }) {
  const custom = form.publicReplies.length > 0;
  const [text, setText] = useState(form.publicReplies.join("\n"));
  return (
    <>
      <div className="pn-row" style={{ gap: 8, marginTop: 10 }}>
        <Dot color={NODE_COLOR.reply} size={8} />
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>Responder comentário</div>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>Resposta pública curta, sorteada. Só sai depois que a DM foi entregue, para não prometer algo que não chegou.</div>

      <div className="pn-row" style={{ gap: 10, flexWrap: "nowrap", border: "1px solid #22222B", background: "var(--card)", borderRadius: 8, padding: "10px 11px", marginTop: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5 }}>Usar frases próprias</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Desligado usa as {defaults.length} frases padrão</div>
        </div>
        <Toggle on={custom} label="Usar frases próprias" onChange={() => {
          if (custom) { set("publicReplies", []); setText(""); }
          else { set("publicReplies", [...defaults]); setText(defaults.join("\n")); }
        }} />
      </div>

      {custom ? (
        <div style={{ marginTop: 14 }}>
          <label className="pn-field-label" htmlFor="replies">Frases (uma por linha)</label>
          <textarea id="replies" className={`pn-textarea${issues.length ? " is-error" : ""}`} rows={9} value={text}
            onChange={(e) => { setText(e.target.value); set("publicReplies", e.target.value.split("\n")); }} />
          <div className="pn-help">Variar as frases evita que o Instagram trate as respostas como spam.</div>
          <FieldIssues issues={issues} field="publicReplies" />
        </div>
      ) : (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          {defaults.map((d) => <div key={d} style={{ fontSize: 12, color: "var(--text-3)", borderLeft: "2px solid var(--line-3)", paddingLeft: 8 }}>{d}</div>)}
        </div>
      )}
    </>
  );
}

function TestPanel({ form, replies, testRef, anyPost }: { form: AutomationInput; replies: string[]; testRef: React.RefObject<HTMLTextAreaElement | null>; anyPost: boolean }) {
  const [comment, setComment] = useState(form.keywords[0] ? `Quero! ${form.keywords[0].toLowerCase()}` : "");
  const [user, setUser] = useState("seguidor.teste");
  const matched = form.keywords.find((k) => hasKeyword(comment, k));
  const reply = replies[0];
  return (
    <>
      <div className="pn-section-label">Testar o fluxo</div>
      <label className="pn-field-label" htmlFor="test-comment">Comentário de exemplo</label>
      <textarea id="test-comment" ref={testRef} className="pn-textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Digite um comentário" />
      <label className="pn-field-label" htmlFor="test-user" style={{ marginTop: 10 }}>Usuário</label>
      <input id="test-user" className="pn-input" value={user} onChange={(e) => setUser(e.target.value.replace(/^@/, ""))} />

      <div style={{ marginTop: 12 }}>
        {!comment.trim() ? null : matched ? (
          <Badge tone="green">Dispara com “{matched}”</Badge>
        ) : (
          <Badge tone="">Não dispara{form.keywords.length ? "" : ": sem palavra-chave"}</Badge>
        )}
        {!anyPost && matched && <div className="pn-help">Só vale nos posts escolhidos.</div>}
      </div>

      {matched && comment.trim() && (
        <div className="pn-phone" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10.5, color: "var(--muted-2)", marginBottom: 6 }}>Comentário público</div>
          <div className="pn-bubble is-in"><b>@{user}</b> {comment}</div>
          {reply && <div className="pn-bubble is-in" style={{ marginTop: 6, marginLeft: 16, background: "#1E1E26" }}><b>@d.ia.riamente</b> {reply}</div>}
          <div style={{ fontSize: 10.5, color: "var(--muted-2)", margin: "12px 0 6px" }}>Direct para @{user}</div>
          <div className="pn-bubble">{form.dm ? renderDm(form, user) : <i style={{ opacity: .7 }}>Mensagem vazia</i>}</div>
        </div>
      )}

      <div className="pn-help" style={{ marginTop: 14 }}>
        O teste roda só aqui na tela. Para testar de verdade, publique com o modo de teste ligado e rode a varredura.
      </div>
    </>
  );
}
