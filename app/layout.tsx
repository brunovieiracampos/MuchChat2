import type { ReactNode } from "react";
import { SITE } from "@/config/site";

export const metadata = { title: SITE.name };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "40px auto", padding: "0 16px", lineHeight: 1.6, color: "#111" }}>
        {children}
      </body>
    </html>
  );
}
