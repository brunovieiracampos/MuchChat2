import type { ReactNode } from "react";
import { SCOPES } from "@/lib/oauth";
import { baseUrl, getActivity, getConnection, getFlags } from "@/lib/panel";
import { requireSession } from "@/lib/session";
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
  const [{ conectado }, conn, flags, { executions }] = await Promise.all([searchParams, getConnection(), getFlags(), getActivity()]);
  const url = baseUrl();
  const failed = executions.filter((e) => e.status === "falhou").length;
  const ok = conn.state === "connected";

  return (
    <div className="pn-page is-narrow">
      {conectado && ok && (
        <div className="pn-alert is-violet">
          <Icon d="M5 12l4 4 10-10" size={17} color="#A78BFA" width={2} style={{ marginTop: 1 }} />
          <div><div className="pn-alert-title">Conta @{conn.username} conectada</div><div className="pn-alert-body">O token de 60 dias foi salvo e a varredura diária renova sozinha.</div></div>
        </div>
      )}
      {flags.dryRun && (
        <div className="pn-alert">
          <Icon d={ICONS.flask} size={17} color="#E0A526" width={1.8} style={{ marginTop: 1 }} />
          <div><div className="pn-alert-title">Modo de teste ativo</div><div className="pn-alert-body">DRY_RUN=true: as automações só simulam. Nenhuma DM ou resposta sai de verdade.</div></div>
        </div>
      )}

      <Group title="Conta do Instagram" desc="Perfil profissional conectado ao painel." rows={[
        {
          label: ok ? `@${conn.username}` : "Nenhuma conta conectada",
          value: ok ? `Conta ${conn.accountType === "BUSINESS" ? "comercial" : conn.accountType === "MEDIA_CREATOR" ? "de criador" : "profissional"} · ID ${conn.userId}` : conn.state === "error" ? conn.error : "Conecte a conta para o painel funcionar.",
          right: <Badge tone={ok ? "green" : conn.state === "error" ? "amber" : "red"}>{ok ? "Conectada" : conn.state === "error" ? "Erro" : "Desconectada"}</Badge>,
        },
        {
          label: "Conexão com a Meta",
          value: !ok ? "—" : conn.source === "env" ? "Token definido em IG_ACCESS_TOKEN (não é renovado sozinho)" : conn.tokenAgeDays === null ? "—" : `Token renovado há ${conn.tokenAgeDays} dia${conn.tokenAgeDays === 1 ? "" : "s"} · expira em ${conn.tokenDaysLeft} dias`,
          right: conn.hasAppId
            ? <a href="/api/auth/instagram" className={`pn-btn is-sm${ok ? "" : " is-primary"}`}>{ok ? "Reconectar" : "Conectar"}</a>
            : <Badge tone="amber">Falta IG_APP_ID</Badge>,
        },
        { label: "Permissões pedidas", value: SCOPES.split(",").join(", ") },
      ]} />

      <Group title="Webhook" desc="Endereço que recebe os comentários em tempo real (depende do App Review da Meta)." rows={[
        { label: "URL de callback", value: <span className="pn-mono">{url}/api/webhooks/instagram</span> },
        { label: "Verify token", value: "Mesmo valor de IG_VERIFY_TOKEN na Vercel", right: <Badge tone={process.env.IG_VERIFY_TOKEN ? "green" : "red"}>{process.env.IG_VERIFY_TOKEN ? "Configurado" : "Faltando"}</Badge> },
        { label: "Assinatura dos eventos", value: "Valida X-Hub-Signature-256 com IG_APP_SECRET", right: <Badge tone={process.env.IG_APP_SECRET ? "green" : "red"}>{process.env.IG_APP_SECRET ? "Configurado" : "Faltando"}</Badge> },
        { label: "Inscrever a conta no campo comments", value: "Faça depois de configurar o webhook no painel da Meta.", right: ok ? <SubscribeButton /> : undefined },
      ]} />

      <Group title="Varredura" desc="Lê os comentários dos posts dos últimos 7 dias e responde o que o webhook não pegou." rows={[
        { label: "Frequência automática", value: "1 vez por dia pelo cron da Vercel (09:00 em Brasília). Para ficar perto do tempo real, agende /api/cron/sweep a cada 5–10 min no cron-job.org." },
        { label: "Rodar agora", value: "Busca comentários novos e processa na hora.", right: ok ? <SweepButton className="pn-btn is-sm">Rodar</SweepButton> : undefined },
      ]} />

      <Group title="Modo de teste e pausa" desc="Controles de segurança enquanto o app não é revisado pela Meta." rows={[
        { label: "Modo de teste (DRY_RUN)", value: flags.dryRun ? "Ligado: nada é enviado. Para desligar, mude DRY_RUN para false na Vercel e faça redeploy." : "Desligado: DMs e respostas são enviadas de verdade.", right: <Badge tone={flags.dryRun ? "amber" : "green"}>{flags.dryRun ? "Ligado" : "Desligado"}</Badge> },
        { label: "Pausar todas as automações", value: flags.paused ? "Pausadas agora. Ao retomar, a varredura recupera os últimos 7 dias." : "Automações rodando normalmente.", right: <PauseToggle paused={flags.paused} /> },
        { label: "DMs recusadas", value: failed ? `${failed} comentário${failed === 1 ? "" : "s"} com DM recusada. Libere depois que o App Review for aprovado.` : "Nenhuma DM recusada.", right: failed ? <RetryFailedButton /> : undefined },
      ]} />

      <Group title="Privacidade e dados" desc="Registros e páginas exigidas pela Meta." rows={[
        { label: "Registros de comentários", value: "Guardados por 90 dias; o log mantém os últimos 2.000 eventos.", right: <Badge>90 dias</Badge> },
        { label: "Política de privacidade", value: <a href="/privacidade" target="_blank">{url}/privacidade</a> },
        { label: "Exclusão de dados", value: <a href="/exclusao-de-dados" target="_blank">{url}/exclusao-de-dados</a> },
      ]} />

      <form action={logoutAction}>
        <button type="submit" className="pn-btn"><Icon d={ICONS.logout} size={14} />Sair do painel</button>
      </form>
    </div>
  );
}
