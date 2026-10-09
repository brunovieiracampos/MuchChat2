import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GlyphField } from "@/app/_portal/glyphs";
import { GlyphMotion } from "@/app/_portal/glyph-motion";
import { Avatar, Footer, Handle, Icon, MaterialCard, MaterialRow, Topbar, instagramUrl } from "@/app/_portal/parts";
import { dateLabel } from "@/lib/material";
import { portalAccount, portalAllowed, portalLibrary, portalUrls } from "@/lib/portal";
import { PRODUCT } from "@/config/site";
import { Busy } from "../../_components/notices";

// Os endereços das capas são assinados e expiram: a página não pode ficar em cache.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ conta: string }>; searchParams: Promise<{ aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const account = await portalAccount((await params).conta);
  if (!account) return { title: PRODUCT.name, robots: { index: false } };
  return { title: `Materiais de @${account.username}`, description: `Guias, prompts e arquivos de @${account.username}.` };
}

export default async function Biblioteca({ params, searchParams }: Props) {
  if (!(await portalAllowed())) return <Busy />;
  const [{ conta }, sp] = await Promise.all([params, searchParams]);
  const account = await portalAccount(conta);
  if (!account) notFound();
  const { username } = account;
  const items = await portalLibrary(account.accountId);
  const urls = await portalUrls(account.accountId, items.flatMap((m) => (m.coverPath ? [m.coverPath] : [])));
  const url = (path: string | null) => (path ? urls[path] : undefined);

  // Composição do design: o mais recente em destaque, depois cartões e, do nono em diante, o arquivo em linhas.
  // No celular entram 2 cartões e o restante vira linha; no desktop, 3 cartões médios e 4 menores.
  const [feature, ...rest] = items;
  const medium = rest.slice(0, 3), small = rest.slice(3, 7), archive = rest.slice(7);
  const latest = feature?.publishedAt;
  const count = `${items.length} ${items.length === 1 ? "material" : "materiais"}`;

  return (
    <>
      <Topbar username={username} />
      <GlyphMotion />
      <section className="dia-l-hero dia-grain">
        <GlyphField seed={7} groups={54} />
        <div className="dia-l-max dia-l-hero__grid">
          <div>
            <p className="dia-label dia-l-hero__kicker"><span className="dia-dot" aria-hidden="true" />Portal de materiais</p>
            <h1 className="dia-l-hero__title">Guias, prompts e ferramentas para usar IA no trabalho, <em>sem se perder</em> no excesso de informação.</h1>
          </div>
          <div className="dia-l-hero__side">
            <div className="dia-l-hero__who"><Avatar username={username} large /><Handle username={username} /></div>
            <span className="dia-meta">{items.length ? `${count}${latest ? ` · atualizado em ${dateLabel(latest)}` : ""}` : "Nenhum material ainda"}</span>
            <a className="dia-textlink dia-l-follow dia-only-m" href={instagramUrl(username)} target="_blank" rel="noopener noreferrer">Seguir<Icon name="out" small /></a>
            <a className="dia-btn dia-btn--secondary dia-only-d" href={instagramUrl(username)} target="_blank" rel="noopener noreferrer">Seguir no Instagram<Icon name="out" small /></a>
          </div>
        </div>
      </section>

      <main>
        {sp.aviso === "material" && (
          <section className="dia-l-notice is-top">
            <div className="dia-notice dia-grain" role="status">
              <div className="dia-notice__code"><span className="dia-dot is-calm" aria-hidden="true" /><span className="dia-label">Indisponível</span></div>
              <h2 className="dia-notice__title">Este material saiu do ar</h2>
              <p className="dia-notice__text">O material que você abriu foi retirado ou substituído por uma versão mais nova. Os outros continuam aqui embaixo.</p>
            </div>
          </section>
        )}

        {!feature ? (
          <section className="dia-l-empty">
            <div className="dia-plaincover dia-l-empty__art" aria-hidden="true"><span className="dia-plaincover__big">0<i>·</i></span></div>
            <h2 className="dia-h2" style={{ marginTop: 28 }}>Ainda não há materiais publicados</h2>
            <p>Os guias e prompts aparecem aqui assim que saírem no perfil. Enquanto isso, os posts do Instagram já têm muita coisa boa.</p>
            <a className="dia-btn dia-btn--primary" href={instagramUrl(username)} target="_blank" rel="noopener noreferrer">Ver o perfil no Instagram<Icon name="out" small /></a>
          </section>
        ) : (
          <>
            <section className="dia-l-sec is-first">
              <div className="dia-l-max">
                <MaterialCard card={feature} username={username} url={url(feature.coverPath)} feature />
                {!rest.length && <p className="dia-meta dia-l-first">É o primeiro material do portal. Os próximos aparecem aqui, do mais novo para o mais antigo.</p>}
              </div>
            </section>

            {medium.length > 0 && (
              <section className="dia-l-sec">
                <div className="dia-l-max dia-l-cards">
                  {medium.map((c, i) => <MaterialCard key={c.id} card={c} username={username} url={url(c.coverPath)} className={i === 2 ? "dia-only-d" : ""} />)}
                </div>
              </section>
            )}

            {small.length > 0 && (
              <section className="dia-l-sec dia-only-d">
                <div className="dia-l-max dia-l-cards is-four">
                  {small.map((c) => <MaterialCard key={c.id} card={c} username={username} url={url(c.coverPath)} />)}
                </div>
              </section>
            )}

            {rest.length > 2 && (
              <section className="dia-l-sec is-rows dia-only-m">
                <p className="dia-label" style={{ margin: "0 0 6px" }}>Anteriores</p>
                {rest.slice(2, 7).map((c) => <MaterialRow key={c.id} card={c} username={username} url={url(c.coverPath)} />)}
              </section>
            )}

            {archive.length > 0 && (
              <section className="dia-l-sec is-archive">
                <div className="dia-l-max">
                  <div className="dia-l-rowhead">
                    <h2 className="dia-h2">Arquivo</h2>
                    <span className="dia-meta">{archive.length} {archive.length === 1 ? "material anterior" : "materiais anteriores"}</span>
                  </div>
                  <div className="dia-l-rows">
                    {archive.map((c) => <MaterialRow key={c.id} card={c} username={username} url={url(c.coverPath)} />)}
                  </div>
                </div>
              </section>
            )}
            <div className="dia-l-end" />
          </>
        )}
      </main>
      <Footer username={username} />
    </>
  );
}
