import type { ExecStatus } from "@/lib/activity";
import { EXEC_STATUS } from "@/lib/format";
import { Badge } from "./ui";

export function ExecBadge({ status }: { status: ExecStatus }) {
  const s = EXEC_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
