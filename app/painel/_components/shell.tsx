"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { logoutAction, setPausedAction } from "../actions";
import { ConfirmModal, Dot, Icon, ToastProvider, useToast } from "./ui";
import { ICONS } from "./icons";
import { PRODUCT } from "@/config/site";

export type ShellProps = {
  connection: { state: "connected" | "disconnected" | "error"; username?: string };
  paused: boolean;
  dryRun: boolean;
  failedCount: number;
  user: { name: string; email: string };
  children: ReactNode;
};

const NAV = [
  { href: "/painel", label: "Visão geral", icon: ICONS.dashboard },
  { href: null, label: "Caixa de entrada", icon: ICONS.inbox, soon: true },
  { href: "/painel/automacoes", label: "Automações", icon: ICONS.automations },
  { href: "/painel/contatos", label: "Contatos", icon: ICONS.contacts },
  { href: "/painel/execucoes", label: "Execuções", icon: ICONS.executions, alert: true },
  { href: "/painel/metricas", label: "Métricas", icon: ICONS.metrics },
  { href: "/painel/configuracoes", label: "Configurações", icon: ICONS.settings },
] as const;

function titleFor(path: string): string {
  if (path === "/painel") return "Visão geral";
  if (path === "/painel/automacoes/nova" || path.endsWith("/editar")) return "Construtor de automação";
  if (path.startsWith("/painel/automacoes/")) return "Detalhes da automação";
  if (path.startsWith("/painel/automacoes")) return "Automações";
  if (path.startsWith("/painel/contatos")) return "Contatos";
  if (path.startsWith("/painel/execucoes")) return "Execuções";
  if (path.startsWith("/painel/metricas")) return "Métricas";
  if (path.startsWith("/painel/configuracoes")) return "Configurações";
  if (path.startsWith("/painel/conexao")) return "Conexão com o Instagram";
  return "Painel";
}

function isActive(path: string, href: string) {
  return href === "/painel" ? path === "/painel" : path.startsWith(href);
}

const COLLAPSE_KEY = "pn:collapsed";

export function Shell(props: ShellProps) {
  return (
    <ToastProvider>
      <ShellInner {...props} />
    </ToastProvider>
  );
}

