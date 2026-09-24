import Link from "next/link";
import { summarize } from "@/lib/activity";
import { num } from "@/lib/format";
import { getActivity } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { Bars } from "../_components/bars";

const PERIODS = [7, 30, 90] as const;

export default async function Metricas({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await requireSession();
  const p = Number((await searchParams).periodo);
  const days = (PERIODS as readonly number[]).includes(p) ? p : 7;
  const { executions, rules } = await getActivity();
  const cur = summarize(executions, rules, days);
  const prev = summarize(executions.filter((e) => e.startedAt < Date.now() - days * 864e5), rules, days, Date.now() - days * 864e5);
  const delta = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs. período anterior` : "sem dados do período anterior");
  const delivered = cur.dmSent + cur.failed ? Math.round((cur.dmSent / (cur.dmSent + cur.failed)) * 100) : null;
  const maxKw = Math.max(1, ...cur.perKeyword.map((k) => k.count));

  const kpis = [
    { label: "Comentários com palavra-chave", value: num(cur.comments), delta: delta(cur.comments, prev.comments) },
    { label: "DMs enviadas", value: num(cur.dmSent), delta: cur.simulated ? `${cur.simulated} simuladas em modo de teste` : delta(cur.dmSent, prev.dmSent) },
    { label: "Comentários respondidos", value: num(cur.replies), delta: "resposta pública após a DM" },
    { label: "Taxa de entrega", value: delivered === null ? "—" : `${delivered}%`, delta: `${cur.failed} falha${cur.failed === 1 ? "" : "s"}` },
  ];

  return (
    <div className="pn-page">
      <div className="pn-row" style={{ gap: 10 }}>
        <div className="pn-seg" role="tablist" aria-label="Período">
          {PERIODS.map((d) => (
            <Link key={d} href={`/painel/metricas?periodo=${d}`} role="tab" aria-selected={d === days} className={d === days ? "is-on" : ""} scroll={false}>{d} dias</Link>
          ))}
        </div>
        <div className="pn-small pn-muted">Com base no registro de eventos do painel (últimos 2.000).</div>
      </div>

      <div className="pn-grid-kpi" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {kpis.map((k) => (
          <div className="pn-kpi" key={k.label}>
            <div className="pn-kpi-label">{k.label}</div>
            <div className="pn-kpi-value" style={{ fontSize: 26, marginTop: 10 }}>{k.value}</div>
            <div className="pn-kpi-delta">{k.delta}</div>
          </div>
        ))}
      </div>

      <div className="pn-grid-2" style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)" }}>
        <div className="pn-card">
          <div className="pn-row" style={{ alignItems: "baseline", gap: 10 }}>
            <div className="pn-card-title">Volume por período</div>
            <div className="pn-small pn-muted" style={{ fontSize: 11.5 }}>{days > 31 ? "por semana" : "por dia"}</div>
          </div>
          <Bars data={cur.perDay} height={200} />
        </div>
        <div className="pn-card">
          <div className="pn-card-title">Palavras-chave mais usadas</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 16 }}>
            {cur.perKeyword.slice(0, 8).map((k) => (
              <div key={k.keyword}>
                <div className="pn-row" style={{ alignItems: "baseline", gap: 8 }}>
                  <span className="pn-mono" style={{ fontSize: 12, color: "var(--text-2)" }}>{k.keyword}</span>
                  <span className="pn-spacer" style={{ fontSize: 11.5, color: "var(--muted)" }}>{k.count}</span>
                </div>
                <div className="pn-hbar"><div style={{ width: `${Math.round((k.count / maxKw) * 100)}%` }} /></div>
              </div>
            ))}
            {!cur.perKeyword.length && <div className="pn-small pn-muted">Sem comentários no período.</div>}
          </div>
        </div>
      </div>

      <div className="pn-card is-flush">
        <div className="pn-thead" style={{ gridTemplateColumns: "minmax(0,2fr) 110px 110px" }}>
          <div>Automação</div><div style={{ textAlign: "right" }}>Execuções</div><div style={{ textAlign: "right" }}>Falhas</div>
        </div>
        {cur.perAutomation.map((a) => (
          <Link key={a.id} href={`/painel/automacoes/${a.id}`} className="pn-trow" style={{ gridTemplateColumns: "minmax(0,2fr) 110px 110px", color: "var(--text)" }}>
            <div className="pn-ellipsis pn-cell-main">{a.name}</div>
            <div className="pn-mono" style={{ textAlign: "right", fontSize: 12.5 }}>{a.runs}</div>
            <div className="pn-mono" style={{ textAlign: "right", fontSize: 12.5, color: a.failed ? "var(--red-text)" : "var(--muted)" }}>{a.failed}</div>
          </Link>
        ))}
        {!cur.perAutomation.length && <div className="pn-table-empty">Nenhuma automação criada.</div>}
      </div>
    </div>
  );
}
