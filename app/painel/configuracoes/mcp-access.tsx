"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { relTime } from "@/lib/format";
import { createTokenAction, revokeTokenAction } from "../actions";
import { ConfirmModal, useToast } from "../_components/ui";

export type TokenRow = { id: string; name: string; hint: string; createdAt: string; lastUsedAt: string | null };

/** Tokens pessoais para usar o Much Chat pelo Claude Code (MCP). */
export function McpAccess({ tokens, url, connected }: { tokens: TokenRow[]; url: string; connected: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<TokenRow | null>(null);
  const [pending, start] = useTransition();
  const command = (token: string) => `claude mcp add --transport http muchchat ${url} --header "Authorization: Bearer ${token}"`;

  const create = () => start(async () => {
    const r = await createTokenAction(name);
    if (!r.ok) return toast(r.error ?? "Não foi possível criar o token", "red");
    setCreated(r.token);
    setName("");
    router.refresh();
  });
  const revoke = () => start(async () => {
    if (!revoking) return;
    const r = await revokeTokenAction(revoking.id);
    setRevoking(null);
    if (!r.ok) return toast(r.error ?? "Não foi possível revogar", "red");
    toast("Token revogado", "amber");
    router.refresh();
  });
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast("Comando copiado"); } catch { toast("Não deu para copiar; selecione o texto", "amber"); }
  };

  return (
    <section className="pn-card">
      <div className="pn-card-title">Acesso pelo Claude</div>
      <div className="pn-card-sub" style={{ lineHeight: 1.5 }}>
        Crie, edite e acompanhe automações conversando com o Claude Code. Cada token dá acesso à sua conta; revogue os que não usa mais.
      </div>

      {created && (
        <div className="pn-alert is-violet" style={{ marginTop: 14, flexDirection: "column", gap: 8 }}>
          <div className="pn-alert-title">Token criado. Copie agora: ele não aparece de novo.</div>
          <div className="pn-alert-body">Rode no terminal para ligar o Much Chat ao Claude Code:</div>
          <div className="pn-code" style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", color: "var(--text-2)", userSelect: "all" }}>{command(created)}</div>
          <div className="pn-row" style={{ gap: 8 }}>
            <button type="button" className="pn-btn is-sm is-primary" onClick={() => copy(command(created))}>Copiar comando</button>
            <button type="button" className="pn-btn is-sm" onClick={() => setCreated(null)}>Já copiei</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
        {tokens.map((t) => (
          <div key={t.id} className="pn-row" style={{ gap: 14, flexWrap: "nowrap", borderTop: "1px solid var(--line)", padding: "12px 0" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5 }}>{t.name} <span className="pn-mono" style={{ fontSize: 11, color: "var(--muted)" }}>…{t.hint}</span></div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                Criado {relTime(Date.parse(t.createdAt))}. {t.lastUsedAt ? `Usado ${relTime(Date.parse(t.lastUsedAt))}.` : "Ainda não usado."}
              </div>
            </div>
            <button type="button" className="pn-btn is-sm" onClick={() => setRevoking(t)}>Revogar</button>
          </div>
        ))}
        <div className="pn-row" style={{ gap: 8, flexWrap: "nowrap", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <input className="pn-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do token (ex.: notebook)" aria-label="Nome do token" maxLength={60}
            onKeyDown={(e) => { if (e.key === "Enter" && connected) { e.preventDefault(); create(); } }} />
          <button type="button" className="pn-btn is-sm is-primary" disabled={pending || !connected} onClick={create}>Gerar token</button>
        </div>
        {!connected && <div className="pn-help">Conecte o Instagram antes: o Claude trabalha nas automações dessa conta.</div>}
      </div>

      {revoking && (
        <ConfirmModal
          title={`Revogar “${revoking.name}”?`}
          body="O Claude que usa este token perde o acesso na hora. Para voltar a usar, gere outro token."
          confirmLabel="Revogar token"
          tone="danger"
          busy={pending}
          onConfirm={revoke}
          onClose={() => setRevoking(null)}
        />
      )}
    </section>
  );
}
