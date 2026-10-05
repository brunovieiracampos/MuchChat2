"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveAutoReplyAction } from "../actions";
import { Toggle, useToast } from "../_components/ui";

const MAX = 1000;

/** Resposta automática de DM (versão de teste): liga/desliga e o texto fixo. */
export function AutoReply({ initial, connected }: { initial: { enabled: boolean; text: string }; connected: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [text, setText] = useState(initial.text);
  const [pending, start] = useTransition();
  const dirty = enabled !== initial.enabled || text !== initial.text;

  const save = () => start(async () => {
    const r = await saveAutoReplyAction({ enabled, text });
    if (!r.ok) return toast(r.error ?? "Não foi possível salvar", "red");
    toast(enabled ? "Resposta automática ligada" : "Resposta automática desligada", enabled ? "green" : "amber");
    router.refresh();
  });

  return (
    <section className="pn-card">
      <div className="pn-row" style={{ gap: 14, flexWrap: "nowrap", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pn-card-title">Resposta automática de DM</div>
          <div className="pn-card-sub" style={{ lineHeight: 1.5 }}>
            Em teste. Quem te mandar um texto no direct recebe a mensagem abaixo, no máximo uma vez a cada 24 horas.
            Quem está no meio de uma automação não recebe.
          </div>
        </div>
        <Toggle on={enabled} disabled={pending || !connected} label="Responder DMs automaticamente" onChange={() => setEnabled(!enabled)} />
      </div>

      <label htmlFor="auto-reply-text" className="pn-field-label" style={{ marginTop: 14 }}>Mensagem</label>
      <textarea id="auto-reply-text" className="pn-textarea" rows={4} maxLength={MAX} value={text} disabled={!connected}
        onChange={(e) => setText(e.target.value)} placeholder="Oi! Recebi sua mensagem e te respondo em breve." />

      <div className="pn-row" style={{ gap: 12, marginTop: 10, justifyContent: "space-between" }}>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {connected ? `${text.length} de ${MAX} caracteres` : "Conecte a conta do Instagram para usar."}
        </span>
        <button type="button" className="pn-btn is-sm is-primary" disabled={pending || !dirty || !connected} onClick={save}>Salvar</button>
      </div>
    </section>
  );
}
