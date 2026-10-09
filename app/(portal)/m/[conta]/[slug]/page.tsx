import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BlocksView } from "@/app/_portal/blocks";
import { Avatar, Chips, Footer, Handle, Icon, LockIcon, MaterialCard, Topbar, instagramUrl, materialUrl } from "@/app/_portal/parts";
import { blockSummary, dateLabel, isHttpUrl, materialFiles, numberLabel, portalView } from "@/lib/material";
import { portalAccount, portalAllowed, portalLibrary, portalMaterial, portalUrls } from "@/lib/portal";
import { PRODUCT, SITE_URL } from "@/config/site";
import { Busy } from "../../../_components/notices";

// Os endereços das imagens são assinados e expiram: a página não pode ficar em cache.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ conta: string; slug: string }>; searchParams: Promise<{ aviso?: string; b?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { conta, slug } = await params;
  const account = await portalAccount(conta);
  const material = account ? await portalMaterial(account.accountId, slug) : null;
  if (!account || !material) return { title: PRODUCT.name, robots: { index: false } };
  return {
    title: `${material.title} · @${account.username}`,
    description: material.description || undefined,
    // Material exclusivo não deve aparecer em buscador.
    robots: material.visibility === "exclusive" ? { index: false } : undefined,
  };
}

export default async function PaginaDoMaterial({ params, searchParams }: Props) {
  if (!(await portalAllowed())) return <Busy />;
  const [{ conta, slug }, sp] = await Promise.all([params, searchParams]);
  const account = await portalAccount(conta);
  if (!account) notFound();
  const { username } = account;
  const material = await portalMaterial(account.accountId, slug);
  const view = material ? portalView(material) : null;
  // Endereço de material que não existe, foi excluído ou voltou para rascunho: leva à biblioteca com um aviso.
  if (!view) redirect(`/m/${username}?aviso=material`);

  if (view.locked) {
    const urls = await portalUrls(account.accountId, view.coverPath ? [view.coverPath] : []);
    const cover = view.coverPath ? urls[view.coverPath] : undefined;
    const post = isHttpUrl(view.ctaPost) ? view.ctaPost : null;
    return (
      <>
        <Topbar username={username} back />
        <main className="dia-l-locked">
          <div className="dia-l-narrow dia-l-locked__grid">
            <div>
              {cover && (
                <div className="dia-cover dia-l-mhead__cover">
                  <img src={cover} alt="" />
                  <span className="dia-lockbadge"><LockIcon />Exclusivo</span>
                </div>
              )}
              <p className="dia-label dia-l-kicker">Material {numberLabel(view.number)} · Exclusivo</p>
              <h1 className="dia-title" style={{ marginTop: 12 }}>{view.title}</h1>
              {view.description && <p className="dia-l-lead">{view.description}</p>}
              <div style={{ marginTop: 16 }}><Chips items={view.summary} /></div>
            </div>

            <div className="dia-l-locked__how">
              <div>
                <h2 className="dia-h2">Este material chega pelo direct</h2>
                {view.ctaKeyword
                  ? <p>Comente <span className="dia-kw">{view.ctaKeyword}</span> {post ? "no post" : `em um post de @${username}`} e o link chega em instantes no seu direct, pronto para abrir aqui.</p>
                  : <p>Ele é enviado no direct para quem participa das publicações de @{username}.</p>}
              </div>
              {view.ctaKeyword && (
                <div className="dia-convo">
                  <div className="dia-convo__bar"><span className="dia-dot" aria-hidden="true" />Como receber · leva 10 segundos</div>
                  <ol className="dia-convo__list">
                    <li className="dia-step dia-step--you">
                      <span className="dia-step__n">1</span>
                      <div className="dia-step__body"><span className="dia-step__k">Você comenta no post</span><span className="dia-bubble dia-bubble--me"><span className="kw">{view.ctaKeyword}</span></span></div>
                    </li>
                    <li className="dia-step">
                      <span className="dia-step__n">2</span>
                      <div>
                        <span className="dia-step__k dia-l-step__k">O link chega no seu direct</span>
                        <span className="dia-bubble dia-bubble--link">Aqui está o seu material ✦<small>{new URL(SITE_URL).host}{materialUrl(username, view.slug)}</small></span>
                      </div>
                    </li>
                    <li className="dia-step">
                      <span className="dia-step__n">3</span>
                      <div><span className="dia-step__k dia-l-step__k">Você abre e usa</span><span className="dia-l-step__txt">O conteúdo completo, pronto para copiar e baixar.</span></div>
                    </li>
                  </ol>
                </div>
              )}
              {post && <a className="dia-btn dia-btn--primary dia-btn--block" href={post} target="_blank" rel="noopener noreferrer"><Icon name="comment" />Abrir o post e comentar</a>}
              <Link className="dia-btn dia-btn--ghost" href={`/m/${username}`}>Ver outros materiais <Icon name="next" small /></Link>
            </div>
          </div>
        </main>
        <Footer username={username} />
      </>
    );
  }

  const m = view.material;
  // Só capa e imagens precisam de endereço para mostrar; os arquivos saem pela rota de download.
  const [urls, recent] = await Promise.all([
    portalUrls(account.accountId, materialFiles(m).filter((p) => p.endsWith(".jpg"))),
    portalLibrary(account.accountId, 3),
  ]);
  const more = recent.filter((c) => c.id !== m.id).slice(0, 2);
  const moreUrls = await portalUrls(account.accountId, more.flatMap((c) => (c.coverPath ? [c.coverPath] : [])));
  const cover = m.coverPath ? urls[m.coverPath] : undefined;

  return (
    <>
      <Topbar username={username} back />
      <main>
        <header className="dia-l-mhead">
          <div className={`dia-l-narrow dia-l-mhead__grid${cover ? "" : " is-plain"}`}>
            {cover && <div className="dia-cover dia-l-mhead__cover"><img src={cover} alt="" /></div>}
            <div>
              <p className="dia-label dia-l-kicker">Material {numberLabel(m.number)}</p>
              <h1 className="dia-title">{m.title}</h1>
              {m.description && <p className="dia-l-lead">{m.description}</p>}
              <div className="dia-l-meta">
                <Avatar username={username} /><Handle username={username} />
                {m.publishedAt && <span className="dia-meta">· {dateLabel(m.publishedAt)}</span>}
              </div>
              <Chips items={blockSummary(m.blocks)} />
            </div>
          </div>
        </header>
        <div className="dia-stack dia-l-main">
          <BlocksView blocks={m.blocks} urls={urls} fileHref={(id) => `${materialUrl(username, m.slug)}/arquivo/${id}`}
            unavailableFile={sp.aviso === "arquivo" ? sp.b : undefined} />
        </div>
      </main>

      <section className="dia-outro dia-l-outro">
        <div className="dia-l-narrow">
          {more.length > 0 && (
            <>
              <p className="dia-label" style={{ margin: 0 }}>Continue por aqui</p>
              <h2 className="dia-h2">Mais materiais para o seu dia a dia</h2>
              <div className="dia-l-pair">
                {more.map((c) => <MaterialCard key={c.id} card={c} username={username} url={c.coverPath ? moreUrls[c.coverPath] : undefined} />)}
              </div>
              <Link className="dia-btn dia-btn--secondary dia-btn--block" href={`/m/${username}`}>Ver todos os materiais <Icon name="next" small /></Link>
            </>
          )}
          <div className="dia-follow" style={more.length ? undefined : { marginTop: 0 }}>
            <Avatar username={username} large />
            <div className="dia-follow__txt"><Handle username={username} /><p>Siga o perfil para não perder os próximos.</p></div>
            <a className="dia-btn dia-btn--secondary" href={instagramUrl(username)} target="_blank" rel="noopener noreferrer">Seguir<Icon name="out" small /></a>
          </div>
        </div>
      </section>
      <Footer username={username} />
    </>
  );
}
