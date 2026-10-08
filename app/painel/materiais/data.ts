import "server-only";
import { materialFiles, materialPrefix, type Material } from "@/lib/material";
import { materialSignedUrls } from "@/lib/media-store";
import { getAccount } from "@/lib/panel";

/** Tudo o que o editor precisa: prefixo de envio, pré-visualizações assinadas das imagens e o nome da conta. */
export async function editorProps(material?: Material) {
  const account = await getAccount();
  if (!account) return null;
  const previews = material ? await materialSignedUrls(account.accountId, materialFiles(material)) : {};
  return { material, previews, prefix: materialPrefix(account.accountId), username: account.username };
}
