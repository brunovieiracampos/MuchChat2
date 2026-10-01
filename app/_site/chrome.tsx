import Link from "next/link";
import { PRODUCT } from "@/config/site";
import { ThemeToggle } from "../painel/_components/theme-toggle";

/** Topo das páginas abertas (inicial, privacidade, exclusão de dados). */
export function SiteNav() {
  return (
    <header className="lp-nav">
      <div className="lp-wrap lp-nav-in">
        <Link href="/" className="lp-brand" aria-label={`${PRODUCT.name}, página inicial`}>
          <span className="pn-logo">{PRODUCT.name[0]}</span>
          <span className="pn-brand-name">{PRODUCT.name}</span>
        </Link>
        <nav className="lp-nav-actions" aria-label="Conta">
          <ThemeToggle />
          <Link href="/entrar" className="pn-btn lp-btn-quiet">Entrar</Link>
          <Link href="/cadastro" className="pn-btn is-primary">Criar conta</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="lp-wrap lp-foot">
      <span className="pn-brand-name">{PRODUCT.name}</span>
      <nav className="lp-foot-links" aria-label="Documentos">
        <Link href="/privacidade">Política de privacidade</Link>
        <Link href="/exclusao-de-dados">Exclusão de dados</Link>
      </nav>
    </footer>
  );
}
