import Link from "next/link";
import { redirect } from "next/navigation";
import { dayKey, summarize } from "@/lib/activity";
import { num, relTime } from "@/lib/format";
import { getActivity, getConnection, getFlags, getStats } from "@/lib/panel";
import { sumCounts } from "@/lib/stats";
import { requireSession } from "@/lib/session";
import { SweepButton } from "./_components/action-buttons";
import { Bars } from "./_components/bars";
import { ExecBadge } from "./_components/exec-badge";
import { Icon } from "./_components/ui";
import { ICONS, initials } from "./_components/icons";

export default async function VisaoGeral() {
  await requireSession();
  const [conn, flags, { executions, rules }, stats] = await Promise.all([getConnection(), getFlags(), getActivity(), getStats()]);
  // Primeira vez: sem Instagram conectado não há o que mostrar; o passo a passo fica em Conexão.
  if (conn.state === "disconnected") redirect("/painel/conexao");
  const today = dayKey(Date.now());
  const todays = executions.filter((e) => dayKey(e.startedAt) === today);
  const week = summarize(executions, rules, 7);
  const t = summarize(todays, rules, 1);
  const activeCount = rules.filter((r) => r.active !== false).length;
  const lastAt = executions[0]?.lastAt;

  const gained = [...stats.values()].reduce((n, raw) => n + sumCounts(raw, 7).gained, 0);
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

  return (
    <div className="pn-page">
      <div className="pn-row">
        <div className="pn-row pn-spacer" style={{ gap: 10 }}>
          <SweepButton />
          <Link href="/painel/automacoes/nova" className="pn-btn is-primary"><Icon d={ICONS.plus} size={14} width={2} />Criar automação</Link>
        </div>
      </div>

      {conn.state !== "connected" && (
        <div className="pn-alert is-red">
          <Icon d={ICONS.error} size={17} color="#E4544F" width={1.8} style={{ marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div className="pn-alert-title">{conn.state === "error" ? "A conexão com o Instagram está com erro" : "Instagram ainda não conectado"}</div>
            <div className="pn-alert-body">{conn.state === "error" ? conn.error : "Conecte a conta para o painel ler os posts e responder comentários."}</div>
          </div>
          <Link href="/painel/conexao" className="pn-btn is-danger" style={{ fontSize: 12, padding: "6px 11px" }}>Conectar</Link>
        </div>
      )}
      {conn.state === "connected" && conn.tokenDaysLeft !== null && conn.tokenDaysLeft <= 10 && (
        <div className="pn-alert">
          <Icon d={ICONS.warn} size={17} color="#E0A526" width={1.8} style={{ marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div className="pn-alert-title">O token da Meta expira em {conn.tokenDaysLeft} dias</div>
            <div className="pn-alert-body">A varredura diária renova sozinha. Se o aviso continuar, reconecte a conta.</div>
          </div>
          <Link href="/painel/conexao" className="pn-btn is-warn" style={{ fontSize: 12, padding: "6px 11px" }}>Renovar conexão</Link>
        </div>
      )}
      {flags.paused && (
        <div className="pn-alert">
          <Icon d={ICONS.warn} size={17} color="#E0A526" width={1.8} style={{ marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div className="pn-alert-title">Automações pausadas</div>
            <div className="pn-alert-body">Nenhum comentário está sendo respondido. Use “Retomar automações” no topo.</div>
          </div>
        </div>
      )}
      {flags.dryRun && (
        <div className="pn-alert is-violet">
          <Icon d={ICONS.flask} size={17} color="#A78BFA" width={1.8} style={{ marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div className="pn-alert-title">Modo de teste ligado (DRY_RUN=true)</div>
            <div className="pn-alert-body">O painel mostra o que seria enviado, mas nenhuma DM ou resposta sai de verdade. Desligue na Vercel quando quiser ir para produção.</div>
          </div>
        </div>
      )}

      {executions.length === 0 ? (
        <div className="pn-empty">
          <div className="pn-empty-icon"><Icon d={ICONS.chat} size={20} color="#7C3AED" width={1.6} /></div>
          <div className="pn-empty-title">Nenhuma atividade registrada ainda</div>
          <div className="pn-empty-body">
            Assim que alguém comentar uma palavra-chave num post com automação ativa, os números aparecem aqui.
            {activeCount === 0 ? " Comece criando a primeira automação." : " Você pode rodar a varredura para buscar agora."}
          </div>
          <div className="pn-row" style={{ justifyContent: "center", marginTop: 18 }}>
            {activeCount === 0
              ? <Link href="/painel/automacoes/nova" className="pn-btn is-primary">Criar automação</Link>
              : <SweepButton className="pn-btn is-primary" />}
          </div>
        </div>
      ) : (
        <>
          <section className="pn-card" style={{ padding: "22px 24px" }}>
            <p className="pn-summary">
              Hoje, <b>{num(t.comments)}</b> {plural(t.comments, "pessoa comentou", "pessoas comentaram")} uma palavra-chave
              {flags.dryRun
                ? <> e <b>{num(t.simulated)}</b> {plural(t.simulated, "DM foi simulada", "DMs foram simuladas")}.</>
                : <> e <b>{num(t.dmSent)}</b> {plural(t.dmSent, "recebeu", "receberam")} a DM.</>}
              {" "}Nos últimos 7 dias foram <b>{num(week.comments)}</b> {plural(week.comments, "comentário", "comentários")}
              {gained > 0 && <>, <b className="is-gain">{num(gained)}</b> {plural(gained, "seguidor novo", "seguidores novos")}</>}
              {" "}e {week.failed ? <><b className="is-bad">{num(week.failed)}</b> {plural(week.failed, "falha", "falhas")}</> : "nenhuma falha"}.
            </p>
            <div className="pn-summary-sub">
              {activeCount} {plural(activeCount, "automação ativa", "automações ativas")}{lastAt ? `. Última atividade ${relTime(lastAt)}.` : "."}
              {week.failed > 0 && <> <Link href="/painel/execucoes?status=falhou">Ver as falhas</Link></>}
            </div>
          </section>

          <div className="pn-grid-2">
            <div className="pn-card">
              <div className="pn-row" style={{ alignItems: "baseline", gap: 10 }}>
                <div className="pn-card-title">Comentários atendidos por dia</div>
                <div className="pn-small pn-muted" style={{ fontSize: 11.5 }}>últimos 7 dias</div>
              </div>
              <Bars data={week.perDay} />
            </div>
            <div className="pn-card" style={{ paddingBottom: 8 }}>
              <div className="pn-card-title">Automações mais executadas</div>
              <div className="pn-small pn-muted" style={{ fontSize: 11.5, marginTop: 2 }}>últimos 7 dias</div>
              <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
                {week.perAutomation.slice(0, 5).map((a) => (
                  <Link key={a.id} href={`/painel/automacoes/${a.id}`} className="pn-list-row" style={{ color: "var(--text)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pn-ellipsis" style={{ fontSize: 13 }}>{a.name}</div>
                      <div style={{ fontSize: 11.5, color: a.failed ? "var(--red-text)" : "var(--muted)", marginTop: 2 }}>
                        {a.failed ? `${a.failed} com falha` : "sem falhas"}
                      </div>
                    </div>
                    <div className="pn-num" style={{ fontSize: 13, color: "var(--text-2)" }}>{a.runs}</div>
                  </Link>
                ))}
                {!week.perAutomation.length && <div className="pn-small pn-muted" style={{ padding: "12px 0" }}>Nenhuma automação criada.</div>}
              </div>
            </div>
          </div>

          <div className="pn-card" style={{ paddingBottom: 10 }}>
            <div className="pn-row">
              <div className="pn-card-title">Atividade recente</div>
              <Link href="/painel/execucoes" className="pn-spacer" style={{ fontSize: 12 }}>Ver todas as execuções</Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {executions.slice(0, 6).map((e) => (
                <Link key={e.commentId} href={`/painel/execucoes?id=${e.commentId}`} className="pn-list-row" style={{ color: "var(--text)" }}>
                  <span className="pn-avatar">{initials(e.username ?? "")}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>{e.username ? `@${e.username}` : "Usuário não identificado"} <span className="pn-muted" style={{ fontSize: 12 }}>em {e.ruleName}</span></div>
                    <div className="pn-ellipsis" style={{ fontSize: 12, color: "var(--muted)" }}>“{e.text}”</div>
                  </div>
                  <ExecBadge status={e.status} />
                  <span className="pn-hide-sm" style={{ fontSize: 11.5, color: "var(--muted-2)", width: 70, textAlign: "right" }}>{relTime(e.lastAt)}</span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
