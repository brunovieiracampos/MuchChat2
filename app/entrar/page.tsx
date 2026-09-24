import { redirect } from "next/navigation";
import { hasSession } from "@/lib/session";
import { LoginForm } from "./login-form";
import "../painel/painel.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar · DIAriamente Automations", robots: { index: false } };

export default async function Entrar() {
  if (await hasSession()) redirect("/painel");
  return (
    <div className="pn" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div className="pn-row" style={{ gap: 11 }}>
          <div className="pn-logo" style={{ width: 34, height: 34, borderRadius: 10 }}>D</div>
          <div>
            <div className="pn-brand-name" style={{ fontSize: 18 }}>DIAriamente</div>
            <div className="pn-brand-sub">Automations</div>
          </div>
        </div>
        <div className="pn-card" style={{ marginTop: 22 }}>
          <div className="pn-card-title">Entrar no painel</div>
          <div className="pn-card-sub">Use a senha do painel (ADMIN_SECRET).</div>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
