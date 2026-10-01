import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
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
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0F" },
    { media: "(prefers-color-scheme: light)", color: "#F6F6F8" },
  ],
};

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

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
