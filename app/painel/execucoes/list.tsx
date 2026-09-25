"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ExecStatus, Execution } from "@/lib/activity";
import { EXEC_STATUS, dateTime, relTime, timeOnly } from "@/lib/format";
import { RetryFailedButton } from "../_components/action-buttons";
import { ExecBadge } from "../_components/exec-badge";
import { Dot, Drawer, Icon } from "../_components/ui";
import { ICONS } from "../_components/icons";

const FILTERS: { key: "todas" | ExecStatus; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "concluida", label: "Concluída" },
  { key: "andamento", label: "Em andamento" },
  { key: "simulacao", label: "Simulação" },
  { key: "falhou", label: "Falhou" },
  { key: "expirada", label: "Expirada" },
];
const COLS = "minmax(0,1.8fr) minmax(0,1.4fr) 118px minmax(0,1.4fr) 104px";
const NARROW = "minmax(150px,1fr) 104px 96px";

export function ExecutionList({ executions, automations, initial }: {
  executions: Execution[];
  automations: { id: string; name: string }[];
  initial: { q: string; id: string | null; status: string; automation: string };
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial.status);
  const [q, setQ] = useState(initial.q);
  const [auto, setAuto] = useState(initial.automation);
  const [open, setOpen] = useState<string | null>(initial.id);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, "");
    return executions.filter((e) => {
      if (status !== "todas" && e.status !== status) return false;
      if (auto && e.ruleId !== auto) return false;
      if (needle && !`${e.username ?? ""} ${e.text ?? ""} ${e.ruleName}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [executions, status, q, auto]);

  const failed = executions.filter((e) => e.status === "falhou").length;
  const current = open ? executions.find((e) => e.commentId === open) : undefined;
  const close = () => { setOpen(null); if (initial.id) router.replace("/painel/execucoes", { scroll: false }); };

  return (
    <div className="pn-page">
      <div className="pn-row" style={{ gap: 10 }}>
        <div className="pn-row" style={{ gap: 6 }}>
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={`pn-chip${status === f.key ? " is-on" : ""}`} aria-pressed={status === f.key} onClick={() => setStatus(f.key)}>{f.label}</button>
          ))}
        </div>
        <div className="pn-row pn-spacer" style={{ gap: 8 }}>
          {failed > 0 && <RetryFailedButton />}
        </div>
      </div>
      <div className="pn-row" style={{ gap: 8 }}>
        <div className="pn-search" style={{ width: 280, maxWidth: "100%" }}>
          <Icon d={ICONS.search} size={14} color="#6E6E7D" width={1.8} />
          <input type="search" className="pn-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar usuário, comentário ou automação" aria-label="Buscar execução" />
        </div>
        <select className="pn-select" style={{ width: "auto" }} value={auto} onChange={(e) => setAuto(e.target.value)} aria-label="Filtrar por automação">
          <option value="">Todas as automações</option>
          {automations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="pn-card is-flush">
        <div className="pn-thead" data-narrow style={{ gridTemplateColumns: COLS, ["--narrow" as string]: NARROW }}>
          <div>Fluxo</div>
          <div className="pn-wide-only">Contato</div>
          <div>Status</div>
          <div className="pn-wide-only">Etapa atual</div>
          <div />
        </div>
        {list.map((e) => (
          <div key={e.commentId} className="pn-trow" data-narrow style={{ gridTemplateColumns: COLS, ["--narrow" as string]: NARROW }}>
            <div style={{ minWidth: 0 }}>
              <div className="pn-cell-main pn-ellipsis">{e.ruleName}</div>
              <div className="pn-narrow-only pn-cell-sub pn-ellipsis">{e.username ? `@${e.username}: ` : ""}{e.step}</div>
              <div className="pn-ellipsis" style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 2 }}>“{e.text}”, {dateTime(e.startedAt)}</div>
            </div>
            <div className="pn-wide-only pn-ellipsis" style={{ fontSize: 12.5, color: "var(--text-3)" }}>{e.username ? `@${e.username}` : "—"}</div>
            <div><ExecBadge status={e.status} /></div>
            <div className="pn-wide-only pn-ellipsis" style={{ fontSize: 12.5, color: "var(--text-3)" }}>{e.step}</div>
            <div style={{ textAlign: "right" }}>
              <button type="button" className="pn-btn is-sm" onClick={() => setOpen(e.commentId)}>Ver detalhes</button>
            </div>
          </div>
        ))}
        {!list.length && (
          <div className="pn-table-empty">
            {executions.length ? "Nenhuma execução com esses filtros" : "Nenhuma execução ainda. Elas aparecem quando alguém comenta uma palavra-chave."}
          </div>
        )}
      </div>

      {current && (
        <Drawer title={current.ruleName} subtitle={`${EXEC_STATUS[current.status].label}, começou em ${dateTime(current.startedAt)}`} onClose={close}>
          <div className="pn-fields">
            <div className="pn-field-row"><div>Contato</div><div>{current.username ? <a href={`https://instagram.com/${current.username}`} target="_blank" rel="noreferrer">@{current.username}</a> : "Não identificado"}</div></div>
            <div className="pn-field-row"><div>Comentário</div><div>“{current.text}”</div></div>
            <div className="pn-field-row"><div>Palavra-chave</div><div>{current.keyword ? <span className="pn-tag">{current.keyword}</span> : "—"}</div></div>
            <div className="pn-field-row"><div>Etapa atual</div><div>{current.step}</div></div>
            <div className="pn-field-row"><div>Última atualização</div><div>{relTime(current.lastAt)}</div></div>
            <div className="pn-field-row"><div>ID do comentário</div><div className="pn-mono" style={{ fontSize: 11.5 }}>{current.commentId}</div></div>
            <div className="pn-field-row"><div>ID do post</div><div className="pn-mono" style={{ fontSize: 11.5 }}>{current.mediaId}</div></div>
          </div>

          {current.error && (
            <div className="pn-alert is-red" style={{ marginTop: 18, flexDirection: "column", gap: 6 }}>
              <div className="pn-alert-title">{current.status === "falhou" ? "O Instagram recusou o envio" : "Última tentativa falhou"}</div>
              <div className="pn-code">{current.error}</div>
              {current.status === "falhou" && <div className="pn-alert-body">Depois de corrigir a causa, use “Tentar de novo” no topo da lista. A varredura reenvia se o comentário tiver menos de 7 dias.</div>}
            </div>
          )}

          <div className="pn-section-label" style={{ marginTop: 22 }}>Etapas</div>
          <div>
            {current.steps.map((s, i) => (
              <div className="pn-timeline-item" key={i}>
                <div className="pn-timeline-rail"><Dot color={s.ok ? (s.action === "dry-run" ? "#E0A526" : "#2FA37A") : "#E4544F"} size={8} /><span /></div>
                <div style={{ paddingBottom: 14, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{s.label}</div>
                  <div className="pn-num" style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 2 }}>{timeOnly(s.at)}</div>
                  {s.detail && <div className="pn-code" style={{ marginTop: 6, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px" }}>{s.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </Drawer>
      )}
    </div>
  );
}
