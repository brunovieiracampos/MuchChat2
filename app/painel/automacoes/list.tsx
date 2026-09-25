"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { relTime } from "@/lib/format";
import { duplicateAutomationAction, setAutomationActiveAction } from "../actions";
import { Badge, Icon, Toggle, useToast } from "../_components/ui";
import { ICONS } from "../_components/icons";

export type AutomationRow = {
  id: string; name: string; trigger: string; scope: string; active: boolean;
  updatedAt: number | null; runs: number; failed: number;
};

const FILTERS = ["Todas", "Ativas", "Pausadas", "Com erros"] as const;
const COLS = "minmax(0,2.4fr) minmax(0,1.5fr) 100px 120px 92px 170px";
const NARROW = "minmax(150px,1fr) 96px 90px";

export function AutomationList({ rows }: { rows: AutomationRow[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Todas");
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const list = rows.filter((r) =>
    filter === "Ativas" ? r.active : filter === "Pausadas" ? !r.active : filter === "Com erros" ? r.failed > 0 : true);

  const toggle = (r: AutomationRow) => {
    setBusy(r.id);
    start(async () => {
      const res = await setAutomationActiveAction(r.id, !r.active);
      setBusy(null);
      if (!res.ok) return toast(res.issues?.[0]?.message ?? res.error ?? "Não foi possível alterar", "red");
      toast(r.active ? `“${r.name}” pausada` : `“${r.name}” ativada`, r.active ? "amber" : "green");
      router.refresh();
    });
  };
  const duplicate = (r: AutomationRow) => start(async () => {
    const res = await duplicateAutomationAction(r.id);
    if (!res.ok) return toast(res.error ?? "Erro ao duplicar", "red");
    toast(`“${r.name}” duplicada como pausada`);
    router.push(`/painel/automacoes/${res.id}/editar`);
  });

  return (
    <div className="pn-page">
      <div className="pn-row">
        <div className="pn-row" style={{ gap: 6 }}>
          {FILTERS.map((f) => (
            <button key={f} type="button" className={`pn-chip${filter === f ? " is-on" : ""}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>{f}</button>
          ))}
        </div>
        <Link href="/painel/automacoes/nova" className="pn-btn is-primary pn-spacer"><Icon d={ICONS.plus} size={14} width={2} />Criar automação</Link>
      </div>

      <div className="pn-card is-flush">
        <div className="pn-thead" data-narrow style={{ gridTemplateColumns: COLS, ["--narrow" as string]: NARROW }}>
          <div>Automação</div>
          <div className="pn-wide-only">Gatilho</div>
          <div>Status</div>
          <div className="pn-wide-only">Última alteração</div>
          <div className="pn-wide-only" style={{ textAlign: "right" }}>Execuções</div>
          <div style={{ textAlign: "right" }}>Ações</div>
        </div>
        {list.map((r) => (
          <div key={r.id} className="pn-trow" data-narrow style={{ gridTemplateColumns: COLS, ["--narrow" as string]: NARROW }}>
            <div style={{ minWidth: 0 }}>
              <Link href={`/painel/automacoes/${r.id}`} style={{ color: "var(--text)", fontSize: 13.5, fontWeight: 500 }}>{r.name}</Link>
              <div className="pn-cell-sub">{r.scope}</div>
              <div className="pn-narrow-only pn-cell-sub" style={{ color: "var(--muted-2)" }}>{r.trigger}, {r.runs} execuç{r.runs === 1 ? "ão" : "ões"}</div>
              {r.failed > 0 && <div style={{ fontSize: 11.5, color: "var(--red-text)", marginTop: 5 }}>{r.failed} execuç{r.failed === 1 ? "ão" : "ões"} com falha nos últimos 7 dias</div>}
            </div>
            <div className="pn-wide-only" style={{ fontSize: 12.5, color: "var(--text-3)", minWidth: 0 }}>{r.trigger}</div>
            <div><Badge tone={r.active ? "green" : "amber"}>{r.active ? "Ativa" : "Pausada"}</Badge></div>
            <div className="pn-wide-only" style={{ fontSize: 12.5, color: "var(--muted)" }}>{r.updatedAt ? relTime(r.updatedAt) : "—"}</div>
            <div className="pn-wide-only pn-num" style={{ fontSize: 13, textAlign: "right" }}>{r.runs}</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
              <Link href={`/painel/automacoes/${r.id}/editar`} className="pn-btn is-sm">Editar</Link>
              <button type="button" className="pn-btn is-sm pn-wide-only" onClick={() => duplicate(r)}>Duplicar</button>
              <Toggle on={r.active} disabled={busy === r.id} label={r.active ? `Pausar ${r.name}` : `Ativar ${r.name}`} onChange={() => toggle(r)} />
            </div>
          </div>
        ))}
        {!list.length && (
          <div className="pn-table-empty">
            {rows.length ? "Nenhuma automação com esse filtro" : <>Nenhuma automação ainda. <Link href="/painel/automacoes/nova">Criar a primeira</Link></>}
          </div>
        )}
      </div>
    </div>
  );
}
