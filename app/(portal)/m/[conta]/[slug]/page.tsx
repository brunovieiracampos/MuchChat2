import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BlocksView } from "@/app/_portal/blocks";
import { materialFiles, portalView } from "@/lib/material";
import { portalAccount, portalMaterial, portalUrls } from "@/lib/portal";
import { PRODUCT } from "@/config/site";
import { PortalHead } from "../../../_components/portal-head";

// Os endereços das imagens são assinados e expiram: a página não pode ficar em cache.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ conta: string; slug: string }>; searchParams: Promise<{ aviso?: string }> };

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
  const [{ conta, slug }, sp] = await Promise.all([params, searchParams]);
  const account = await portalAccount(conta);
  if (!account) notFound();
  const material = await portalMaterial(account.accountId, slug);
  const view = material ? portalView(material) : null;
  // Endereço de material que não existe, foi excluído ou voltou para rascunho: leva à biblioteca com um aviso.
  if (!view) redirect(`/m/${account.username}?aviso=material`);

  if (view.locked) {
    const urls = await portalUrls(account.accountId, view.coverPath ? [view.coverPath] : []);
    return (
      <main className="pt-wrap">
        <PortalHead username={account.username} back />
        <h1 className="pt-title">{view.title}</h1>
        {view.description && <p className="pt-desc">{view.description}</p>}
        {view.coverPath && urls[view.coverPath] && <img className="pt-cover" src={urls[view.coverPath]} alt="" />}
        <div className="pt-lock">
          <div className="pt-lock-title">Este material é exclusivo</div>
          {view.ctaKeyword ? (
            <p>
              Comente <strong>{view.ctaKeyword}</strong> {view.ctaPost ? "neste post" : `em um post de @${account.username}`} para receber o link no direct.
            </p>
          ) : (
            <p>Ele é enviado no direct para quem participa das publicações de @{account.username}.</p>
          )}
          {view.ctaPost && <a className="pn-btn is-primary" href={view.ctaPost} target="_blank" rel="noopener noreferrer">Abrir o post</a>}
          <p><Link href={`/m/${account.username}`}>Ver os outros materiais</Link></p>
        </div>
      </main>
    );
  }

  const m = view.material;
  // Só capa e imagens precisam de endereço para mostrar; os arquivos saem pela rota de download.
  const urls = await portalUrls(account.accountId, materialFiles(m).filter((p) => p.endsWith(".jpg")));
  return (
    <main className="pt-wrap">
      <PortalHead username={account.username} back />
      {sp.aviso === "arquivo" && <div className="pt-notice" role="status">Esse arquivo está indisponível no momento. Tente de novo mais tarde.</div>}
      <article>
        <h1 className="pt-title">{m.title}</h1>
        {m.description && <p className="pt-desc">{m.description}</p>}
        {m.coverPath && urls[m.coverPath] && <img className="pt-cover" src={urls[m.coverPath]} alt="" />}
        <BlocksView blocks={m.blocks} urls={urls} fileHref={(id) => `/m/${account.username}/${m.slug}/arquivo/${id}`} />
      </article>
    </main>
  );
}
