import { summarize } from "@/lib/activity";
import { postKey } from "@/lib/match";
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
    return {
      id: r.id,
      name: r.name ?? r.id,
      trigger: `Comentário contém ${r.keywords.map((k) => `“${k}”`).join(" ou ")}`,
      scope: anyPost ? "Qualquer post" : `${r.posts.length} post${r.posts.length > 1 ? "s" : ""}`,
      active: r.active !== false,
      updatedAt: r.updatedAt ?? null,
      runs: stats.get(r.id)?.runs ?? 0,
      failed: stats.get(r.id)?.failed ?? 0,
    };
  });
  return <AutomationList rows={rows} />;
}
