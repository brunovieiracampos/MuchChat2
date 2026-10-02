import Link from "next/link";
import { dayKey } from "@/lib/activity";
import { hourMinute } from "@/lib/format";
import { signedUrls } from "@/lib/media-store";
import { addDays, calendarItems, customRange, isDayKey, monthGrid, shiftMonth, weekContaining, type CalRange } from "@/lib/overview";
import { getAccount, getActivity, getConnection, getMediaSince, getPosts, getStats } from "@/lib/panel";
import { KIND_LABEL, STATUS_META, type ScheduledPost } from "@/lib/posts";
import { requireSession } from "@/lib/session";
import { Badge, Icon } from "../_components/ui";
import { ICONS } from "../_components/icons";
import { CalendarPanel, type CalView, type StatusFilter } from "./calendar";

const UPCOMING = new Set(["scheduled", "preparing", "publishing"]);
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function PostRow({ p, thumb, automation }: { p: ScheduledPost; thumb?: string; automation?: string }) {
  const s = STATUS_META[p.status];
  const when = p.status === "published" && p.publishedAt ? p.publishedAt : p.scheduledAt;
  return (
    <Link href={`/painel/publicacoes/${p.id}`} className="pn-post-row" style={{ color: "var(--text)" }}>
      <span className={`pn-post-thumb${p.kind === "story" ? " is-story" : ""}`}>
        {thumb ? <img src={thumb} alt="" /> : <Icon d={ICONS.image} size={18} color="var(--muted-2)" />}
        {p.media.length > 1 && <span className="pn-post-count">{p.media.length}</span>}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="pn-row" style={{ gap: 8 }}>
          <span className="pn-num" style={{ fontSize: 13.5, fontWeight: 500 }}>{when ? hourMinute(when) : "Sem horário"}</span>
          <span className="pn-muted" style={{ fontSize: 12 }}>{KIND_LABEL[p.kind]}</span>
          {automation && <span className="pn-tag" title="Automação ligada">{automation}</span>}
        </span>
        <span className="pn-ellipsis" style={{ display: "block", fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
          {p.kind === "story" ? "Story" : p.caption.split("\n")[0] || "Sem legenda"}
        </span>
      </span>
      <Badge tone={s.tone}>{s.label}</Badge>
    </Link>
  );
}

type Search = { vista?: string; data?: string; de?: string; ate?: string; status?: string };

export default async function Publicacoes({ searchParams }: { searchParams: Promise<Search> }) {
  await requireSession();
  const sp = await searchParams;
  const today = dayKey(Date.now());
  const view: CalView = sp.vista === "semana" || sp.vista === "periodo" ? sp.vista : "mes";
  const status: StatusFilter = sp.status === "publicados" || sp.status === "agendados" ? sp.status : "todos";
  const anchor = isDayKey(sp.data) ? sp.data : today;
  const from = isDayKey(sp.de) ? sp.de : today;
  const to = isDayKey(sp.ate) ? sp.ate : addDays(from, 29);

  const range: CalRange = view === "mes" ? monthGrid(anchor) : view === "semana" ? weekContaining(anchor) : customRange(from, to);
  const first = range.days[0], last = range.days[range.days.length - 1];

  const [conn, posts, { rules }, account, stats] = await Promise.all([getConnection(), getPosts(), getActivity(), getAccount(), getStats()]);
  const media = conn.state === "connected" ? await getMediaSince(range.from) : [];
  const inRange = posts.filter((p) => { const t = p.publishedAt ?? p.scheduledAt; return t && t >= range.from && t <= range.to; });
  const drafts = posts.filter((p) => p.status === "draft" || p.status === "canceled").sort((a, b) => b.updatedAt - a.updatedAt);
  const withMedia = [...inRange, ...drafts].filter((p) => p.media.length && !p.mediaDeletedAt).map((p) => p.media[0].path);
  const thumbs = account && withMedia.length ? await signedUrls(account.accountId, withMedia, 3600e3).catch(() => ({} as Record<string, string>)) : {};
  // Todas as publicações do intervalo, cada uma com o seu status; o filtro de status roda no navegador.
  const items = calendarItems(range, posts, media, rules, stats, thumbs);
  const upcoming = posts.filter((p) => UPCOMING.has(p.status)).length;
  const names = new Map(rules.map((r) => [r.id, r.name ?? r.id]));

  // Links da barra (sem o status, que o navegador acrescenta): mudam a vista ou o dia de referência.
  const href = (q: { vista?: CalView; data?: string }) => {
    const s = new URLSearchParams();
    const v = q.vista ?? view;
    if (v !== "mes") s.set("vista", v);
    if (v === "periodo") { s.set("de", from); s.set("ate", to); }
    else { const d = q.data ?? anchor; if (d !== today) s.set("data", d); }
    const qs = s.toString();
    return qs ? `/painel/publicacoes?${qs}` : "/painel/publicacoes";
  };
  const [y, m] = anchor.split("-").map(Number);
  const monthName = MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1);
  const title = view === "mes" ? `${monthName} de ${y}` : `${first.date} a ${last.date}${view === "periodo" ? ` de ${last.key.slice(0, 4)}` : ""}`;
  const isCurrent = view === "mes" ? anchor.slice(0, 7) === today.slice(0, 7) : range.days.some((d) => d.isToday);
  const links = {
    prev: view === "periodo" ? undefined : href({ data: view === "mes" ? shiftMonth(anchor, -1) : addDays(first.key, -7) }),
    next: view === "periodo" ? undefined : href({ data: view === "mes" ? shiftMonth(anchor, 1) : addDays(first.key, 7) }),
    today: view === "periodo" || isCurrent ? undefined : href({ data: today }),
    views: { mes: href({ vista: "mes" }), semana: href({ vista: "semana" }), periodo: href({ vista: "periodo" }) },
  };
  const canCreate = conn.state === "connected";

  return (
    <div className="pn-page">
      <div className="pn-row">
        <p className="pn-summary" style={{ fontSize: 18 }}>
          {upcoming ? <><b>{upcoming}</b> {upcoming === 1 ? "publicação agendada" : "publicações agendadas"}.</> : "Nenhuma publicação agendada."}
          {canCreate && <span className="pn-muted" style={{ fontSize: 14, marginLeft: 8 }}>Clique num dia para agendar nele.</span>}
        </p>
        {canCreate && <Link href="/painel/publicacoes/nova" className="pn-btn is-primary pn-spacer"><Icon d={ICONS.plus} size={14} width={2} />Nova publicação</Link>}
      </div>

      {!canCreate && (
        <div className="pn-alert"><Icon d={ICONS.warn} size={17} color="var(--amber)" width={1.8} style={{ marginTop: 1 }} />
          <div><div className="pn-alert-title">Conecte o Instagram para agendar</div><div className="pn-alert-body"><Link href="/painel/conexao">Ir para Conexão</Link></div></div>
        </div>
      )}

      <CalendarPanel view={view} title={title} links={links} period={view === "periodo" ? { from, to } : undefined}
        days={range.days} items={items} canCreate={canCreate} initialStatus={status}>
        {drafts.length > 0 && (
          <section className="pn-card" style={{ padding: "14px 18px 6px" }}>
            <div className="pn-card-title">Rascunhos e canceladas</div>
            <div className="pn-card-sub">Sem data no calendário. Abra para escolher o horário.</div>
            <div style={{ marginTop: 4 }}>
              {drafts.map((p) => <PostRow key={p.id} p={p} thumb={p.media[0] ? thumbs[p.media[0].path] : undefined} automation={p.automationId ? names.get(p.automationId) : undefined} />)}
            </div>
          </section>
        )}
      </CalendarPanel>
    </div>
  );
}
