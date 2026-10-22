import type { ReactNode } from "react";
import { portalRoot } from "../_portal/fonts";
import { PortalAnalytics } from "../_portal/analytics";
import { GlyphCanvas } from "../_portal/glyph-canvas";
import "../_portal/portal.css";
import "../_portal/layout.css";

/** Portal de materiais: páginas públicas, com identidade própria (design/portal), sem menu nem login do painel. */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PortalAnalytics />
      <GlyphCanvas />
      <div className={portalRoot}>{children}</div>
    </>
  );
}
