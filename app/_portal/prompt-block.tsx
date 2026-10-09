"use client";

import { useEffect, useRef, useState } from "react";
import { PROMPT_FOLD_LINES, promptPieces } from "@/lib/material";
import { CopyIcon, Icon } from "./parts";

type State = "idle" | "copied" | "failed";

/** Caminho antigo de cópia, para quando o navegador (o do Instagram, às vezes) bloqueia a área de transferência. */
function legacyCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  return ok;
}

/**
 * O bloco-assinatura do portal: painel escuro com o texto para copiar e colar numa IA.
 * Copiar leva sempre o texto inteiro, mesmo com o prompt recolhido. Se a cópia falhar, o texto fica selecionado
 * e uma nota explica como copiar à mão.
 */
export function PromptBlock({ index, label, text }: { index: number; label: string; text: string }) {
  const [state, setState] = useState<State>("idle");
  const [open, setOpen] = useState(false);
  const body = useRef<HTMLPreElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const long = lines.length > PROMPT_FOLD_LINES;
  const count = `${lines.length} ${lines.length === 1 ? "linha" : "linhas"}`;
  const name = `Prompt ${String(index).padStart(2, "0")}${label.trim() ? ` · ${label.trim()}` : ""}`;

  const copy = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = legacyCopy(text); }
    if (timer.current) clearTimeout(timer.current);
    if (ok) {
      setState("copied");
      timer.current = setTimeout(() => setState("idle"), 2400);
      return;
    }
    setState("failed");
    setOpen(true);
    if (body.current) {
      const range = document.createRange();
      range.selectNodeContents(body.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  };

  return (
    <figure className={`dia-prompt${long ? " is-long" : ""}${open ? " is-open" : ""}`} data-state={state}>
      <div className="dia-prompt__bar">
        <span className="dia-dot" aria-hidden="true" />
        <div className="dia-prompt__id"><span className="dia-prompt__label">{name}</span><span className="dia-prompt__count">{count}</span></div>
        <button className="dia-copy" type="button" onClick={copy}>
          <span className="dia-copy__idle"><CopyIcon />Copiar</span>
          <span className="dia-copy__ok"><Icon name="check" />Copiado</span>
          <span className="dia-copy__fail"><Icon name="select" />Selecione e copie</span>
        </button>
      </div>
      <pre ref={body} className="dia-prompt__body" tabIndex={0} aria-label="Texto do prompt">
        {lines.map((line, i) => (
          <span key={i} className={`ln${line.trimStart().startsWith("#") ? " c" : ""}`}>
            {promptPieces(line).map((p, k) => (p.variable ? <span key={k} className="v">{p.text}</span> : p.text))}
          </span>
        ))}
      </pre>
      {long && (
        <button className="dia-prompt__more" type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span>{open ? "Recolher prompt" : `Ver prompt inteiro · ${count}`}</span><Icon name="down" small />
        </button>
      )}
      <div className="dia-prompt__note">
        <Icon name="warn" />
        <span>Seu navegador não deixou copiar automaticamente. O texto já está selecionado: toque e segure sobre ele e escolha <b>Copiar</b>.</span>
      </div>
      <span className="dia-sr" role="status">{state === "copied" ? "Prompt copiado." : state === "failed" ? "Não foi possível copiar. Selecione o texto e copie." : ""}</span>
    </figure>
  );
}
