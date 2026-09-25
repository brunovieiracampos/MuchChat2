import Link from "next/link";
import { notFound } from "next/navigation";
import { STEP_META, renderText, stepsOf } from "@/lib/flow";
import { num, relTime } from "@/lib/format";
import { postKey } from "@/lib/match";
import { PERIODS, getActivity, getStats, periodOf } from "@/lib/panel";
import { buildFunnel, funnelStages, sumCounts } from "@/lib/stats";
import { requireSession } from "@/lib/session";
import { ExecBadge } from "../../_components/exec-badge";
import { Funnel } from "../../_components/funnel";
import { Badge, Dot } from "../../_components/ui";
import { initials } from "../../_components/icons";
import { DetailActions } from "./detail-actions";

export default async function DetalheAutomacao({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ periodo?: string }> }) {
  await requireSession();
  const { id } = await params;
  const days = periodOf((await searchParams).periodo);
  const [{ rules, executions }, stats] = await Promise.all([getActivity(), getStats()]);
  const rule = rules.find((r) => r.id === id);
  if (!rule) notFound();

  const mine = executions.filter((e) => e.ruleId === id);
  const active = rule.active !== false;
  const anyPost = rule.posts.some((p) => postKey(p) === "*");
  const steps = stepsOf(rule);

  const c = sumCounts(stats.get(id) ?? {}, days);
  const funnel = buildFunnel(rule, c);
  const hasFollow = funnelStages(rule).includes("follower");
  const rate = c.dm + c.failed ? Math.round((c.dm / (c.dm + c.failed)) * 100) : null;
  const done = c.comment ? Math.round((c.done / c.comment) * 100) : null;
  const kpis = [
    { label: "Comentaram", value: num(c.comment), hint: "comentários com a palavra-chave" },
    hasFollow
      ? { label: "Novos seguidores", value: num(c.gained), hint: "não seguiam e passaram a seguir" }
      : { label: "Receberam a DM", value: num(c.dm), hint: rate === null ? "nenhuma DM no período" : `${rate}% de entrega` },
    { label: "Concluíram o fluxo", value: done === null ? "—" : `${done}%`, hint: `${num(c.done)} de ${num(c.comment)}` },
    { label: "Falhas", value: num(c.failed), hint: "mensagens recusadas pelo Instagram" },
  ];

  return (
    <div className="pn-page">
      <div className="pn-row" style={{ alignItems: "flex-start", gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <Link href="/painel/automacoes" className="pn-link-back" style={{ display: "inline-block", marginBottom: 8 }}>← Automações</Link>
          <div className="pn-row" style={{ gap: 10 }}>
            <h2 className="pn-h2">{rule.name ?? rule.id}</h2>
            <Badge tone={active ? "green" : "amber"}>{active ? "Ativa" : "Pausada"}</Badge>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, maxWidth: 560 }}>
            Responde comentários com {rule.keywords.map((k) => `“${k}”`).join(" ou ")} {anyPost ? "em qualquer post" : `em ${rule.posts.length} post${rule.posts.length > 1 ? "s" : ""}`} e segue o fluxo abaixo.
          </div>
        </div>
        <DetailActions id={rule.id} name={rule.name ?? rule.id} active={active} />
      </div>

      <div className="pn-row" style={{ gap: 10 }}>
        <div className="pn-seg" role="tablist" aria-label="Período">
          {PERIODS.map((p) => (
            <Link key={p.days} href={`/painel/automacoes/${rule.id}?periodo=${p.days}`} role="tab" aria-selected={p.days === days} className={p.days === days ? "is-on" : ""} scroll={false}>{p.label}</Link>
          ))}
        </div>
      </div>

      <div className="pn-grid-kpi" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {kpis.map((k) => (
          <div className="pn-kpi" key={k.label}>
            <div className="pn-kpi-label">{k.label}</div>
            <div className="pn-kpi-value" style={{ fontSize: 26, marginTop: 10 }}>{k.value}</div>
            <div className="pn-kpi-delta">{k.hint}</div>
          </div>
        ))}
      </div>

      <div className="pn-card">
        <div className="pn-row" style={{ alignItems: "baseline", gap: 10 }}>
          <div className="pn-card-title">Funil</div>
          <div className="pn-small pn-muted" style={{ fontSize: 11.5 }}>cada pessoa conta uma vez por comentário</div>
        </div>
        {c.comment ? <Funnel rows={funnel} /> : <div className="pn-small pn-muted" style={{ padding: "14px 0 4px" }}>Ninguém comentou a palavra-chave no período.</div>}
      </div>

      <div className="pn-grid-2" style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)" }}>
        <div className="pn-card" style={{ paddingBottom: 10 }}>
          <div className="pn-row">
            <div className="pn-card-title">Execuções recentes</div>
            {mine.length > 0 && <Link href={`/painel/execucoes?automacao=${rule.id}`} className="pn-spacer" style={{ fontSize: 12 }}>Ver todas</Link>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
            {mine.slice(0, 8).map((e) => (
              <Link key={e.commentId} href={`/painel/execucoes?id=${e.commentId}`} className="pn-list-row" style={{ color: "var(--text)" }}>
                <span className="pn-avatar" style={{ width: 26, height: 26, fontSize: 10.5 }}>{initials(e.username ?? "")}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}>{e.username ? `@${e.username}` : "Usuário não identificado"}</div>
                  <div className="pn-ellipsis" style={{ fontSize: 11.5, color: "var(--muted)" }}>{e.step}</div>
                </div>
                <ExecBadge status={e.status} />
                <span className="pn-mono pn-hide-sm" style={{ fontSize: 11.5, color: "var(--muted-2)", width: 72, textAlign: "right" }}>{relTime(e.lastAt)}</span>
              </Link>
            ))}
            {!mine.length && <div className="pn-small pn-muted" style={{ padding: "14px 0" }}>Ninguém comentou a palavra-chave ainda.</div>}
          </div>
        </div>

        <div className="pn-card">
          <div className="pn-row">
            <div className="pn-card-title">Configuração</div>
            <Link href={`/painel/automacoes/${rule.id}/editar`} className="pn-spacer" style={{ fontSize: 12 }}>Editar</Link>
          </div>
          <div className="pn-fields" style={{ marginTop: 12 }}>
            <div className="pn-field-row"><div>Palavras-chave</div><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{rule.keywords.map((k) => <span className="pn-tag" key={k}>{k}</span>)}</div></div>
            <div className="pn-field-row"><div>Posts</div><div>{anyPost ? "Qualquer post ou Reels" : rule.posts.map((p) => <div key={p} className="pn-mono" style={{ fontSize: 11.5 }}>{/^https?:/.test(p) ? <a href={p} target="_blank" rel="noreferrer">{postKey(p)}</a> : postKey(p)}</div>)}</div></div>
            <div className="pn-field-row"><div>Link</div><div>{rule.link ? <a href={rule.link} target="_blank" rel="noreferrer" className="pn-ellipsis" style={{ display: "block" }}>{rule.link}</a> : "—"}</div></div>
            <div className="pn-field-row"><div>Alterada</div><div>{rule.updatedAt ? relTime(rule.updatedAt) : "—"}</div></div>
          </div>
          <div className="pn-section-label" style={{ marginTop: 18 }}>Fluxo</div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {steps.map((s, i) => (
              <li key={s.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5 }}>
                <span className="pn-mono" style={{ fontSize: 11, color: "var(--muted-2)", width: 14, marginTop: 1 }}>{i + 1}</span>
                <span style={{ marginTop: 5 }}><Dot color={STEP_META[s.type].color} size={7} /></span>
                <div style={{ minWidth: 0 }}>
                  <div>{STEP_META[s.type].label}{s.type === "dm" && s.button ? ` · botão “${s.button.title}”` : ""}</div>
                  <div className="pn-ellipsis" style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {s.type === "reply" ? `“${s.replies[0] ?? ""}”` : s.type === "dm" ? renderText(s.text, rule.link, "usuario") : `Botão “${s.button}”`}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
