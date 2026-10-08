import { getAccount, getMaterials } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { MaterialList, type MaterialRow } from "./list";

export default async function Materiais() {
  await requireSession();
  const [account, materials] = await Promise.all([getAccount(), getMaterials()]);
  const rows: MaterialRow[] = materials.map((m) => ({
    id: m.id, title: m.title, slug: m.slug, visibility: m.visibility, status: m.status, blocks: m.blocks.length, updatedAt: m.updatedAt,
  }));
  return <MaterialList rows={rows} username={account?.username ?? null} />;
}
