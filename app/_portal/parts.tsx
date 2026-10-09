import Link from "next/link";
import { coverLetters, dateLabel, numberLabel, type MaterialCard as Card, type SummaryItem } from "@/lib/material";

/** Peças do portal usadas em mais de uma tela. Sem "use client": servem ao servidor e ao editor. */

const PATHS = {
  out: "M7 17L17 7M8.5 7H17v8.5",
  next: "M5 12h14M13 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  comment: "M4 5h16v11H9l-5 4z",
  download: "M12 4v11M7 10.5l5 5 5-5M5 20h14",
  warn: "M12 4l9 16H3zM12 10v4.5M12 17.4v.1",
  check: "M5 12.5l4.5 4.5L19 7.5",
  select: "M9 4h6M9 20h6M12 4v16",
  down: "M6 9l6 6 6-6",
} as const;

export function Icon({ name, small }: { name: keyof typeof PATHS; small?: boolean }) {
  return <svg className={`dia-i${small ? " dia-i--sm" : ""}`} viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[name]} /></svg>;
}

export function LockIcon() {
  return <svg className="dia-i dia-i--sm" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
}

export function CopyIcon() {
  return <svg className="dia-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></svg>;
}

export const instagramUrl = (username: string) => `https://www.instagram.com/${username}/`;
export const materialUrl = (username: string, slug: string) => `/m/${username}/${slug}`;

/** "@d.ia.riamente", com o "ia" entre pontos em destaque quando o nome tiver. */
export function HandleText({ username }: { username: string }) {
  const m = username.match(/^(.*?\.)(ia)(\..*)$/i);
  return <>@{m ? <>{m[1]}<span className="dia-ia">{m[2]}</span>{m[3]}</> : username}</>;
}

export function Handle({ username }: { username: string }) {
  return <span className="dia-handle"><HandleText username={username} /></span>;
}

/** Avatar tipográfico: a primeira letra do nome e um ponto. */
export function Avatar({ username, large }: { username: string; large?: boolean }) {
  return <span className={`dia-avatar${large ? " dia-avatar--lg" : ""}`} aria-hidden="true">{username.slice(0, 1)}.</span>;
}

export function Chips({ items }: { items: SummaryItem[] }) {
  if (!items.length) return null;
  return (
    <ul className="dia-chips" aria-label="Conteúdo">
      {items.map((s) => <li key={s.label} className="dia-chip"><b>{s.n}</b>{s.label}</li>)}
    </ul>
  );
}

/** Capa do cartão: a imagem enviada ou, sem ela, textura e duas letras do título. */
function Cover({ card, url, username }: { card: Card; url?: string; username: string }) {
  const locked = card.visibility === "exclusive";
  const badge = locked ? <span className="dia-lockbadge"><LockIcon />Exclusivo</span> : null;
  if (card.coverPath && url) return <div className="dia-cover"><img src={url} alt="" loading="lazy" />{badge}</div>;
  const [a, b] = coverLetters(card.title);
  return (
    <div className="dia-plaincover">
      {badge ?? <span className="dia-label">@{username}</span>}
      <span className="dia-plaincover__big">{a}<i>{b}</i></span>
    </div>
  );
}

/** Cartão de material na biblioteca. `feature` é o destaque do mais recente. */
export function MaterialCard({ card, username, url, feature, className = "" }: { card: Card; username: string; url?: string; feature?: boolean; className?: string }) {
  const locked = card.visibility === "exclusive";
  const date = card.publishedAt ? <span className="dia-meta">{dateLabel(card.publishedAt)}</span> : null;
  return (
    <Link href={materialUrl(username, card.slug)} className={`dia-card${feature ? " dia-card--feature" : ""}${locked ? " dia-card--locked" : ""} ${className}`}>
      <Cover card={card} url={url} username={username} />
      <div className="dia-card__body">
        <div className="dia-card__top">
          {feature ? <span className="dia-newtag"><span className="dia-dot" />Mais recente</span> : <span className="dia-card__no">{numberLabel(card.number)}</span>}
          {feature && date}
        </div>
        <h3 className="dia-card__title">{card.title}</h3>
        {card.description && <p className="dia-card__desc">{card.description}</p>}
        <div className="dia-card__foot">
          <div className="dia-l-chipcol">
            <Chips items={card.summary} />
            {!feature && date}
          </div>
          {!locked && <span className="dia-card__go"><Icon name="out" /></span>}
        </div>
        {locked && (
          <div className="dia-comment">
            <span className="dia-comment__txt">
              {card.ctaKeyword ? <>Comente <span className="dia-kw">{card.ctaKeyword}</span> no post para receber</> : "Enviado no direct para quem comenta no post"}
            </span>
            <Icon name="comment" small />
          </div>
        )}
      </div>
    </Link>
  );
}

/** Linha compacta: os materiais anteriores e o arquivo. */
export function MaterialRow({ card, username, url, className = "" }: { card: Card; username: string; url?: string; className?: string }) {
  const [a, b] = coverLetters(card.title);
  const meta = [card.publishedAt ? dateLabel(card.publishedAt) : null, ...card.summary.map((s) => `${s.n} ${s.label}`)].filter(Boolean).join(" · ");
  return (
    <Link href={materialUrl(username, card.slug)} className={`dia-row ${className}`}>
      <span className="dia-row__thumb">
        {card.coverPath && url ? <img src={url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span className="mini">{a}<i>{b}</i></span>}
      </span>
      <span>
        <span className="dia-row__title" style={{ display: "block" }}>{card.title}</span>
        <span className="dia-row__meta dia-meta">
          {meta}
          {card.visibility === "exclusive" && (
            <>
              {meta && " · "}
              <span className="dia-row__lock"><LockIcon />{card.ctaKeyword ? <span>comente <b style={{ fontWeight: 600 }}>{card.ctaKeyword}</b></span> : <span>exclusivo</span>}</span>
            </>
          )}
        </span>
      </span>
    </Link>
  );
}

/** Barra do topo. Na biblioteca mostra a marca; dentro de um material, o caminho de volta. */
export function Topbar({ username, back }: { username: string; back?: boolean }) {
  if (!back) {
    return (
      <header className="dia-topbar">
        <Link className="dia-brand" href={`/m/${username}`}><Avatar username={username} /><Handle username={username} /></Link>
        <a className="dia-btn dia-btn--ghost" href={instagramUrl(username)} target="_blank" rel="noopener noreferrer">Instagram <Icon name="out" small /></a>
      </header>
    );
  }
  return (
    <header className="dia-topbar">
      <Link className="dia-back" href={`/m/${username}`}><Icon name="back" /><span>Todos os materiais</span></Link>
      <a className="dia-brand" href={instagramUrl(username)} target="_blank" rel="noopener noreferrer" aria-label={`Perfil @${username} no Instagram`}>
        <Handle username={username} /><Avatar username={username} />
      </a>
    </header>
  );
}

export function Footer({ username }: { username: string }) {
  return (
    <footer className="dia-l-foot">
      <span className="dia-meta"><HandleText username={username} /> · portal de materiais</span>
      <a className="dia-textlink dia-meta" href={instagramUrl(username)} target="_blank" rel="noopener noreferrer">Seguir no Instagram</a>
    </footer>
  );
}
