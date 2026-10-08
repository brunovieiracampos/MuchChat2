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
