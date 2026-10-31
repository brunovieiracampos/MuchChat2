import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PRODUCT, SITE_URL } from "@/config/site";
import { THEME_SCRIPT } from "@/lib/theme";
import "./theme.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: PRODUCT.name,
  description: PRODUCT.description,
  applicationName: PRODUCT.name,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0A1020" },
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
  ],
};

// Fontes no próprio repositório (app/_fonts, só o subconjunto latino): o next/font/google passou a falhar no build da Vercel.
const sans = localFont({ src: "./_fonts/dm-sans-normal.woff2", weight: "400 600", variable: "--font-sans", display: "swap" });
const display = localFont({ src: "./_fonts/plus-jakarta-sans-normal.woff2", weight: "500 700", variable: "--font-display", display: "swap" });
const mono = localFont({ src: "./_fonts/fira-code-normal.woff2", weight: "400 500", variable: "--font-mono", display: "swap" });

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // O script do tema muda data-theme antes da hidratação; por isso o aviso de diferença fica desligado só no <html>.
    <html lang="pt-BR" className={`${sans.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
