import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { editorProps } from "../data";
import { MaterialEditor } from "../editor";

export default async function NovoMaterial() {
  await requireSession();
  const props = await editorProps();
  if (!props) redirect("/painel/conexao");
  return (
    <div className="pn-page">
      <Link href="/painel/materiais" className="pn-link-back">← Materiais</Link>
      <MaterialEditor {...props} />
    </div>
  );
}
