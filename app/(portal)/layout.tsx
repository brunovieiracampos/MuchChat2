import type { ReactNode } from "react";
import "../painel/painel.css";
import "../_portal/portal.css";

/** Portal de materiais: páginas públicas, sem menu nem login do painel. */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <div className="pn pt">{children}</div>;
}
