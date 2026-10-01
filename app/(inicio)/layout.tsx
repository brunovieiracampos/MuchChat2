import type { ReactNode } from "react";
import "../painel/painel.css";
import "../_site/site.css";

export const dynamic = "force-dynamic";

/** Página inicial pública: mesmos tokens do painel, layout próprio de página aberta. */
export default function InicioLayout({ children }: { children: ReactNode }) {
  return <div className="pn lp">{children}</div>;
}
