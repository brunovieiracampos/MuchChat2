"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Contact, ExecStatus } from "@/lib/activity";
import { EXEC_STATUS, dateTime, relTime } from "@/lib/format";
import { ExecBadge } from "../_components/exec-badge";
import { Drawer, Icon } from "../_components/ui";
import { ICONS, initials } from "../_components/icons";

type Hist = { id: string; rule: string; text: string; status: ExecStatus; at: number };
const FILTERS = ["Todos", "Receberam DM", "Com falha", "Simulação"] as const;
const COLS = "minmax(0,2fr) 132px minmax(0,1.2fr) 120px minmax(0,1.4fr)";
const NARROW = "minmax(150px,1fr) 124px";

export function ContactList({ contacts, history }: { contacts: Contact[]; history: Record<string, Hist[]> }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Todos");
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, "");
    return contacts.filter((c) => {
      if (needle && !`${c.username} ${c.keywords.join(" ")} ${c.automations.join(" ")}`.toLowerCase().includes(needle)) return false;
      const h = history[c.username] ?? [];
      if (filter === "Receberam DM") return h.some((x) => x.status === "concluida" || x.status === "andamento");
      if (filter === "Com falha") return h.some((x) => x.status === "falhou");
      if (filter === "Simulação") return h.some((x) => x.status === "simulacao");
      return true;
    });
  }, [contacts, history, q, filter]);

  const current = open ? contacts.find((c) => c.username === open) : undefined;
  const label = (u: string) => (u === "desconhecido" ? "Não identificado" : `@${u}`);

  return (
    <div className="pn-page">
      <div className="pn-row" style={{ gap: 10 }}>
        <div className="pn-search" style={{ width: 280, maxWidth: "100%" }}>
          <Icon d={ICONS.search} size={14} color="#6E6E7D" width={1.8} />
          <input type="search" className="pn-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por usuário ou palavra-chave" aria-label="Buscar contato" />
        </div>
        <div className="pn-row" style={{ gap: 6 }}>
          {FILTERS.map((f) => <button key={f} type="button" className={`pn-chip${filter === f ? " is-on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}
        </div>
        <div className="pn-spacer" style={{ fontSize: 12, color: "var(--muted)" }}>{contacts.length} contato{contacts.length === 1 ? "" : "s"}</div>
      </div>

      <div className="pn-card is-flush">
        <div className="pn-thead" data-narrow style={{ gridTemplateColumns: COLS, ["--narrow" as string]: NARROW }}>
          <div>Contato</div>
          <div className="pn-wide-only">Última interação</div>
          <div className="pn-wide-only">Palavras-chave</div>
          <div>Status</div>
          <div className="pn-wide-only">Automação</div>
        </div>
        {list.map((c) => (
          <button key={c.username} type="button" className="pn-trow" data-narrow style={{ gridTemplateColumns: COLS, ["--narrow" as string]: NARROW }} onClick={() => setOpen(c.username)}>
            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span className="pn-avatar" style={{ width: 30, height: 30 }}>{initials(c.username)}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13 }}>{label(c.username)}</span>
                <span className="pn-mono" style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>{c.count} comentário{c.count > 1 ? "s" : ""}</span>
                <span className="pn-narrow-only" style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 3 }}>{relTime(c.lastAt)} · {c.automations[0]}</span>
              </span>
            </span>
            <span className="pn-wide-only" style={{ fontSize: 12.5, color: "var(--text-3)" }}>{relTime(c.lastAt)}</span>
            <span className="pn-wide-only" style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{c.keywords.map((k) => <span className="pn-tag" key={k}>{k}</span>)}</span>
            <span><ExecBadge status={c.status} /></span>
            <span className="pn-wide-only pn-ellipsis" style={{ fontSize: 12.5, color: "var(--text-3)" }}>{c.automations.join(", ")}</span>
          </button>
        ))}
        {!list.length && (
          <div className="pn-table-empty">{contacts.length ? "Nenhum contato com esse filtro" : "Os contatos aparecem aqui quando alguém comenta uma palavra-chave."}</div>
        )}
      </div>

      {current && (
        <Drawer title={label(current.username)} subtitle={`${EXEC_STATUS[current.status].label} na última interação`} onClose={() => setOpen(null)}>
          <div className="pn-fields">
            <div className="pn-field-row"><div>Última interação</div><div>{dateTime(current.lastAt)}</div></div>
            <div className="pn-field-row"><div>Primeira interação</div><div>{dateTime(current.firstAt)}</div></div>
            <div className="pn-field-row"><div>Comentários</div><div>{current.count}</div></div>
            <div className="pn-field-row"><div>Automações</div><div>{current.automations.join(", ")}</div></div>
            {current.username !== "desconhecido" && (
              <div className="pn-field-row"><div>Perfil</div><div><a href={`https://instagram.com/${current.username}`} target="_blank" rel="noreferrer">Abrir no Instagram ↗</a></div></div>
            )}
          </div>
          <div className="pn-section-label" style={{ marginTop: 22 }}>Histórico</div>
          {(history[current.username] ?? []).map((h) => (
            <Link key={h.id} href={`/painel/execucoes?id=${h.id}`} className="pn-list-row" style={{ color: "var(--text)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pn-ellipsis" style={{ fontSize: 12.5 }}>“{h.text}”</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{h.rule} · {relTime(h.at)}</div>
              </div>
              <ExecBadge status={h.status} />
            </Link>
          ))}
        </Drawer>
      )}
    </div>
  );
}
