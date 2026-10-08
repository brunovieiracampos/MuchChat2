import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { portalAccount, portalLibrary, portalUrls } from "@/lib/portal";
import { PRODUCT } from "@/config/site";
import { PortalHead } from "../../_components/portal-head";

// Os endereços das capas são assinados e expiram: a página não pode ficar em cache.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ conta: string }>; searchParams: Promise<{ aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const account = await portalAccount((await params).conta);
  if (!account) return { title: PRODUCT.name, robots: { index: false } };
  return { title: `Materiais de @${account.username}`, description: `Guias, prompts e arquivos de @${account.username}.` };
}

export default async function Biblioteca({ params, searchParams }: Props) {
  const [{ conta }, sp] = await Promise.all([params, searchParams]);
  const account = await portalAccount(conta);
  if (!account) notFound();
  const items = await portalLibrary(account.accountId);
  const urls = await portalUrls(account.accountId, items.flatMap((m) => (m.coverPath ? [m.coverPath] : [])));

  return (
    <main className="pt-wrap" style={{ maxWidth: 960 }}>
      <PortalHead username={account.username} />
      {sp.aviso === "material" && <div className="pt-notice" role="status">Esse material não está mais disponível. Veja os outros abaixo.</div>}
      <h1 className="pt-title">Materiais</h1>
      <p className="pt-desc">Tudo o que @{account.username} compartilha por aqui.</p>

      {items.length ? (
        <div className="pt-grid">
          {items.map((m) => (
            <Link key={m.id} href={`/m/${account.username}/${m.slug}`} className="pt-card">
              <span className="pt-card-cover">
                {m.coverPath && urls[m.coverPath] ? <img src={urls[m.coverPath]} alt="" loading="lazy" /> : <span>{m.visibility === "exclusive" ? "Exclusivo" : "Material"}</span>}
              </span>
              <span className="pt-card-body">
                <span className="pt-card-title">{m.title}</span>
                {m.description && <span className="pt-card-desc">{m.description}</span>}
                {m.visibility === "exclusive" && (
                  <span className="pt-card-lock">
                    {m.ctaKeyword ? `Exclusivo: comente ${m.ctaKeyword} para receber` : "Exclusivo: enviado no direct"}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="pt-empty" style={{ marginTop: 24 }}>Ainda não há materiais publicados.</div>
      )}
    </main>
  );
}
