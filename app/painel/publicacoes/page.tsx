import Link from "next/link";
import { dayName, hourMinute, relTime } from "@/lib/format";
import { signedUrls } from "@/lib/media-store";
import { getAccount, getActivity, getConnection, getPosts } from "@/lib/panel";
import { KIND_LABEL, STATUS_META, type ScheduledPost } from "@/lib/posts";
import { requireSession } from "@/lib/session";
import { Badge, Icon } from "../_components/ui";
import { ICONS } from "../_components/icons";

const UPCOMING = new Set(["scheduled", "preparing", "publishing"]);

function PostRow({ p, thumb, automation }: { p: ScheduledPost; thumb?: string; automation?: string }) {
  const s = STATUS_META[p.status];
  const when = p.status === "published" && p.publishedAt ? p.publishedAt : p.scheduledAt;
  return (
    <Link href={`/painel/publicacoes/${p.id}`} className="pn-post-row" style={{ color: "var(--text)" }}>
      <span className={`pn-post-thumb${p.kind === "story" ? " is-story" : ""}`}>
        {thumb ? <img src={thumb} alt="" /> : <Icon d={ICONS.image} size={18} color="#6E6E7D" />}
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
        {p.error && <span className="pn-ellipsis" style={{ display: "block", fontSize: 12, color: p.status === "failed" ? "var(--red-text)" : "var(--amber)", marginTop: 3 }}>{p.error}</span>}
      </span>
      <Badge tone={s.tone}>{s.label}</Badge>
    </Link>
  );
}

export default async function Publicacoes() {
  await requireSession();
  const [conn, posts, { rules }, account] = await Promise.all([getConnection(), getPosts(), getActivity(), getAccount()]);
  const firstMedia = posts.filter((p) => p.media.length && !p.mediaDeletedAt).map((p) => p.media[0].path);
  const thumbs = account ? await signedUrls(account.accountId, firstMedia, 3600e3) : {};
  const names = new Map(rules.map((r) => [r.id, r.name ?? r.id]));
  const row = (p: ScheduledPost) => <PostRow key={p.id} p={p} thumb={p.media[0] ? thumbs[p.media[0].path] : undefined} automation={p.automationId ? names.get(p.automationId) : undefined} />;

  const upcoming = posts.filter((p) => UPCOMING.has(p.status)).sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
  const drafts = posts.filter((p) => p.status === "draft" || p.status === "canceled").sort((a, b) => b.updatedAt - a.updatedAt);
  const done = posts.filter((p) => p.status === "published" || p.status === "failed").sort((a, b) => (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt)).slice(0, 30);
  const days = new Map<string, ScheduledPost[]>();
  for (const p of upcoming) { const k = dayName(p.scheduledAt ?? Date.now()); days.set(k, [...(days.get(k) ?? []), p]); }

  return (
    <div className="pn-page is-narrow">
      <div className="pn-row">
        <p className="pn-summary" style={{ fontSize: 19 }}>
          {upcoming.length ? <><b>{upcoming.length}</b> {upcoming.length === 1 ? "publicação agendada" : "publicações agendadas"}.</> : "Nenhuma publicação agendada."}
        </p>
        {conn.state === "connected" && <Link href="/painel/publicacoes/nova" className="pn-btn is-primary pn-spacer"><Icon d={ICONS.plus} size={14} width={2} />Nova publicação</Link>}
      </div>
      {conn.state !== "connected" && (
        <div className="pn-alert"><Icon d={ICONS.warn} size={17} color="#E0A526" width={1.8} style={{ marginTop: 1 }} />
          <div><div className="pn-alert-title">Conecte o Instagram para agendar</div><div className="pn-alert-body"><Link href="/painel/conexao">Ir para Conexão</Link></div></div>
        </div>
      )}

      {[...days].map(([day, list]) => (
        <section key={day} className="pn-card" style={{ padding: "14px 18px 6px" }}>
          <div className="pn-card-title">{day}</div>
          <div style={{ marginTop: 4 }}>{list.map(row)}</div>
        </section>
      ))}

      {!posts.length && conn.state === "connected" && (
        <div className="pn-empty">
          <div className="pn-empty-icon"><Icon d={ICONS.calendar} size={20} color="#7C3AED" width={1.6} /></div>
          <div className="pn-empty-title">Agende o próximo post</div>
          <div className="pn-empty-body">Envie a imagem, escreva a legenda e escolha o horário. Se quiser, monte a automação junto: ela começa a responder no instante em que o post sair.</div>
          <div className="pn-row" style={{ justifyContent: "center", marginTop: 18 }}><Link href="/painel/publicacoes/nova" className="pn-btn is-primary">Nova publicação</Link></div>
        </div>
      )}

      {drafts.length > 0 && (
        <section className="pn-card" style={{ padding: "14px 18px 6px" }}>
          <div className="pn-card-title">Rascunhos</div>
          <div style={{ marginTop: 4 }}>{drafts.map(row)}</div>
        </section>
      )}

      {done.length > 0 && (
        <section className="pn-card" style={{ padding: "14px 18px 6px" }}>
          <div className="pn-card-title">Publicadas e com falha</div>
          <div style={{ marginTop: 4 }}>{done.map(row)}</div>
          <div className="pn-help" style={{ margin: "4px 0 10px" }}>A mídia fica guardada por 1 dia depois de publicada. {done[0]?.publishedAt ? `Última publicação ${relTime(done[0].publishedAt)}.` : ""}</div>
        </section>
      )}
    </div>
  );
}
