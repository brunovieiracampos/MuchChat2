import Link from "next/link";
import { redirect } from "next/navigation";
import { MIN_LEAD_MS } from "@/lib/posts";
import { requireSession } from "@/lib/session";
import { editorProps } from "../data";
import { PostEditor } from "../editor";

/** "AAAA-MM-DDTHH:MM" vindo do calendário; só vale se for uma data futura (horário de Brasília). */
function parseWhen(raw: string | undefined): string | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return undefined;
  const ms = Date.parse(`${raw}:00-03:00`);
  return Number.isNaN(ms) || ms < Date.now() + MIN_LEAD_MS ? undefined : raw;
}

export default async function NovaPublicacao({ searchParams }: { searchParams: Promise<{ quando?: string }> }) {
  await requireSession();
  const [props, sp] = await Promise.all([editorProps(), searchParams]);
  if (!props) redirect("/painel/conexao");
  return (
    <div className="pn-page">
      <Link href="/painel/publicacoes" className="pn-link-back">← Publicações</Link>
      <PostEditor {...props} initialWhen={parseWhen(sp.quando)} />
    </div>
  );
}
