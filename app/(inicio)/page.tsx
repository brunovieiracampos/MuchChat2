import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PRODUCT } from "@/config/site";
import { getUser } from "@/lib/session";
import { stageLabel, type Counts, type FunnelRow, type Stage } from "@/lib/stats";
import { Funnel, FunnelSummary } from "../painel/_components/funnel";
import { ICONS } from "../painel/_components/icons";
import { Icon } from "../painel/_components/ui";
import { SiteFooter, SiteNav } from "../_site/chrome";
import fotoDirect from "../../public/img/direct-mesa.webp";
import fotoMaos from "../../public/img/celular-maos.webp";

const TITLE = `${PRODUCT.name}: ${PRODUCT.tagline}`;
/** Última palavra do slogan em verde-sálvia. */
const TAGLINE_LEAD = PRODUCT.tagline.slice(0, PRODUCT.tagline.lastIndexOf(" "));
const TAGLINE_LAST = PRODUCT.tagline.slice(PRODUCT.tagline.lastIndexOf(" ") + 1);

export const metadata: Metadata = {
  title: TITLE,
  description: PRODUCT.description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "pt_BR", url: "/", siteName: PRODUCT.name, title: TITLE, description: PRODUCT.description },
  twitter: { card: "summary_large_image", title: TITLE, description: PRODUCT.description },
};

/** Números fictícios para mostrar o relatório real do painel na página inicial. */
const EXAMPLE: Counts = { comment: 412, dm: 398, click: 271, follower: 236, gained: 87, done: 229, failed: 0 };
const EXAMPLE_ROWS: FunnelRow[] = (["comment", "dm", "click", "follower", "done"] as Stage[]).map((stage, i, all) => ({
  stage, label: stageLabel(stage), hint: "", value: EXAMPLE[stage],
  ofFirst: EXAMPLE[stage] / EXAMPLE.comment,
  ofPrev: i ? EXAMPLE[stage] / EXAMPLE[all[i - 1]] : null,
}));

const FLOW = [
  { title: "Comentou a palavra-chave", body: "Você escolhe o post e as palavras. Cada comentário com a palavra dispara o fluxo.", icon: ICONS.chat },
  { title: "Recebe no direct", body: "A mensagem chega com um botão para a pessoa pegar o material.", icon: ICONS.inbox },
  { title: "Confirma que segue", body: "Antes de entregar, o Much Chat confere se a pessoa segue o perfil.", icon: ICONS.contacts },
  { title: "Resposta pública", body: "O comentário também ganha uma resposta, escrita por você.", icon: ICONS.refresh },
];

const MORE = [
  { title: "Agende o post com a automação", body: "Programe a publicação no painel. Quando o post sai, a automação já começa ativa.", icon: ICONS.calendar },
  { title: "Peça pelo Claude", body: "Conecte o Much Chat ao Claude e crie automações, agende posts ou veja resultados conversando.", icon: ICONS.link },
  { title: "Veja onde o fluxo perde gente", body: "O relatório aponta a etapa com mais desistência e sugere o que ajustar.", icon: ICONS.metrics },
];

/** Página inicial: quem já entrou vai direto para o painel. */
export default async function Home() {
  if (await getUser()) redirect("/painel");
  return (
    <>
      <SiteNav />

      <main>
        <section className="lp-wrap lp-hero">
          <div className="lp-hero-copy">
            <h1 className="lp-h1">{TAGLINE_LEAD} <span className="lp-h1-mark">{TAGLINE_LAST}</span></h1>
            <p className="lp-lead">
              Quem comenta a palavra-chave recebe o material no direct. Você monta o fluxo uma vez e acompanha os resultados.
            </p>
            <div className="lp-ctas">
              <Link href="/cadastro" className="pn-btn is-primary lp-btn-lg">Criar conta</Link>
              <Link href="/entrar" className="pn-btn lp-btn-lg">Entrar</Link>
            </div>
          </div>

          <figure className="lp-hero-visual">
            <div className="pn-card lp-report lp-funnel-in">
              <div className="lp-report-head">Relatório da automação</div>
              <div className="lp-report-body">
                <FunnelSummary c={EXAMPLE} hasFollow />
                <Funnel rows={EXAMPLE_ROWS} c={EXAMPLE} />
              </div>
            </div>
            <figcaption className="lp-caption">Relatório de uma automação no painel, com números de exemplo.</figcaption>
          </figure>
        </section>

        <section className="lp-wrap lp-section" aria-labelledby="lp-flow">
          <h2 id="lp-flow" className="lp-h2">Do comentário ao direct, sem você abrir o Instagram</h2>
          <div className="lp-bento">
            <ol className="lp-bento-steps">
              {FLOW.map((f, i) => (
                <li key={f.title} className={`lp-cell lp-cell-${i + 1}`}>
                  <span className="lp-cell-icon"><Icon d={f.icon} size={18} /></span>
                  <h3 className="lp-h3">{f.title}</h3>
                  <p className="lp-body">{f.body}</p>
                </li>
              ))}
            </ol>
            <div className="lp-photo lp-bento-photo">
              <Image src={fotoDirect} alt="Pessoa lendo uma mensagem no celular, sentada à mesa" fill sizes="(max-width: 860px) 100vw, 280px" placeholder="blur" />
            </div>
          </div>
        </section>

        <section className="lp-wrap lp-section lp-split" aria-labelledby="lp-more">
          <div className="lp-split-side">
            <h2 id="lp-more" className="lp-h2">O resto do trabalho também fica no painel</h2>
            <div className="lp-photo lp-split-photo">
              <Image src={fotoMaos} alt="Mãos segurando um celular, com um copo de café ao lado" fill sizes="(max-width: 860px) 100vw, 480px" placeholder="blur" />
            </div>
          </div>
          <ul className="lp-list">
            {MORE.map((m) => (
              <li key={m.title} className="lp-list-item">
                <span className="lp-cell-icon"><Icon d={m.icon} size={18} /></span>
                <div>
                  <h3 className="lp-h3">{m.title}</h3>
                  <p className="lp-body">{m.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-wrap lp-final" aria-labelledby="lp-final">
          <h2 id="lp-final" className="lp-h2">Monte o fluxo do seu próximo post</h2>
          <Link href="/cadastro" className="pn-btn is-primary lp-btn-lg">Criar conta</Link>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
