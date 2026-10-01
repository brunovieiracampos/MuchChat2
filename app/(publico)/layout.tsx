import type { ReactNode } from "react";
import { SiteFooter, SiteNav } from "../_site/chrome";
import "../painel/painel.css";
import "../_site/site.css";

/** Documentos públicos (privacidade, exclusão de dados): mesmo topo e rodapé da página inicial. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pn lp">
      <SiteNav />
      <div className="lp-wrap lp-doc">{children}</div>
      <SiteFooter />
    </div>
  );
}
