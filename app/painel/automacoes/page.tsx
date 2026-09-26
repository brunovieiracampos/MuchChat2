import { summarize } from "@/lib/activity";
import { postKey, waitsNextPost } from "@/lib/match";
import { getActivity } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { AutomationList, type AutomationRow } from "./list";

export default async function Automacoes() {
  await requireSession();
  const { executions, rules } = await getActivity();
  const week = summarize(executions, rules, 7);
  const stats = new Map(week.perAutomation.map((a) => [a.id, a]));
  const rows: AutomationRow[] = rules.map((r) => {
    const anyPost = r.posts.some((p) => postKey(p) === "*");
    const active = r.active !== false;
    const scope = anyPost ? "Qualquer post"
      : waitsNextPost(r) ? (active ? "Esperando a próxima publicação" : "Próxima publicação: ative para começar a esperar")
      : !r.posts.length ? "Sem post: escolha o post para ativar"
      : `${r.posts.length} post${r.posts.length > 1 ? "s" : ""}${r.boundAt ? ", preso na publicação seguinte" : ""}`;
    return {
      id: r.id,
      name: r.name ?? r.id,
      trigger: r.keywords.length ? `Comentário contém ${r.keywords.map((k) => `“${k}”`).join(" ou ")}` : "Sem palavra-chave",
      scope,
      active,
      updatedAt: r.updatedAt ?? null,
      runs: stats.get(r.id)?.runs ?? 0,
      failed: stats.get(r.id)?.failed ?? 0,
    };
  });
  return <AutomationList rows={rows} />;
}
