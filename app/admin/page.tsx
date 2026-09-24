import { RULES } from "@/config/rules";
import { ruleAppliesToMedia } from "@/lib/match";
import { getMe, listRecentMedia } from "@/lib/instagram";
import { readLog } from "@/lib/processor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel — comentário → DM", robots: { index: false } };

const td = { border: "1px solid #ddd", padding: "4px 8px", fontSize: 14, verticalAlign: "top" } as const;
const fmt = (ms: number | string) => new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function Admin({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  if (!process.env.ADMIN_SECRET || key !== process.env.ADMIN_SECRET) {
    return (
      <main>
        <h1>Painel</h1>
        <form><input name="key" type="password" placeholder="ADMIN_SECRET" /> <button>Entrar</button></form>
      </main>
    );
  }
  const [me, media, log] = await Promise.all([
    getMe().catch((e) => ({ error: String(e) })),
    listRecentMedia(12).catch(() => []),
    readLog(100),
  ]);
  return (
    <main style={{ maxWidth: 1000 }}>
      <h1>Painel — comentário → DM</h1>
      <h2>Conta conectada</h2>
      <p><a href={`/api/auth/instagram?key=${encodeURIComponent(key)}`}>Conectar / reconectar Instagram</a></p>
      <pre style={{ background: "#f5f5f5", padding: 8 }}>{JSON.stringify(me, null, 2)}</pre>

      <h2>Regras</h2>
      <table style={{ borderCollapse: "collapse" }}><tbody>
        <tr><th style={td}>Regra</th><th style={td}>Posts</th><th style={td}>Palavras</th><th style={td}>Link</th></tr>
        {RULES.map((r) => (
          <tr key={r.id}><td style={td}>{r.id}{r.active === false ? " (inativa)" : ""}</td><td style={td}>{r.posts.join(", ")}</td><td style={td}>{r.keywords.join(", ")}</td><td style={td}><a href={r.link}>abrir</a></td></tr>
        ))}
      </tbody></table>

      <h2>Posts recentes</h2>
      <table style={{ borderCollapse: "collapse" }}><tbody>
        <tr><th style={td}>Data</th><th style={td}>Post</th><th style={td}>Media ID</th><th style={td}>Regra</th></tr>
        {media.map((m) => (
          <tr key={m.id}>
            <td style={td}>{m.timestamp ? fmt(m.timestamp) : ""}</td>
            <td style={td}><a href={m.permalink}>{m.caption?.slice(0, 50) ?? m.shortcode}</a></td>
            <td style={td}><code>{m.id}</code></td>
            <td style={td}>{RULES.filter((r) => ruleAppliesToMedia(r, m)).map((r) => r.id).join(", ") || "—"}</td>
          </tr>
        ))}
      </tbody></table>

      <h2>Últimos eventos</h2>
      <table style={{ borderCollapse: "collapse" }}><tbody>
        <tr><th style={td}>Quando</th><th style={td}>Origem</th><th style={td}>Usuário</th><th style={td}>Comentário</th><th style={td}>Ação</th><th style={td}>Detalhe</th></tr>
        {log.map((e, i) => (
          <tr key={i}>
            <td style={td}>{fmt(e.at)}</td><td style={td}>{e.source}</td><td style={td}>@{e.username}</td>
            <td style={td}>{e.text}</td><td style={td}><strong>{e.action}</strong></td><td style={td}>{e.detail?.slice(0, 120)}</td>
          </tr>
        ))}
      </tbody></table>
    </main>
  );
}
