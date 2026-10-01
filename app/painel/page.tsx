import Link from "next/link";
import { redirect } from "next/navigation";
import { buildContacts } from "@/lib/activity";
import { dateShort, num, relTime } from "@/lib/format";
import { signedUrls } from "@/lib/media-store";
import {
  answered, automationStatus, calendarItems, dailyComments, mediaSince, overallFunnel, periodStart, topByComments, totals, weekOf,
} from "@/lib/overview";
import { getAccount, getActivity, getConnection, getFlags, getMediaSince, getPosts, getProfile, getStats } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { SweepButton } from "./_components/action-buttons";
import { ExecBadge } from "./_components/exec-badge";
import { Funnel } from "./_components/funnel";
import { ColumnChart, StatusBar, WeekCalendar } from "./_components/overview-client";
import { Icon } from "./_components/ui";
import { ICONS, initials } from "./_components/icons";

const PERIODS = [7, 30, 90] as const;

type Search = { periodo?: string; semana?: string };

export default async function VisaoGeral({ searchParams }: { searchParams: Promise<Search> }) {
  await requireSession();
  const sp = await searchParams;
  const p = Number(sp.periodo);
  const days = (PERIODS as readonly number[]).includes(p) ? p : 7;
  const offset = Math.max(-52, Math.min(52, Math.trunc(Number(sp.semana) || 0)));
  const week = weekOf(offset);
  const since = periodStart(days);

  const [conn, flags, { executions, rules }, stats, posts, profile, account] = await Promise.all([
    getConnection(), getFlags(), getActivity(), getStats(), getPosts(), getProfile(), getAccount(),
  ]);
  // Primeira vez: sem Instagram conectado não há o que mostrar; o passo a passo fica em Conexão.
  if (conn.state === "disconnected") redirect("/painel/conexao");

  const media = await getMediaSince(Math.min(since, week.from));
  const weekPosts = posts.filter((x) => { const at = x.publishedAt ?? x.scheduledAt; return at && at >= week.from && at <= week.to && x.media.length && !x.mediaDeletedAt; });
  const thumbs = account && weekPosts.length ? await signedUrls(account.accountId, weekPosts.map((x) => x.media[0].path), 3600e3).catch(() => ({})) : {};

  const items = calendarItems(week, posts, media, rules, stats, thumbs);
  const status = automationStatus(rules);
  const c = totals(stats, days);
  const periodMedia = mediaSince(media, since);
  const received = periodMedia.reduce((n, m) => n + (m.comments_count ?? 0), 0);
  const top = topByComments(periodMedia, 5);
  const topMax = Math.max(1, ...top.map((m) => m.comments_count ?? 0));
  const contacts = buildContacts(executions).filter((x) => x.username !== "desconhecido").slice(0, 5);
  const perDay = dailyComments(stats, days);
  const funnel = overallFunnel(rules, c);

  const href = (q: Partial<{ periodo: number; semana: number }>) => {
    const s = new URLSearchParams();
    const per = q.periodo ?? days, wk = q.semana ?? offset;
    if (per !== 7) s.set("periodo", String(per));
    if (wk) s.set("semana", String(wk));
    const qs = s.toString();
    return qs ? `/painel?${qs}` : "/painel";
  };
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const weekLabel = offset === 0 ? "Esta semana" : offset === 1 ? "Próxima semana" : offset === -1 ? "Semana passada" : `Semana de ${week.days[0].date}`;

  return (
    <div className="pn-page">
      {/* ---------- perfil ---------- */}
      <section className="ov-profile">
        <div className="ov-profile-id">
          {profile?.profile_picture_url
            ? <img src={profile.profile_picture_url} alt="" className="ov-profile-pic" />
            : <span className="ov-profile-pic is-empty">{initials(conn.state === "connected" ? conn.username ?? "" : "")}</span>}
          <div style={{ minWidth: 0 }}>
            <div className="ov-profile-name">{profile?.name || `@${conn.username ?? ""}`}</div>
            <div className="pn-muted pn-small">@{profile?.username ?? conn.username ?? ""}</div>
          </div>
        </div>
        <dl className="ov-profile-stats">
          <div><dt>Publicações</dt><dd>{profile?.media_count !== undefined ? num(profile.media_count) : "-"}</dd></div>
          <div><dt>Seguidores</dt><dd>{profile?.followers_count !== undefined ? num(profile.followers_count) : "-"}</dd></div>
          <div><dt>Seguindo</dt><dd>{profile?.follows_count !== undefined ? num(profile.follows_count) : "-"}</dd></div>
        </dl>
        <div className="ov-profile-actions">
          <SweepButton />
          <Link href="/painel/automacoes/nova" className="pn-btn is-primary"><Icon d={ICONS.plus} size={14} width={2} />Criar automação</Link>
        </div>
      </section>
      {!profile && conn.state === "connected" && <p className="pn-small pn-muted" style={{ marginTop: -6 }}>Não foi possível ler os números do perfil agora. Eles aparecem na próxima vez que a página carregar.</p>}

      {conn.state !== "connected" && (
        <div className="pn-alert is-red">
          <Icon d={ICONS.error} size={17} color="var(--red)" width={1.8} style={{ marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div className="pn-alert-title">{conn.state === "error" ? "A conexão com o Instagram está com erro" : "Instagram ainda não conectado"}</div>
            <div className="pn-alert-body">{conn.state === "error" ? conn.error : "Conecte a conta para o painel ler os posts e responder comentários."}</div>
          </div>
          <Link href="/painel/conexao" className="pn-btn is-danger">Conectar</Link>
        </div>
      )}
      {conn.state === "connected" && conn.tokenDaysLeft !== null && conn.tokenDaysLeft <= 10 && (
        <div className="pn-alert">
          <Icon d={ICONS.warn} size={17} color="var(--amber)" width={1.8} style={{ marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div className="pn-alert-title">O token da Meta expira em {conn.tokenDaysLeft} dias</div>
            <div className="pn-alert-body">A varredura diária renova sozinha. Se o aviso continuar, reconecte a conta.</div>
          </div>
          <Link href="/painel/conexao" className="pn-btn is-warn">Renovar conexão</Link>
        </div>
      )}
      {flags.paused && (
        <div className="pn-alert">
          <Icon d={ICONS.warn} size={17} color="var(--amber)" width={1.8} style={{ marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div className="pn-alert-title">Automações pausadas</div>
            <div className="pn-alert-body">Nenhum comentário está sendo respondido. Use “Retomar automações” no topo.</div>
          </div>
        </div>
      )}
      {flags.dryRun && (
        <div className="pn-alert is-violet">
          <Icon d={ICONS.flask} size={17} color="var(--violet-3)" width={1.8} style={{ marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div className="pn-alert-title">Modo de teste ligado (DRY_RUN=true)</div>
            <div className="pn-alert-body">O painel mostra o que seria enviado, mas nenhuma DM ou resposta sai de verdade. Desligue na Vercel quando quiser ir para produção.</div>
          </div>
        </div>
      )}

      {/* ---------- calendário da semana ---------- */}
      <section className="pn-card ov-card">
        <div className="ov-card-head">
          <div>
            <h2 className="pn-card-title">Publicações da semana</h2>
            <div className="pn-card-sub">{weekLabel}, {week.days[0].date} a {week.days[6].date}. Clique numa publicação para ver os detalhes.</div>
          </div>
          <nav className="ov-week-nav" aria-label="Navegar entre semanas">
            <Link href={href({ semana: offset - 1 })} className="pn-btn is-sm" scroll={false} aria-label="Semana anterior">‹</Link>
            {offset !== 0 && <Link href={href({ semana: 0 })} className="pn-btn is-sm" scroll={false}>Hoje</Link>}
            <Link href={href({ semana: offset + 1 })} className="pn-btn is-sm" scroll={false} aria-label="Próxima semana">›</Link>
            <Link href="/painel/publicacoes/nova" className="pn-btn is-sm is-primary"><Icon d={ICONS.plus} size={12} width={2} />Nova publicação</Link>
          </nav>
        </div>
        <WeekCalendar days={week.days} items={items} />
        {!items.length && <p className="pn-small pn-muted" style={{ marginTop: 12 }}>Nenhuma publicação nesta semana.</p>}
      </section>

      {/* ---------- resultados do período ---------- */}
      <div className="ov-filter">
        <h2 className="pn-h2" style={{ fontSize: 20 }}>Resultados das automações</h2>
        <div className="pn-seg" role="tablist" aria-label="Período">
          {PERIODS.map((d) => (
            <Link key={d} href={href({ periodo: d })} role="tab" aria-selected={d === days} className={d === days ? "is-on" : ""} scroll={false}>{d} dias</Link>
          ))}
        </div>
      </div>

      <div className="ov-kpis">
        <div className="pn-kpi">
          <div className="pn-kpi-label">Comentários recebidos</div>
          <div className="pn-kpi-value">{num(received)}</div>
          <div className="pn-kpi-delta">em {periodMedia.length} {plural(periodMedia.length, "post publicado", "posts publicados")} no período</div>
        </div>
        <div className="pn-kpi">
          <div className="pn-kpi-label">Respondidos pela automação</div>
          <div className="pn-kpi-value">{num(answered(c))}</div>
          <div className="pn-kpi-delta">{num(c.comment)} {plural(c.comment, "comentário", "comentários")} com palavra-chave</div>
        </div>
        <div className="pn-kpi">
          <div className="pn-kpi-label">DMs enviadas</div>
          <div className="pn-kpi-value">{num(c.dm)}</div>
          <div className="pn-kpi-delta">{num(c.click)} {plural(c.click, "clique", "cliques")} no botão</div>
        </div>
        <div className="pn-kpi">
          <div className="pn-kpi-label">Novos seguidores</div>
          <div className="pn-kpi-value">{num(c.gained)}</div>
          <div className="pn-kpi-delta">não seguiam e passaram a seguir no fluxo</div>
        </div>
      </div>

      <div className="pn-grid-2">
        <section className="pn-card ov-card">
          <h2 className="pn-card-title">Comentários com palavra-chave</h2>
          <div className="pn-card-sub">{days > 31 ? "Por semana" : "Por dia"}, últimos {days} dias</div>
          <ColumnChart data={perDay} unit={["comentário", "comentários"]} weekly={days > 31} />
        </section>
        <section className="pn-card ov-card">
          <h2 className="pn-card-title">Funil do período</h2>
          <div className="pn-card-sub">Todas as automações somadas</div>
          {c.comment ? <Funnel rows={funnel} c={c} /> : <p className="pn-small pn-muted" style={{ marginTop: 18 }}>Nenhum comentário com palavra-chave no período.</p>}
        </section>
      </div>

      <div className="pn-grid-2 ov-grid-even">
        <section className="pn-card ov-card">
          <div className="ov-card-head">
            <div>
              <h2 className="pn-card-title">Publicações com mais comentários</h2>
              <div className="pn-card-sub">Posts publicados nos últimos {days} dias</div>
            </div>
          </div>
          {top.length ? (
            <ol className="ov-top">
              {top.map((m) => {
                const n = m.comments_count ?? 0;
                return (
                  <li key={m.id}>
                    <a href={m.permalink} target="_blank" rel="noreferrer" className="ov-top-row">
                      {m.thumbnail_url || m.media_url ? <img src={m.thumbnail_url ?? m.media_url} alt="" className="ov-top-thumb" /> : <span className="ov-top-thumb" />}
                      <span className="ov-top-main">
                        <span className="ov-top-caption">{m.caption?.split("\n")[0] || "Sem legenda"}</span>
                        <span className="ov-top-bar-row">
                          <span className="ov-top-bar" style={{ width: `calc(${n / topMax} * (100% - 48px))` }} />
                          <span className="ov-top-val">{num(n)}</span>
                        </span>
                      </span>
                      <span className="ov-top-date">{m.timestamp ? dateShort(Date.parse(m.timestamp)) : ""}</span>
                    </a>
                  </li>
                );
              })}
            </ol>
          ) : <p className="pn-small pn-muted" style={{ marginTop: 14 }}>Nenhum post com comentários publicado no período.</p>}
        </section>

        <div className="ov-stack-col">
          <section className="pn-card ov-card">
            <div className="ov-card-head">
              <div>
                <h2 className="pn-card-title">Automações</h2>
                <div className="pn-card-sub">{status.total} {plural(status.total, "automação criada", "automações criadas")}</div>
              </div>
              <Link href="/painel/automacoes" className="pn-small">Ver todas</Link>
            </div>
            <StatusBar slices={[
              { key: "active", label: "Ativas", value: status.active, color: "var(--chart-active)", hint: "Ligadas e respondendo comentários" },
              { key: "waiting", label: "Aguardando post", value: status.waiting, color: "var(--chart-waiting)", hint: "Ligadas, esperando a publicação sair" },
              { key: "paused", label: "Pausadas", value: status.paused, color: "var(--chart-paused)", hint: "Desligadas" },
            ]} />
          </section>

          <section className="pn-card ov-card">
            <div className="ov-card-head">
              <div>
                <h2 className="pn-card-title">Últimos contatos</h2>
                <div className="pn-card-sub">Quem comentou uma palavra-chave por último</div>
              </div>
              <Link href="/painel/contatos" className="pn-small">Ver todos</Link>
            </div>
            {contacts.length ? (
              <div className="ov-contacts">
                {contacts.map((x) => (
                  <div key={x.username} className="pn-list-row">
                    <span className="pn-avatar">{initials(x.username)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pn-ellipsis" style={{ fontSize: 14 }}>@{x.username}</div>
                      <div className="pn-ellipsis pn-muted" style={{ fontSize: 12 }}>{x.automations[0]}{x.count > 1 ? `, ${x.count} interações` : ""}</div>
                    </div>
                    <ExecBadge status={x.status} />
                    <span className="pn-hide-sm pn-muted" style={{ fontSize: 12, width: 64, textAlign: "right" }}>{relTime(x.lastAt)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="pn-small pn-muted" style={{ marginTop: 14 }}>Ninguém interagiu com as automações ainda.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
