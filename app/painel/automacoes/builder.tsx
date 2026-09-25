"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { normalizeInput, validateAutomation, type AutomationInput, type Issue } from "@/lib/automation-input";
import {
  BUTTON_TITLE_MAX, MAX_STEPS, STEP_META, TEMPLATES, TEMPLATE_TEXT_MAX, TEXT_MAX,
  blankStep, renderText, simulate, waitsForClick,
  type Button, type DmStep, type FollowStep, type ReplyStep, type Step, type StepType,
} from "@/lib/flow";
import { relTime } from "@/lib/format";
import { hasKeyword, postKey } from "@/lib/match";
import { deleteAutomationAction, saveAutomationAction } from "../actions";
import { Badge, ConfirmModal, Dot, useToast } from "../_components/ui";
import type { MediaOption, OtherAutomation } from "./builder-data";
import { PostPicker } from "./post-picker";

type Sel = "trigger" | string;
const TRIGGER_COLOR = "#7C3AED";
const END_COLOR = "#5F5F6E";

export function Builder({ initial, isNew, updatedAt, media, mediaNext, connected, account, others, defaultReplies }: {
  initial: AutomationInput;
  isNew?: boolean;
  updatedAt?: number;
  media: MediaOption[];
  mediaNext?: string;
  connected: boolean;
  account?: string;
  others: OtherAutomation[];
  defaultReplies: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<AutomationInput>(initial);
  const [saved, setSaved] = useState<AutomationInput>(initial);
  const [sel, setSel] = useState<Sel>("trigger");
  const [showPath, setShowPath] = useState(false);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [askDelete, setAskDelete] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  // Numa automação nova, os erros só aparecem nos blocos depois da primeira tentativa de salvar.
  const [showErrors, setShowErrors] = useState(!isNew);
  const [adding, setAdding] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const clean = useMemo(() => normalizeInput(form), [form]);
  const publishIssues = useMemo(() => validateAutomation({ ...clean, active: true }, others), [clean, others]);
  const issues = serverIssues.length ? serverIssues : publishIssues;
  const visible = showErrors ? issues : [];
  const triggerIssues = visible.filter((i) => i.field === "posts" || i.field === "keywords");
  const stepIssues = (id: string) => visible.filter((i) => i.field === "steps" && i.stepId === id);
  const flowIssues = visible.filter((i) => (i.field === "steps" && !i.stepId) || i.field === "link");
  const nameIssue = visible.find((i) => i.field === "name");

  const set = <K extends keyof AutomationInput>(k: K, v: AutomationInput[K]) => {
    setServerIssues([]);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const setSteps = (fn: (s: Step[]) => Step[]) => { setServerIssues([]); setForm((f) => ({ ...f, steps: fn(f.steps) })); };
  const updateStep = (id: string, patch: Partial<Step>) => setSteps((ss) => ss.map((s) => (s.id === id ? ({ ...s, ...patch } as Step) : s)));
  const insertStep = (at: number, type: StepType) => {
    const step = blankStep(type, defaultReplies);
    setSteps((ss) => [...ss.slice(0, at), step, ...ss.slice(at)]);
    setSel(step.id);
    setAdding(null);
  };
  const moveStep = (id: string, dir: -1 | 1) => setSteps((ss) => {
    const i = ss.findIndex((s) => s.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= ss.length) return ss;
    const out = [...ss];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  });
  const removeStep = (id: string) => { setSteps((ss) => ss.filter((s) => s.id !== id)); setSel("trigger"); };

  const selectIssue = (i: Issue) => setSel(i.field === "steps" && i.stepId ? i.stepId : "trigger");

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = (active: boolean) => start(async () => {
    setShowErrors(true);
    if (active && publishIssues.length) {
      selectIssue(publishIssues[0]);
      return toast(publishIssues[0].message, "red");
    }
    const r = await saveAutomationAction({ ...form, active });
    if (!r.ok) {
      if (r.issues?.length) {
        setServerIssues(r.issues);
        selectIssue(r.issues[0]);
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

  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setSteps(() => t.build(defaultReplies));
    setSel("trigger");
  };

  const anyPost = clean.posts.some((p) => postKey(p) === "*");
  const kwTitle = clean.keywords.length ? `Comentário contém ${clean.keywords.map((k) => `“${k}”`).join(" ou ")}` : "Defina a palavra-chave";
  const status = isNew && !form.id ? { label: "Rascunho", tone: "" } : saved.active ? { label: "Ativa", tone: "green" } : { label: "Pausada", tone: "amber" };
  const selStep = form.steps.find((s) => s.id === sel);

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
          <button type="button" className="pn-badge is-red" style={{ cursor: "pointer" }} onClick={() => selectIssue(publishIssues[0])}
            title={publishIssues.map((i) => i.message).join("\n")}>
            {publishIssues.length} {publishIssues.length === 1 ? "problema impede" : "problemas impedem"} a publicação
          </button>
        )}
        <div className="pn-row pn-spacer" style={{ gap: 8 }}>
          <label className="pn-hide-sm" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--text-3)", cursor: "pointer" }}>
            <input type="checkbox" checked={showPath} onChange={() => setShowPath(!showPath)} style={{ accentColor: "#7C3AED", width: 14, height: 14 }} />
            Caminho de execução
          </label>
          {form.id && <button type="button" className="pn-btn is-danger" style={{ fontSize: 12, padding: "7px 12px" }} onClick={() => setAskDelete(true)}>Excluir</button>}
          <button type="button" className="pn-btn" style={{ fontSize: 12, padding: "7px 12px" }} onClick={() => { setShowPath(true); setTestOpen(true); }}>Testar</button>
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
              <button type="button" className="pn-btn is-primary" style={{ fontSize: 12, padding: "7px 13px" }} disabled={pending} onClick={() => save(true)}>
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
          <TestPanel form={clean} anyPost={anyPost} account={account} />
        </aside>

        <div className="pn-canvas">
          <div className="pn-canvas-inner">
            {isNew && !form.id && (
              <div className="pn-templates">
                <div className="pn-section-label" style={{ marginBottom: 8 }}>Começar com um modelo</div>
                <div className="pn-templates-grid">
                  {TEMPLATES.map((t) => (
                    <button key={t.id} type="button" className="pn-template" onClick={() => applyTemplate(t.id)}>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <FlowNode on={sel === "trigger"} onSelect={() => setSel("trigger")} color={TRIGGER_COLOR} type="Gatilho" title={kwTitle}
              sub={anyPost ? "Qualquer post ou Reels do perfil" : clean.posts.length ? `${clean.posts.length} post${clean.posts.length > 1 ? "s" : ""} selecionado${clean.posts.length > 1 ? "s" : ""}` : "Nenhum post escolhido"}
              issues={triggerIssues} />

            {form.steps.map((s, i) => {
              const prev = form.steps[i - 1];
              const label = prev && waitsForClick(prev) ? `depois do clique em “${prev.type === "follow" ? prev.button : prev.type === "dm" ? prev.button?.title : ""}”` : undefined;
              return (
                <Fragment key={s.id}>
                  <Edge hot={showPath} label={label} onAdd={form.steps.length < MAX_STEPS ? () => setAdding(adding === i ? null : i) : undefined} menuOpen={adding === i} onPick={(t) => insertStep(i, t)} />
                  <StepNode step={s} index={i} total={form.steps.length} on={sel === s.id} onSelect={() => setSel(s.id)}
                    onMove={(d) => moveStep(s.id, d)} onRemove={() => removeStep(s.id)} issues={stepIssues(s.id)} link={clean.link} />
                </Fragment>
              );
            })}

            <Edge hot={showPath} onAdd={form.steps.length < MAX_STEPS ? () => setAdding(adding === form.steps.length ? null : form.steps.length) : undefined}
              menuOpen={adding === form.steps.length} onPick={(t) => insertStep(form.steps.length, t)} label={form.steps.length ? undefined : "adicione o primeiro bloco"} />
            <div className="pn-node" style={{ ["--node" as string]: END_COLOR, cursor: "default" }}>
              <div className="pn-row" style={{ gap: 8 }}><Dot color={END_COLOR} size={8} /><span className="pn-node-type">Fim</span></div>
              <div className="pn-node-title">Encerrar fluxo</div>
              <div className="pn-node-sub">Cada comentário passa pelo fluxo uma vez só, mesmo se a pessoa comentar de novo.</div>
            </div>
            {flowIssues.map((i) => <div key={i.message} className="pn-error-text" style={{ marginTop: 10 }}>{i.message}</div>)}
          </div>
        </div>

        <aside className="pn-builder-right" aria-label="Configuração do bloco">
          <div className="pn-section-label" style={{ marginBottom: 0 }}>Configuração do bloco</div>
          {sel === "trigger" || !selStep ? (
            <TriggerConfig form={form} set={set} media={media} mediaNext={mediaNext} connected={connected} issues={triggerIssues} />
          ) : selStep.type === "reply" ? (
            <ReplyConfig step={selStep} update={(p) => updateStep(selStep.id, p)} issues={stepIssues(selStep.id)} />
          ) : selStep.type === "dm" ? (
            <DmConfig step={selStep} update={(p) => updateStep(selStep.id, p)} issues={stepIssues(selStep.id)}
              link={form.link} setLink={(v) => set("link", v)} username="usuario" />
          ) : (
            <FollowConfig step={selStep} update={(p) => updateStep(selStep.id, p)} issues={stepIssues(selStep.id)} />
          )}
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

/* ---------- canvas ---------- */

function FlowNode({ on, onSelect, color, type, title, sub, issues, children }: {
  on: boolean; onSelect: () => void; color: string; type: string; title: string; sub: string; issues: Issue[]; children?: React.ReactNode;
}) {
  return (
    <div className={`pn-node${on ? " is-sel" : ""}${issues.length ? " is-error" : ""}`} style={{ ["--node" as string]: color }}
      onClick={onSelect} role="button" tabIndex={0} aria-pressed={on}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(); } }}>
      <div className="pn-row" style={{ gap: 8, flexWrap: "nowrap" }}>
        <Dot color={color} size={8} />
        <span className="pn-node-type">{type}</span>
        {children}
      </div>
      <div className="pn-node-title">{title}</div>
      <div className="pn-node-sub">{sub}</div>
      {issues.slice(0, 2).map((i) => (
        <div className="pn-node-err" key={i.message}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#E4544F", marginTop: 5, flex: "none" }} />
          {i.message}
        </div>
      ))}
    </div>
  );
}

function stepSummary(s: Step, link: string): { title: string; sub: string } {
  if (s.type === "reply") {
    const n = s.replies.filter((r) => r.trim()).length;
    return { title: "Responder comentário", sub: n > 1 ? `${n} frases, uma sorteada: “${s.replies[0]}”` : s.replies[0] ? `“${s.replies[0]}”` : "Escreva a resposta" };
  }
  if (s.type === "dm") {
    const b = s.button;
    const title = !b ? "Enviar DM" : b.kind === "continue" ? `Enviar DM com botão “${b.title || "…"}”` : `Enviar DM com link “${b.title || "…"}”`;
    return { title, sub: s.text ? renderText(s.text, link, "usuario") : "Escreva a mensagem" };
  }
  return { title: "Verificar se segue o perfil", sub: `Pergunta com o botão “${s.button}”; se não seguir, insiste com “${s.retryButton}”` };
}

function StepNode({ step, index, total, on, onSelect, onMove, onRemove, issues, link }: {
  step: Step; index: number; total: number; on: boolean; onSelect: () => void; onMove: (d: -1 | 1) => void; onRemove: () => void; issues: Issue[]; link: string;
}) {
  const meta = STEP_META[step.type];
  const { title, sub } = stepSummary(step, link);
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <FlowNode on={on} onSelect={onSelect} color={meta.color} type={meta.label} title={title} sub={sub} issues={issues}>
      <span className="pn-node-tools">
        <button type="button" aria-label="Subir bloco" title="Subir" disabled={index === 0} onClick={stop(() => onMove(-1))}>↑</button>
        <button type="button" aria-label="Descer bloco" title="Descer" disabled={index === total - 1} onClick={stop(() => onMove(1))}>↓</button>
        <button type="button" aria-label="Excluir bloco" title="Excluir" onClick={stop(onRemove)}>×</button>
      </span>
    </FlowNode>
  );
}

function Edge({ hot, label, onAdd, menuOpen, onPick }: { hot: boolean; label?: string; onAdd?: () => void; menuOpen?: boolean; onPick?: (t: StepType) => void }) {
  return (
    <div className={`pn-edge${hot ? " is-hot" : ""}`} style={{ height: 52 }}>
      <svg width="12" height="52" viewBox="0 0 12 52" aria-hidden>
        <path d="M6 0 V44" stroke="#3A3A47" strokeWidth={hot ? 2 : 1.4} fill="none" />
        <path d="M1.5 42 L6 49 L10.5 42z" fill={hot ? "#7C3AED" : "#3A3A47"} />
      </svg>
      {onAdd && (
        <button type="button" className="pn-edge-add" onClick={onAdd} aria-label="Adicionar bloco aqui" aria-expanded={menuOpen} title="Adicionar bloco">+</button>
      )}
      {label && <span style={{ position: "absolute", left: 22, top: 17, fontSize: 10.5, color: "var(--muted-2)", whiteSpace: "nowrap" }}>{label}</span>}
      {menuOpen && onPick && (
        <div className="pn-add-menu" role="menu">
          {(Object.keys(STEP_META) as StepType[]).map((t) => (
            <button key={t} type="button" role="menuitem" onClick={() => onPick(t)}>
              <Dot color={STEP_META[t].color} size={8} />
              <span><b>{STEP_META[t].label}</b><br /><span style={{ color: "var(--muted)", fontSize: 11 }}>{STEP_META[t].help}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- painéis de configuração ---------- */

function Head({ color, title, help }: { color: string; title: string; help: string }) {
  return (
    <>
      <div className="pn-row" style={{ gap: 8, marginTop: 10 }}>
        <Dot color={color} size={8} />
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{title}</div>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.45 }}>{help}</div>
    </>
  );
}

function Errors({ issues }: { issues: Issue[] }) {
  return <>{issues.map((i) => <div className="pn-error-text" key={i.message}>{i.message}</div>)}</>;
}

type Setter = <K extends keyof AutomationInput>(k: K, v: AutomationInput[K]) => void;

function TriggerConfig({ form, set, media, mediaNext, connected, issues }: {
  form: AutomationInput; set: Setter; media: MediaOption[]; mediaNext?: string; connected: boolean; issues: Issue[];
}) {
  const [kw, setKw] = useState("");
  const addKw = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (parts.length) set("keywords", [...new Set([...form.keywords, ...parts])]);
    setKw("");
  };
  const kwIssues = issues.filter((i) => i.field === "keywords");
  const postIssues = issues.filter((i) => i.field === "posts");
  return (
    <>
      <Head color={TRIGGER_COLOR} title="Gatilho: comentário" help="Quando alguém comentar a palavra num dos posts escolhidos, o fluxo começa." />
      <div style={{ marginTop: 16 }}>
        <label className="pn-field-label" htmlFor="kw-input">Palavras-chave</label>
        <div className="pn-kw-box" style={kwIssues.length ? { borderColor: "var(--red-line)" } : undefined} onClick={() => document.getElementById("kw-input")?.focus()}>
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
        <div className="pn-help">
          Não precisa cadastrar variações: maiúsculas, minúsculas e acentos já são tratados (“contador”, “Contador!”, “CONTADÔR” disparam).
          A palavra precisa vir inteira: “contadores” é outra palavra. Enter ou vírgula adiciona.
        </div>
        <Errors issues={kwIssues} />
      </div>

      <div style={{ marginTop: 18 }}>
        <label className="pn-field-label">Em quais posts</label>
        <PostPicker posts={form.posts} onChange={(p) => set("posts", p)} media={media} mediaNext={mediaNext} connected={connected} invalid={postIssues.length > 0} />
        <Errors issues={postIssues} />
      </div>
    </>
  );
}

function ReplyConfig({ step, update, issues }: { step: ReplyStep; update: (p: Partial<ReplyStep>) => void; issues: Issue[] }) {
  return (
    <>
      <Head color={STEP_META.reply.color} title="Responder comentário" help="Resposta pública no comentário. Com várias frases, uma é sorteada a cada vez: variar evita que o Instagram trate como spam." />
      <div style={{ marginTop: 16 }}>
        <label className="pn-field-label" htmlFor={`r-${step.id}`}>Frases (uma por linha)</label>
        <textarea id={`r-${step.id}`} className={`pn-textarea${issues.length ? " is-error" : ""}`} rows={9}
          value={step.replies.join("\n")} onChange={(e) => update({ replies: e.target.value.split("\n") })} />
        <div className="pn-help">Dica: depois de uma DM, algo como “Te mandei no direct! 📩”. No fim do fluxo, “Enviado! Confere seu direct ✅”.</div>
        <Errors issues={issues} />
      </div>
    </>
  );
}

function DmConfig({ step, update, issues, link, setLink, username }: {
  step: DmStep; update: (p: Partial<DmStep>) => void; issues: Issue[]; link: string; setLink: (v: string) => void; username: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (token: string) => {
    const el = ref.current;
    if (!el) return update({ text: step.text + token });
    const a = el.selectionStart, b = el.selectionEnd;
    update({ text: step.text.slice(0, a) + token + step.text.slice(b) });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length); });
  };
  const kind = step.button?.kind ?? "none";
  const setKind = (k: "none" | Button["kind"]) => {
    if (k === "none") return update({ button: undefined });
    const title = step.button?.title || (k === "continue" ? "Me envie" : "Abrir material");
    update({ button: k === "continue" ? { kind: "continue", title } : { kind: "link", title, url: step.button?.kind === "link" ? step.button.url : undefined } });
  };
  const max = step.button ? TEMPLATE_TEXT_MAX : TEXT_MAX;
  const len = renderText(step.text, link, username).length;
  return (
    <>
      <Head color={STEP_META.dm.color} title="Enviar DM" help="A primeira mensagem do fluxo vai como resposta privada ao comentário (o Instagram permite uma, até 7 dias depois). Para mandar mais mensagens, a anterior precisa de um botão “continuar”." />
      <div style={{ marginTop: 16 }}>
        <label className="pn-field-label" htmlFor={`t-${step.id}`}>Texto da mensagem</label>
        <textarea id={`t-${step.id}`} ref={ref} className={`pn-textarea${issues.length ? " is-error" : ""}`} rows={7}
          value={step.text} onChange={(e) => update({ text: e.target.value })} />
        <div className="pn-row" style={{ gap: 6, marginTop: 6 }}>
          <button type="button" className="pn-chip" onClick={() => insert("{link}")}>+ {"{link}"}</button>
          <button type="button" className="pn-chip" onClick={() => insert("{usuario}")}>+ {"{usuario}"}</button>
          <span className="pn-spacer pn-num" style={{ fontSize: 11.5, color: len > max ? "var(--red)" : "var(--muted-2)" }}>{len}/{max}</span>
        </div>
        <div className="pn-help">{"{link}"} vira o link da automação. {"{usuario}"} vira o @ de quem comentou.</div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label className="pn-field-label">Botão</label>
        <div className="pn-seg" role="radiogroup" aria-label="Tipo de botão">
          {([["none", "Sem botão"], ["continue", "Continuar o fluxo"], ["link", "Abrir link"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "is-on" : ""} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
        {step.button && (
          <>
            <input className="pn-input" style={{ marginTop: 8 }} value={step.button.title} maxLength={BUTTON_TITLE_MAX + 5}
              onChange={(e) => update({ button: { ...step.button!, title: e.target.value } })} placeholder="Texto do botão" aria-label="Texto do botão" />
            {step.button.kind === "link" && (
              <input className="pn-input" style={{ marginTop: 6 }} type="url" value={step.button.url ?? ""} placeholder={link ? "Vazio usa o link da automação" : "https://…"}
                onChange={(e) => update({ button: { kind: "link", title: step.button!.title, url: e.target.value } })} aria-label="Endereço do botão" />
            )}
            <div className="pn-help">
              {step.button.kind === "continue"
                ? "O fluxo para aqui até a pessoa tocar no botão. O clique abre a conversa por 24h, e aí os próximos blocos podem mandar mensagens."
                : "Abre o endereço no navegador do Instagram. O fluxo segue sem esperar."}
              {" "}Até {BUTTON_TITLE_MAX} caracteres.
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <label className="pn-field-label" htmlFor="auto-link">Link da automação</label>
        <input id="auto-link" className="pn-input" type="url" inputMode="url" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
        <div className="pn-help">Usado no {"{link}"} e nos botões de link sem endereço próprio. Vale para todos os blocos.</div>
      </div>
      <Errors issues={issues} />
    </>
  );
}

function FollowConfig({ step, update, issues }: { step: FollowStep; update: (p: Partial<FollowStep>) => void; issues: Issue[] }) {
  return (
    <>
      <Head color={STEP_META.follow.color} title="Verificar se segue" help="Se a conversa já está aberta e a pessoa segue o perfil, passa direto. Senão, pede para seguir; a cada clique, confere de novo e só libera o resto do fluxo quando ela seguir." />
      <div style={{ marginTop: 16 }}>
        <label className="pn-field-label" htmlFor={`f1-${step.id}`}>Pedido para seguir</label>
        <textarea id={`f1-${step.id}`} className="pn-textarea" rows={3} value={step.text} onChange={(e) => update({ text: e.target.value })} />
        <input className="pn-input" style={{ marginTop: 6 }} value={step.button} onChange={(e) => update({ button: e.target.value })} aria-label="Botão do pedido" placeholder="Texto do botão" />
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="pn-field-label" htmlFor={`f2-${step.id}`}>Se ainda não seguir</label>
        <textarea id={`f2-${step.id}`} className="pn-textarea" rows={4} value={step.retryText} onChange={(e) => update({ retryText: e.target.value })} />
        <input className="pn-input" style={{ marginTop: 6 }} value={step.retryButton} onChange={(e) => update({ retryButton: e.target.value })} aria-label="Botão da insistência" placeholder="Texto do botão" />
        <div className="pn-help">Cada nova mensagem só sai quando a pessoa clica: o Instagram não deixa mandar sozinho. Para depois de 10 tentativas.</div>
      </div>
      <Errors issues={issues} />
    </>
  );
}

/* ---------- teste na tela ---------- */

function TestPanel({ form, anyPost, account }: { form: AutomationInput; anyPost: boolean; account?: string }) {
  const [comment, setComment] = useState(form.keywords[0] ? `Quero! ${form.keywords[0].toLowerCase()}` : "");
  const [user, setUser] = useState("seguidor.teste");
  const [follows, setFollows] = useState(false);
  const [clicks, setClicks] = useState(0);
  const matched = form.keywords.find((k) => hasKeyword(comment, k));
  const sim = useMemo(() => simulate(form.steps, form.link, user, follows, clicks), [form.steps, form.link, user, follows, clicks]);
  const stepsKey = JSON.stringify(form.steps);
  useEffect(() => { setClicks(0); }, [stepsKey, comment]);
  const lastWaiting = sim.waiting ? sim.items.length - 1 : -1;

  return (
    <>
      <div className="pn-section-label">Testar o fluxo</div>
      <label className="pn-field-label" htmlFor="test-comment">Comentário de exemplo</label>
      <textarea id="test-comment" className="pn-textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Digite um comentário" />
      <label className="pn-field-label" htmlFor="test-user" style={{ marginTop: 10 }}>Usuário</label>
      <input id="test-user" className="pn-input" value={user} onChange={(e) => setUser(e.target.value.replace(/^@/, ""))} />
      <label className="pn-row" style={{ gap: 8, marginTop: 10, fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}>
        <input type="checkbox" checked={follows} onChange={() => setFollows(!follows)} style={{ accentColor: "#7C3AED" }} />
        A pessoa segue o perfil
      </label>

      <div style={{ marginTop: 12 }}>
        {!comment.trim() ? null : matched ? <Badge tone="green">Dispara com “{matched}”</Badge> : <Badge>Não dispara{form.keywords.length ? "" : ": sem palavra-chave"}</Badge>}
        {!anyPost && matched && <div className="pn-help">Só vale nos posts escolhidos.</div>}
      </div>

      {matched && comment.trim() && (
        <div className="pn-phone" style={{ marginTop: 12 }}>
          <div className="pn-sim-label">Comentário</div>
          <div className="pn-bubble is-in"><b>@{user}</b> {comment}</div>
          {sim.items.map((it, i) => {
            if (it.kind === "reply") return <div key={i} className="pn-bubble is-in is-reply"><b>{account ? `@${account}` : "Seu perfil"}</b> {it.text}</div>;
            if (it.kind === "note") return <div key={i} className="pn-sim-note">{it.text}</div>;
            if (it.kind === "end") return <div key={i} className="pn-sim-note">Fim do fluxo</div>;
            if (it.kind === "click") return <div key={i} className="pn-bubble is-click">{it.title}</div>;
            const canClick = i === lastWaiting && it.button?.continues;
            return (
              <div key={i}>
                <div className="pn-sim-label">Direct</div>
                <div className="pn-bubble">
                  {it.text || <i style={{ opacity: .7 }}>Mensagem vazia</i>}
                  {it.button && (
                    it.button.url
                      ? <a className="pn-sim-btn" href={it.button.url} target="_blank" rel="noreferrer">{it.button.title || "…"}</a>
                      : <button type="button" className="pn-sim-btn" disabled={!canClick} onClick={() => setClicks((c) => c + 1)}>{it.button.title || "…"}</button>
                  )}
                </div>
              </div>
            );
          })}
          {sim.waiting && <div className="pn-sim-note">Toque no botão para simular o clique</div>}
          {clicks > 0 && <button type="button" className="pn-btn is-sm" style={{ marginTop: 10 }} onClick={() => setClicks(0)}>Recomeçar</button>}
        </div>
      )}

      <div className="pn-help" style={{ marginTop: 14 }}>
        O teste roda só aqui na tela. Para testar de verdade, publique com o modo de teste ligado e rode a varredura.
      </div>
    </>
  );
}
