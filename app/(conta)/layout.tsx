import type { ReactNode } from "react";
import Link from "next/link";
import { PRODUCT } from "@/config/site";
import "../painel/painel.css";

export const dynamic = "force-dynamic";
export const metadata = { title: PRODUCT.name, robots: { index: false } };

/** Telas de conta (entrar, cadastro, senha): coluna estreita centralizada, sem o menu do painel. */
export default function ContaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pn pn-auth">
      <div className="pn-auth-col">
        <Link href="/" className="pn-auth-brand" aria-label={`${PRODUCT.name}, página inicial`}>
          <span className="pn-logo" style={{ width: 30, height: 30, borderRadius: 9 }}>{PRODUCT.name[0]}</span>
          <span className="pn-brand-name" style={{ fontSize: 16 }}>{PRODUCT.name}</span>
        </Link>
        {children}
      </div>
    </div>
  );
}
