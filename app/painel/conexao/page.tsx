import Link from "next/link";
import { PRODUCT } from "@/config/site";
import { getSubscribedFields } from "@/lib/instagram";
import { getActivity, getConnection, getFlags, inAccount } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { SubscribeButton } from "../_components/action-buttons";
import { Badge, Icon } from "../_components/ui";
import { ICONS } from "../_components/icons";

const ERRORS: Record<string, string> = {
  cancelado: "O login no Instagram foi cancelado. Tente de novo quando quiser.",
  sessao: "A conexão demorou demais ou foi aberta em outra aba. Tente de novo.",
  meta: "O Instagram não confirmou a conexão. Tente de novo em instantes.",
  "em-uso": "Esta conta do Instagram já está conectada a outro usuário do Much Chat. Entre com esse usuário ou fale com o suporte.",
};

export default async function Conexao({ searchParams }: { searchParams: Promise<{ conectado?: string; webhook?: string; erro?: string; conta?: string }> }) {
  await requireSession();
  const q = await searchParams;
  const [conn, flags, { rules, executions }] = await Promise.all([getConnection(), getFlags(), getActivity()]);
  const ok = conn.state === "connected";
  const fields = ok ? await inAccount(() => getSubscribedFields()).catch(() => null) : null;
  const active = rules.filter((r) => r.active !== false).length;
  const webhookOk = !!fields && ["comments", "messages", "messaging_postbacks"].every((f) => fields.includes(f));
  const error = q.erro === "outra-conta"
    ? `Você já conectou ${q.conta ? `@${q.conta}` : "outra conta"}. Por enquanto, cada usuário conecta uma conta do Instagram.`
    : q.erro ? ERRORS[q.erro] ?? ERRORS.meta : null;

  const steps: { label: string; hint: string; done: boolean; action?: React.ReactNode }[] = [
    {
      label: "Conectar sua conta do Instagram",
      hint: ok ? `@${conn.username} conectada` : "A conta precisa ser profissional (criador ou empresa). Você entra pelo próprio Instagram.",
      done: ok,
      action: !ok && conn.hasAppId ? <a href="/api/auth/instagram" className="pn-btn is-sm is-primary">Conectar</a> : undefined,
    },
    {
      label: "Receber comentários e cliques em tempo real",
      hint: !ok ? "Liberado depois de conectar." : fields === null ? "Não foi possível conferir agora." : webhookOk ? "Tudo certo: comentários, mensagens e cliques chegam na hora." : "Falta autorizar o recebimento de eventos.",
      done: webhookOk,
      action: ok && fields && !webhookOk ? <SubscribeButton /> : undefined,
    },
    {
      label: "Criar a primeira automação",
      hint: active ? `${active} automaç${active === 1 ? "ão ativa" : "ões ativas"}` : "Escolha o post, a palavra-chave e a mensagem do direct.",
      done: active > 0,
      action: ok && !active ? <Link href="/painel/automacoes/nova" className="pn-btn is-sm">Criar</Link> : undefined,
    },
    {
      label: "Ver funcionando",
      hint: executions.length ? "Já há comentários atendidos." : "Comente a palavra-chave no seu post, de outra conta, e acompanhe em Execuções.",
      done: executions.length > 0,
    },
  ];

  return (
    <div style={{ padding: "44px 16px 56px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 680 }}>
        <div className="pn-row" style={{ gap: 11 }}>
          <div className="pn-logo" style={{ width: 34, height: 34, borderRadius: 10 }}>{PRODUCT.name[0]}</div>
          <div className="pn-brand-name" style={{ fontSize: 20, letterSpacing: -0.4 }}>{ok ? `@${conn.username}` : "Conectar o Instagram"}</div>
        </div>
        <p style={{ fontSize: 14, color: "#9C9CA9", lineHeight: 1.6, margin: "16px 0 0", maxWidth: 560 }}>
          Quando alguém comenta a palavra-chave no seu post, a pessoa recebe o material no direct e o comentário é respondido. São quatro passos.
        </p>

        {q.conectado && ok && (
          <div className={`pn-alert ${q.webhook === "falhou" ? "" : "is-violet"}`} style={{ marginTop: 18 }}>
            <Icon d="M5 12l4 4 10-10" size={17} color={q.webhook === "falhou" ? "#E0A526" : "#A78BFA"} width={2} style={{ marginTop: 1 }} />
            <div>
              <div className="pn-alert-title">@{conn.username} conectada</div>
              <div className="pn-alert-body">{q.webhook === "falhou" ? "Falta autorizar o recebimento de eventos: use o botão no passo 2." : "Agora crie a primeira automação."}</div>
            </div>
          </div>
        )}
        {error && (
          <div className="pn-alert is-red" style={{ marginTop: 18 }}>
            <Icon d={ICONS.error} size={17} color="#E4544F" width={1.8} style={{ marginTop: 1 }} />
            <div><div className="pn-alert-title">Não deu para conectar</div><div className="pn-alert-body">{error}</div></div>
          </div>
        )}
        {conn.state === "error" && (
          <div className="pn-alert is-red" style={{ marginTop: 18 }}>
            <Icon d={ICONS.error} size={17} color="#E4544F" width={1.8} style={{ marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <div className="pn-alert-title">O Instagram recusou a conexão salva</div>
              <div className="pn-alert-body" style={{ overflowWrap: "anywhere" }}>Conecte de novo para renovar o acesso. Detalhe: {conn.error}</div>
            </div>
            {conn.hasAppId && <a href="/api/auth/instagram" className="pn-btn is-danger" style={{ fontSize: 12, padding: "6px 11px" }}>Reconectar</a>}
          </div>
        )}
        {!conn.hasAppId && (
          <div className="pn-alert" style={{ marginTop: 18 }}>
            <Icon d={ICONS.warn} size={17} color="#E0A526" width={1.8} style={{ marginTop: 1 }} />
            <div><div className="pn-alert-title">Conexão indisponível no momento</div><div className="pn-alert-body">O {PRODUCT.name} está sem as credenciais do app da Meta (IG_APP_ID).</div></div>
          </div>
        )}
        {flags.dryRun && (
          <div className="pn-alert" style={{ marginTop: 18 }}>
            <Icon d={ICONS.flask} size={17} color="#E0A526" width={1.8} style={{ marginTop: 1 }} />
            <div><div className="pn-alert-title">Modo de teste ligado</div><div className="pn-alert-body">As automações só simulam: nenhuma DM ou resposta sai de verdade.</div></div>
          </div>
        )}

        <ol className="pn-card" style={{ marginTop: 20, listStyle: "none", padding: "6px 20px" }}>
          {steps.map((s, i) => (
            <li key={s.label} className="pn-row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "nowrap", borderTop: i ? "1px solid var(--line)" : "none", padding: "14px 0" }}>
              <span className="pn-num" style={{ width: 22, height: 22, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", fontSize: 11.5,
                background: s.done ? "var(--green-bg)" : "var(--card-3)", border: `1px solid ${s.done ? "var(--green-line)" : "var(--line-3)"}`, color: s.done ? "var(--green-text)" : "var(--text-3)" }}>{s.done ? "✓" : i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.5 }}>{s.hint}</div>
              </div>
              {s.action}
              {s.done && <Badge tone="green">Feito</Badge>}
            </li>
          ))}
        </ol>

        {ok && (
          <div className="pn-row" style={{ marginTop: 16 }}>
            <Link href="/painel" className="pn-btn">Ir para a visão geral</Link>
            {conn.hasAppId && <a href="/api/auth/instagram" className="pn-btn">Reconectar o Instagram</a>}
          </div>
        )}
      </div>
    </div>
  );
}
