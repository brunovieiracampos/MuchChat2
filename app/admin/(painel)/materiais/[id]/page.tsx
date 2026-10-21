import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMaterial } from "@/lib/materials";
import { getAccount, inAccount } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { editorProps } from "../data";
import { MaterialEditor } from "../editor";

export default async function EditarMaterial({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  if (!(await getAccount())) redirect("/admin/conexao");
  const material = await inAccount(() => getMaterial(id));
  if (!material) notFound();
  const props = await editorProps(material);
  if (!props) redirect("/admin/conexao");
  return (
    <div className="pn-page">
      <Link href="/admin/materiais" className="pn-link-back">← Materiais</Link>
      <MaterialEditor key={material.updatedAt} {...props} />
    </div>
  );
}
