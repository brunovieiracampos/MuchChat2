import Link from "next/link";
import { redirect } from "next/navigation";
import { PRODUCT } from "@/config/site";
import { getUser } from "@/lib/session";

export const metadata = { title: `${PRODUCT.name}: ${PRODUCT.tagline}` };

/** Página inicial: quem já entrou vai direto para o painel. */
export default async function Home() {
  if (await getUser()) redirect("/painel");
  return (
    <>
      <h1 className="pn-auth-title" style={{ fontSize: 28 }}>{PRODUCT.tagline}</h1>
      <p className="pn-auth-lead" style={{ fontSize: 14.5 }}>
        Quem comenta a palavra-chave no seu post recebe o material no direct, com botão, confirmação de que segue o perfil e resposta pública no comentário.
        Você monta o fluxo uma vez e acompanha quantos seguidores cada post trouxe.
      </p>
      <div className="pn-auth-form" style={{ gap: 10 }}>
        <Link href="/cadastro" className="pn-btn is-primary" style={{ color: "#fff" }}>Criar conta</Link>
        <Link href="/entrar" className="pn-btn" style={{ color: "var(--text)" }}>Entrar</Link>
      </div>
      <p className="pn-auth-alt" style={{ fontSize: 12 }}>
        <Link href="/privacidade">Política de privacidade</Link>
        <span style={{ margin: "0 8px", color: "var(--faint)" }}>|</span>
        <Link href="/exclusao-de-dados">Exclusão de dados</Link>
      </p>
    </>
  );
}
