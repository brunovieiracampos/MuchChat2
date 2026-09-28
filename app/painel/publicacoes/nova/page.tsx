import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { editorProps } from "../data";
import { PostEditor } from "../editor";

export default async function NovaPublicacao() {
  await requireSession();
  const props = await editorProps();
  if (!props) redirect("/painel/conexao");
  return (
    <div className="pn-page">
      <Link href="/painel/publicacoes" className="pn-link-back">← Publicações</Link>
      <PostEditor {...props} />
    </div>
  );
}
