import { getActivity } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { ExecutionList } from "./list";

export default async function Execucoes({ searchParams }: { searchParams: Promise<{ q?: string; id?: string; status?: string; automacao?: string }> }) {
  await requireSession();
  const sp = await searchParams;
  const { executions, rules } = await getActivity();
  return (
    <ExecutionList
      executions={executions.slice(0, 500)}
      automations={rules.map((r) => ({ id: r.id, name: r.name ?? r.id }))}
      initial={{ q: sp.q ?? "", id: sp.id ?? null, status: sp.status ?? "todas", automation: sp.automacao ?? "" }}
    />
  );
}
