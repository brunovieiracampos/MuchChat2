import type { ReactNode } from "react";
import { baseUrl, getActivity, getConnection, getFlags } from "@/lib/panel";
import { listTokens } from "@/lib/api-tokens";
import { requireSession } from "@/lib/session";
import { McpAccess } from "./mcp-access";
import { PauseToggle, RetryFailedButton, SubscribeButton, SweepButton } from "../_components/action-buttons";
import { logoutAction } from "../actions";
import { Badge, Icon } from "../_components/ui";
import { ICONS } from "../_components/icons";

type Row = { label: string; value: ReactNode; right?: ReactNode };

function Group({ title, desc, rows }: { title: string; desc: string; rows: Row[] }) {
  return (
    <section className="pn-card">
      <div className="pn-card-title">{title}</div>
      <div className="pn-card-sub">{desc}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
        {rows.map((r) => (
          <div key={r.label} className="pn-row" style={{ gap: 14, flexWrap: "nowrap", borderTop: "1px solid var(--line)", padding: "12px 0" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5 }}>{r.label}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, overflowWrap: "anywhere" }}>{r.value}</div>
            </div>
            {r.right}
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function Configuracoes({ searchParams }: { searchParams: Promise<{ conectado?: string }> }) {
  await requireSession();
  const [{ conectado }, conn, flags, { executions }, tokens] = await Promise.all([searchParams, getConnection(), getFlags(), getActivity(), listTokens()]);
  const url = baseUrl();
  const failed = executions.filter((e) => e.status === "falhou").length;
  const ok = conn.state === "connected";

  return (
    <div className="pn-page is-narrow">
      {conectado && ok && (
        <div className="pn-alert is-violet">
          <Icon d="M5 12l4 4 10-10" size={17} color="#A78BFA" width={2} style={{ marginTop: 1 }} />
          <div><div className="pn-alert-title">Conta @{conn.username} conectada</div><div className="pn-alert-body">O acesso vale por 60 dias e é renovado sozinho.</div></div>
        </div>
      )}
      {flags.dryRun && (
        <div className="pn-alert">
          <Icon d={ICONS.flask} size={17} color="#E0A526" width={1.8} style={{ marginTop: 1 }} />
          <div><div className="pn-alert-title">Modo de teste ligado</div><div className="pn-alert-body">As automações só simulam: nenhuma DM ou resposta sai de verdade.</div></div>
        </div>
      )}

      <Group title="Conta do Instagram" desc="O perfil profissional em que as automações rodam." rows={[
        {
          label: ok ? `@${conn.username}` : conn.state === "error" ? `@${conn.username ?? "conta"} com erro` : "Nenhuma conta conectada",
          value: ok
            ? `Conta ${conn.accountType === "BUSINESS" ? "comercial" : conn.accountType === "MEDIA_CREATOR" ? "de criador" : "profissional"}. Acesso renovado há ${conn.tokenAgeDays} dia${conn.tokenAgeDays === 1 ? "" : "s"}; vale por mais ${conn.tokenDaysLeft} e é renovado sozinho.`
            : conn.state === "error" ? `O Instagram recusou o acesso salvo. Reconecte para renovar. Detalhe: ${conn.error}` : "Conecte a conta para as automações funcionarem.",
          right: conn.hasAppId
            ? <a href="/api/auth/instagram" className={`pn-btn is-sm${ok ? "" : " is-primary"}`}>{ok ? "Reconectar" : "Conectar"}</a>
            : <Badge tone="amber">Indisponível</Badge>,
        },
        { label: "Permissões pedidas ao Instagram", value: "Ler o perfil e os posts, ler e responder comentários, enviar e receber mensagens no direct." },
      ]} />

      {ok && (
        <Group title="Comentários e mensagens" desc="Como o Much Chat fica sabendo do que acontece no seu perfil." rows={[
          { label: "Receber em tempo real", value: "Comentários, mensagens e cliques em botões chegam na hora. Se algo parou de chegar, autorize de novo.", right: <SubscribeButton /> },
          { label: "Buscar comentários agora", value: "Lê os posts dos últimos 7 dias e responde o que ainda não foi atendido. Também roda sozinho uma vez por dia.", right: <SweepButton className="pn-btn is-sm">Buscar</SweepButton> },
        ]} />
      )}

      <Group title="Pausa e falhas" desc="Para parar tudo de uma vez ou tentar de novo o que o Instagram recusou." rows={[
        { label: "Pausar todas as automações", value: flags.paused ? "Pausadas agora. Ao retomar, os comentários dos últimos 7 dias são recuperados." : "Automações rodando normalmente.", right: ok ? <PauseToggle paused={flags.paused} /> : undefined },
        { label: "DMs recusadas", value: failed ? `${failed} comentário${failed === 1 ? "" : "s"} com DM recusada. Depois de corrigir a causa (veja em Execuções), libere para tentar de novo.` : "Nenhuma DM recusada.", right: failed ? <RetryFailedButton /> : undefined },
      ]} />

      <McpAccess tokens={tokens} url={`${url}/api/mcp`} connected={ok} />

      <Group title="Privacidade e dados" desc="O que fica guardado e por quanto tempo." rows={[
        { label: "Registros de comentários", value: "Guardados por 90 dias. O histórico da tela Execuções mostra os últimos 2.000 eventos.", right: <Badge>90 dias</Badge> },
        { label: "Política de privacidade", value: <a href="/privacidade" target="_blank">{url}/privacidade</a> },
        { label: "Exclusão de dados", value: <a href="/exclusao-de-dados" target="_blank">{url}/exclusao-de-dados</a> },
      ]} />

      <form action={logoutAction}>
        <button type="submit" className="pn-btn"><Icon d={ICONS.logout} size={14} />Sair</button>
      </form>
    </div>
  );
}
