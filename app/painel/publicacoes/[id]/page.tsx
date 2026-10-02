import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { dateTime, dayName, hourMinute } from "@/lib/format";
import { signedUrls } from "@/lib/media-store";
import { getAccount, getActivity, getPosts } from "@/lib/panel";
import { KIND_LABEL, STATUS_META, isEditable, isVideo, thumbPath } from "@/lib/posts";
import { requireSession } from "@/lib/session";
import { Badge, Icon } from "../../_components/ui";
import { ICONS } from "../../_components/icons";
import { editorProps } from "../data";
import { PostEditor } from "../editor";
import { PostActions } from "./post-actions";

export default async function Publicacao({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const post = (await getPosts()).find((p) => p.id === id);
  if (!post) notFound();
  const s = STATUS_META[post.status];
  const when = post.scheduledAt ? `${dayName(post.scheduledAt)}, ${hourMinute(post.scheduledAt)}` : null;
  const automation = post.automationId ? (await getActivity()).rules.find((r) => r.id === post.automationId) : undefined;

  const header = (
    <div className="pn-row" style={{ gap: 10 }}>
      <Link href="/painel/publicacoes" className="pn-link-back">← Publicações</Link>
      <Badge tone={s.tone}>{s.label}</Badge>
      <span className="pn-muted" style={{ fontSize: 12.5 }}>{KIND_LABEL[post.kind]}{when && post.status !== "draft" ? `, ${post.status === "published" ? "publicada" : "para"} ${when}` : ""}</span>
      <span className="pn-row pn-spacer" style={{ gap: 8 }}>
        <PostActions id={post.id} canCancel={post.status === "scheduled"} canDelete={post.status !== "preparing" && post.status !== "publishing"} published={post.status === "published"} />
      </span>
    </div>
  );

  if (isEditable(post.status)) {
    const props = await editorProps(post);
    if (!props) redirect("/painel/conexao");
    return (
      <div className="pn-page">
        {header}
        {post.status === "scheduled" && (
          <div className="pn-alert is-violet"><Icon d={ICONS.calendar} size={17} color="var(--violet-3)" width={1.8} style={{ marginTop: 1 }} />
            <div><div className="pn-alert-title">Agendada para {when}</div><div className="pn-alert-body">Dá para editar até 10 minutos antes. Salvar mantém o agendamento no horário escolhido.</div></div>
          </div>
        )}
        {post.status === "failed" && (
          <div className="pn-alert is-red"><Icon d={ICONS.error} size={17} color="var(--red)" width={1.8} style={{ marginTop: 1 }} />
            <div><div className="pn-alert-title">A publicação não saiu</div><div className="pn-alert-body">{post.error ?? "Motivo desconhecido."} Ajuste e agende de novo.</div></div>
          </div>
        )}
        <PostEditor {...props} />
      </div>
    );
  }

  const account = await getAccount();
  const thumbs = post.mediaDeletedAt || !account ? {} : await signedUrls(account.accountId, post.media.map(thumbPath).filter((x): x is string => !!x), 3600e3);
  return (
    <div className="pn-page is-narrow">
      {header}
      {post.status === "published" && post.error && (
        <div className="pn-alert"><Icon d={ICONS.warn} size={17} color="var(--amber)" width={1.8} style={{ marginTop: 1 }} /><div className="pn-alert-body">{post.error}</div></div>
      )}
      <section className="pn-card">
        <p className="pn-summary" style={{ fontSize: 19 }}>
          {post.status === "published"
            ? <>Publicada {post.publishedAt ? dateTime(post.publishedAt) : ""}.{post.permalink && <> <a href={post.permalink} target="_blank" rel="noreferrer">Ver no Instagram</a></>}</>
            : post.status === "preparing" ? "Preparando a mídia na Meta. Ela sai no horário marcado." : "Publicando agora."}
        </p>
        <div className="pn-media-grid" style={{ marginTop: 14 }}>
          {post.media.map((m) => (
            <div key={m.path} className={`pn-media-tile${post.kind === "story" || isVideo(m) ? " is-story" : ""}`}>
              {thumbs[thumbPath(m) ?? ""] ? <img src={thumbs[thumbPath(m) ?? ""]} alt="" /> : <Icon d={ICONS.image} size={18} color="var(--muted-2)" />}
              {isVideo(m) && <span className="pn-media-duration">▶ {m.duration ? `${Math.floor(m.duration / 60)}:${String(Math.round(m.duration % 60)).padStart(2, "0")}` : "vídeo"}</span>}
            </div>
          ))}
        </div>
        {post.mediaDeletedAt && <div className="pn-help">A mídia foi apagada do Much Chat 1 dia depois da publicação; o post continua no Instagram.</div>}
        {post.caption && <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--text-2)", marginTop: 14, lineHeight: 1.55 }}>{post.caption}</div>}
        <div className="pn-fields">
          <div className="pn-field-row"><div>Automação</div><div>{automation ? <Link href={`/painel/automacoes/${automation.id}`}>{automation.name ?? automation.id}</Link> : "Nenhuma"}</div></div>
          <div className="pn-field-row"><div>Tentativas</div><div className="pn-num">{post.attempts}</div></div>
        </div>
      </section>
    </div>
  );
}
