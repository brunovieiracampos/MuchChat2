import type { ReactNode } from "react";
import { getActivity, getConnection, getFlags } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { Shell } from "./_components/shell";
import "./painel.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "DIAriamente Automations", robots: { index: false } };

export default async function PainelLayout({ children }: { children: ReactNode }) {
  await requireSession();
  const [conn, flags, { executions }] = await Promise.all([getConnection(), getFlags(), getActivity()]);
  const since = Date.now() - 7 * 864e5;
  const failedCount = executions.filter((e) => e.status === "falhou" && e.lastAt >= since).length;
  return (
    <Shell
      connection={{ state: conn.state, username: conn.state === "connected" ? conn.username : undefined }}
      paused={flags.paused}
      dryRun={flags.dryRun}
      failedCount={failedCount}
    >
      {children}
    </Shell>
  );
}
