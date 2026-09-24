import Link from "next/link";
import { getSubscribedFields } from "@/lib/instagram";
import { getActivity, getConnection, getFlags } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { Badge, Dot, Icon } from "../_components/ui";
import { ICONS } from "../_components/icons";

export default async function Conexao() {
  await requireSession();
  const [conn, flags, { rules, executions }] = await Promise.all([getConnection(), getFlags(), getActivity()]);
  const ok = conn.state === "connected";
  const fields = ok ? await getSubscribedFields().catch(() => null) : null;
  const hasApp = !!process.env.IG_APP_ID && !!process.env.IG_APP_SECRET;
  const active = rules.filter((r) => r.active !== false).length;
  const webhookOk = !!fields && ["comments", "messages", "messaging_postbacks"].every((f) => fields.includes(f));

  const checklist: { label: string; hint: string; ok: boolean | null; action?: { href: string; label: string } }[] = [
    { label: "Configurar o app da Meta", hint: hasApp ? "IG_APP_ID e IG_APP_SECRET cadastrados na Vercel" : "Cadastre IG_APP_ID e IG_APP_SECRET na Vercel e faça redeploy", ok: hasApp },
    { label: "Conectar a conta profissional", hint: ok ? `@${conn.username} autorizada pelo login do Instagram` : "Entre com a conta @d.ia.riamente", ok, action: hasApp && !ok ? { href: "/api/auth/instagram", label: "Conectar" } : undefined },
    { label: "Publicar a primeira automação", hint: active ? `${active} automaç${active === 1 ? "ão ativa" : "ões ativas"}` : "Post + palavra-chave + mensagem do direct", ok: active > 0, action: active ? undefined : { href: "/painel/automacoes/nova", label: "Criar" } },
    { label: "Testar em modo de teste", hint: executions.length ? "Já há execuções registradas" : "Com DRY_RUN=true, comente a palavra-chave e rode a varredura", ok: executions.length > 0 },
    {
      label: "Configurar o webhook",
      hint: fields === null ? "Não foi possível consultar a inscrição"
        : webhookOk ? "Conta inscrita em comentários, mensagens e cliques em botões"
        : fields.includes("comments") ? "Falta inscrever em mensagens e cliques (necessário para botões): use Inscrever em Configurações"
        : "Configure no painel da Meta e inscreva a conta em Configurações",
      ok: fields === null ? null : webhookOk,
      action: fields && !webhookOk ? { href: "/painel/configuracoes", label: "Abrir" } : undefined,
    },
    { label: "Sair do modo de teste", hint: flags.dryRun ? "Mude DRY_RUN para false na Vercel quando os testes estiverem ok" : "DRY_RUN desligado: envios reais", ok: !flags.dryRun },
    { label: "Aprovação da Meta (App Review)", hint: "Até a aprovação, a Meta só mostra ao app comentários de testadores do Instagram (nem o webhook nem a varredura veem os outros).", ok: null },
  ];

  const color = ok ? "#2FA37A" : conn.state === "error" ? "#E0A526" : "#E4544F";

  return (
    <div style={{ padding: "44px 16px 56px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 680 }}>
        <div className="pn-row" style={{ gap: 11 }}>
          <div className="pn-logo" style={{ width: 34, height: 34, borderRadius: 10 }}>D</div>
          <div className="pn-brand-name" style={{ fontSize: 20, letterSpacing: -0.4 }}>DIAriamente Automations</div>
        </div>
        <p style={{ fontSize: 14, color: "#9C9CA9", lineHeight: 1.6, margin: "16px 0 0", maxWidth: 560 }}>
          Painel das automações de comentário do @d.ia.riamente: quando alguém comenta a palavra-chave, a pessoa recebe o material no direct e o comentário é respondido.
        </p>

        <div className="pn-row" style={{ gap: 10, marginTop: 22 }}>
          {hasApp
            ? <a href="/api/auth/instagram" className={`pn-btn${ok ? "" : " is-primary"}`} style={{ fontSize: 13, padding: "11px 18px" }}>{ok ? "Reconectar Instagram" : "Conectar Instagram"}</a>
            : <span className="pn-btn" aria-disabled style={{ opacity: .5, cursor: "not-allowed", fontSize: 13, padding: "11px 18px" }}>Conectar Instagram</span>}
          {flags.dryRun && <span className="pn-test-pill" style={{ fontSize: 11.5, padding: "5px 10px" }}>Modo de teste ligado</span>}
        </div>

        {conn.state === "error" && (
          <div className="pn-alert is-red" style={{ marginTop: 18 }}>
            <Icon d={ICONS.error} size={17} color="#E4544F" width={1.8} style={{ marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <div className="pn-alert-title">O Instagram recusou o token salvo</div>
              <div className="pn-alert-body" style={{ overflowWrap: "anywhere" }}>{conn.error}</div>
            </div>
          </div>
        )}

        <div className="pn-card" style={{ marginTop: 20 }}>
          <div className="pn-card-title">Checklist de configuração</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
            {checklist.map((c) => (
              <div key={c.label} className="pn-row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "nowrap", borderTop: "1px solid var(--line)", padding: "13px 0" }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", fontSize: 11,
                  background: c.ok ? "#0E1D17" : "#231B08", border: `1px solid ${c.ok ? "#1E3D30" : "#4A3A10"}`, color: c.ok ? "#5CC79E" : "#E0A526" }}>{c.ok ? "✓" : "•"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{c.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{c.hint}</div>
                </div>
                {c.action && <Link href={c.action.href} className="pn-btn is-sm">{c.action.label}</Link>}
                <Badge tone={c.ok ? "green" : "amber"}>{c.ok ? "Concluído" : c.ok === null ? "Acompanhar" : "Pendente"}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="pn-card pn-row" style={{ marginTop: 14, padding: "14px 18px", flexWrap: "nowrap" }}>
          <Dot color={color} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5 }}>{ok ? "Conexão com o Instagram ativa" : conn.state === "error" ? "Conexão com erro" : "Instagram desconectado"}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
              {ok ? (conn.tokenDaysLeft !== null ? `Token válido por mais ${conn.tokenDaysLeft} dias` : "Token definido no ambiente") : "Conecte a conta para o painel ler os posts."}
            </div>
          </div>
          <Link href="/painel" className="pn-btn" style={{ fontSize: 12, padding: "7px 12px" }}>Ir para o painel</Link>
        </div>
      </div>
    </div>
  );
}
