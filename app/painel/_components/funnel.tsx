import type { Counts, FunnelRow, Stage } from "@/lib/stats";
import { num } from "@/lib/format";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** O que fazer quando a maior perda do fluxo acontece antes desta etapa. */
const TIP: Partial<Record<Stage, string>> = {
  dm: "Parte das DMs não saiu. Veja o motivo em Execuções.",
  click: "Muita gente recebe a DM e não toca no botão. Teste um texto de botão mais direto ou uma mensagem mais curta.",
  follower: "Muita gente para no pedido para seguir. Deixe claro o que a pessoa ganha ao seguir.",
  done: "Muita gente para antes do último bloco. Confira se o fluxo pede um clique a mais no fim.",
};

/** Etapa com a menor taxa de passagem, se a perda for relevante e houver volume para confiar nela. */
function biggestDrop(rows: FunnelRow[]): Stage | null {
  let worst: FunnelRow | null = null;
  for (const r of rows.slice(1)) {
    if (r.ofPrev === null || r.ofPrev > 0.85) continue;
    if (!worst || r.ofPrev < worst.ofPrev!) worst = r;
  }
  return worst && rows[0].value >= 10 ? worst.stage : null;
}

export function FunnelSummary({ c, hasFollow }: { c: Counts; hasFollow: boolean }) {
  const done = c.comment ? pct(c.done / c.comment) : "";
  return (
    <p className="pn-funnel-summary">
      De <b>{num(c.comment)}</b> {c.comment === 1 ? "comentário" : "comentários"}, <b>{num(c.done)}</b> {c.done === 1 ? "chegou" : "chegaram"} ao fim do fluxo ({done})
      {hasFollow ? <> e <b className="is-gain">{num(c.gained)}</b> {c.gained === 1 ? "virou seguidor" : "viraram seguidores"}.</> : "."}
    </p>
  );
}

/**
 * Funil em degraus: a barra cheia é quem chegou à etapa; o trecho apagado é quem estava na etapa anterior e parou.
 * A maior perda fica em âmbar, com uma sugestão.
 */
export function Funnel({ rows, c }: { rows: FunnelRow[]; c: Counts }) {
  const worst = biggestDrop(rows);
  const first = rows[0].value || 1;
  return (
    <ol className="pn-funnel">
      {rows.map((r, i) => {
        const prev = i ? rows[i - 1].value : r.value;
        const lost = Math.max(0, prev - r.value);
        const isWorst = r.stage === worst;
        return (
          <li key={r.stage} className={isWorst ? "is-worst" : undefined}>
            <div className="pn-funnel-head">
              <span className="pn-funnel-label">{r.label}</span>
              <span className="pn-funnel-value">{num(r.value)}</span>
            </div>
            <div className="pn-funnel-track" role="img" aria-label={`${r.label}: ${r.value}${i ? `, ${lost} pararam na etapa anterior` : ""}`}>
              <div className="pn-funnel-fill" style={{ width: `${(r.value / first) * 100}%` }} />
              {lost > 0 && <div className="pn-funnel-lost" style={{ width: `${(lost / first) * 100}%` }} />}
            </div>
            {i > 0 && (
              <div className="pn-funnel-meta">
                <span>{r.ofPrev === null ? "—" : `${pct(r.ofPrev)} passaram da etapa anterior`}</span>
                {lost > 0 && <span className="pn-funnel-lostn">{num(lost)} {lost === 1 ? "parou" : "pararam"}</span>}
              </div>
            )}
            {r.stage === "follower" && c.gained > 0 && (
              <div className="pn-funnel-gain">{num(c.gained)} {c.gained === 1 ? "não seguia e começou" : "não seguiam e começaram"} a seguir no fluxo</div>
            )}
            {isWorst && TIP[r.stage] && <div className="pn-funnel-tip">Maior perda do fluxo. {TIP[r.stage]}</div>}
          </li>
        );
      })}
    </ol>
  );
}
