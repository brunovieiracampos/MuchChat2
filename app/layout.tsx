import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { DM_Sans, Fira_Code, Plus_Jakarta_Sans } from "next/font/google";
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

const sans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const mono = Fira_Code({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

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