function ShellInner({ connection, paused, dryRun, failedCount, user, children }: ShellProps) {
  const path = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [askPause, setAskPause] = useState(false);
  const [menu, setMenu] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch {}
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch {}
      return !c;
    });
  };

  const ok = connection.state === "connected";
  const igColor = ok ? "#2FA37A" : connection.state === "error" ? "#E0A526" : "#E4544F";
  const igLabel = ok ? "Conexão com o Instagram ativa" : connection.state === "error" ? "Conexão com erro" : "Instagram desconectado";
  const account = connection.username ? `@${connection.username}` : "Instagram não conectado";
  const initial = (user.name[0] ?? "?").toUpperCase();

  const confirmPause = () => start(async () => {
    const r = await setPausedAction(!paused);
    setAskPause(false);
    if (!r.ok) return toast(r.error ?? "Não foi possível alterar", "red");
    toast(paused ? "Automações retomadas" : "Automações pausadas", paused ? "green" : "amber");
    router.refresh();
  });

  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    router.push(q ? `/painel/execucoes?q=${encodeURIComponent(q)}` : "/painel/execucoes");
  };

  return (
    <div className="pn pn-shell">
      <aside className={`pn-side${collapsed ? " is-collapsed" : ""}`}>
        <div className="pn-brand">
          <div className="pn-logo">{PRODUCT.name[0]}</div>
          <div className="pn-label" style={{ minWidth: 0 }}>
            <div className="pn-brand-name">{PRODUCT.name}</div>
            <div className="pn-brand-sub pn-ellipsis">{account}</div>
          </div>
        </div>

        <nav className="pn-nav" aria-label="Principal">
          {NAV.map((n) => {
            if (!n.href) {
              return (
                <span key={n.label} className="pn-nav-item is-soon" title={`${n.label} (em breve)`} aria-disabled="true">
                  <Icon d={n.icon} size={17} width={1.6} />
                  <span className="pn-label" style={{ whiteSpace: "nowrap" }}>{n.label}</span>
                  <span className="pn-nav-badge">em breve</span>
                </span>
              );
            }
            const on = isActive(path, n.href);
            const badge = "alert" in n && failedCount > 0 ? failedCount : null;
            return (
              <Link key={n.href} href={n.href} title={n.label} className={`pn-nav-item${on ? " is-on" : ""}`} aria-current={on ? "page" : undefined}>
                <Icon d={n.icon} size={17} width={1.6} />
                <span className="pn-label" style={{ whiteSpace: "nowrap" }}>{n.label}</span>
                {badge !== null && <span className="pn-nav-badge is-alert" title={`${badge} com falha`}>{badge}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="pn-side-foot">
          <div className="pn-label" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="pn-status-line"><Dot color={igColor} /><span>{igLabel}</span></div>
            {dryRun && (
              <span className="pn-test-pill" title="DRY_RUN=true: nada é enviado, só simulado">
                <Icon d={ICONS.flask} size={12} color="#E0A526" width={1.8} /> Modo de teste
              </span>
            )}
            {paused && <span className="pn-test-pill">Automações pausadas</span>}
          </div>
          <div className="pn-user">
            <div className="pn-avatar-grad">{initial}</div>
            <div className="pn-label" style={{ minWidth: 0, flex: 1 }}>
              <div className="pn-ellipsis" style={{ fontSize: 12, fontWeight: 500 }}>{user.name}</div>
              <div className="pn-ellipsis" style={{ fontSize: 11, color: "var(--muted)" }}>{user.email}</div>
            </div>
          </div>
          <button type="button" className="pn-collapse" onClick={toggleCollapsed}>{collapsed ? "›" : "‹ Recolher menu"}</button>
        </div>
      </aside>

      <div className="pn-main-col">
        <header className="pn-header">
          <h1 className="pn-title">{titleFor(path)}</h1>
          <form className="pn-search pn-hide-sm" onSubmit={onSearch} role="search" style={{ flex: 1, maxWidth: 380, marginLeft: 8 }}>
            <Icon d={ICONS.search} size={14} color="#6E6E7D" width={1.8} />
            <input name="q" type="search" className="pn-input" placeholder="Buscar por usuário, comentário ou automação" aria-label="Busca" />
          </form>
          <div className="pn-header-actions">
            <Link href="/painel/conexao" className={`pn-badge ${ok ? "is-green" : "is-amber"}`} style={{ borderRadius: 20, padding: "5px 11px", fontSize: 11.5 }}>
              <Dot color={igColor} />{ok ? "Conectado" : "Atenção"}
            </Link>
            <button type="button" className={`pn-btn pn-hide-sm${paused ? " is-warn" : ""}`} style={{ fontSize: 12, padding: "7px 12px" }} onClick={() => setAskPause(true)}>
              {paused ? "Retomar automações" : "Pausar automações"}
            </button>
            <Link href={failedCount ? "/painel/execucoes?status=falhou" : "/painel/execucoes"} aria-label={failedCount ? `${failedCount} execuções com falha` : "Execuções"}
              style={{ position: "relative", width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--card)", display: "grid", placeItems: "center" }}>
              <Icon d="M18 15v-4a6 6 0 10-12 0v4l-1.5 3h15zM10 21h4" size={15} color="#B9B9C6" width={1.6} />
              {failedCount > 0 && <span style={{ position: "absolute", top: 5, right: 6, width: 6, height: 6, borderRadius: "50%", background: "#E4544F" }} />}
            </Link>
            <div style={{ position: "relative" }}>
              <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu"
                style={{ display: "flex", alignItems: "center", gap: 7, border: "1px solid var(--line-2)", background: "var(--card)", borderRadius: 8, padding: "4px 9px 4px 5px", cursor: "pointer", color: "var(--text)", fontSize: 12 }}>
                <span className="pn-avatar-grad" style={{ width: 22, height: 22, fontSize: 10 }}>{initial}</span>
                <span className="pn-hide-sm">{user.name.split(" ")[0]}</span>
                <Icon d="M6 9l6 6 6-6" size={11} color="#8A8A99" width={2} />
              </button>
              {menu && (
                <div role="menu" style={{ position: "absolute", right: 0, top: 38, zIndex: 30, minWidth: 170, background: "#111117", border: "1px solid var(--line-3)", borderRadius: 10, padding: 5, boxShadow: "0 16px 40px rgba(0,0,0,.5)" }}>
                  <form action={logoutAction}>
                    <button type="submit" role="menuitem" className="pn-btn" style={{ width: "100%", justifyContent: "flex-start", border: "none", background: "transparent" }}>
                      <Icon d={ICONS.logout} size={14} /> Sair
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="pn-main" onClick={() => menu && setMenu(false)}>{children}</main>
      </div>

      {askPause && (
        <ConfirmModal
          title={paused ? "Retomar automações?" : "Pausar todas as automações?"}
          body={paused
            ? "As automações voltam a responder comentários. A próxima varredura recupera os comentários dos últimos 7 dias que ficaram para trás."
            : "Nenhum comentário será respondido até você retomar. Nada se perde: ao retomar, a varredura pega os comentários dos últimos 7 dias."}
          confirmLabel={paused ? "Retomar" : "Pausar automações"}
          tone={paused ? "primary" : "warn"}
          busy={pending}
          onConfirm={confirmPause}
          onClose={() => setAskPause(false)}
        />
      )}
    </div>
  );
}
