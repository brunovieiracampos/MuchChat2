import type { FunnelRow } from "@/lib/stats";
import { num } from "@/lib/format";

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** Funil de uma automação: largura da barra = fração de quem comentou. */
export function Funnel({ rows }: { rows: FunnelRow[] }) {
  return (
    <ol className="pn-funnel">
      {rows.map((r, i) => (
        <li key={r.stage}>
          <div className="pn-funnel-head">
            <span className="pn-funnel-label" title={r.hint}>{r.label}</span>
            <span className="pn-funnel-value">{num(r.value)}</span>
          </div>
          <div className="pn-funnel-track" aria-hidden>
            <div style={{ width: `${Math.max(r.value ? 2 : 0, Math.round((r.ofFirst ?? 0) * 100))}%` }} />
          </div>
          <div className="pn-funnel-meta">
            {i === 0 ? r.hint : <>{pct(r.ofPrev)} da etapa anterior · {pct(r.ofFirst)} do total</>}
          </div>
        </li>
      ))}
    </ol>
  );
}
