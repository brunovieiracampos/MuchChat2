import { BlobNotFoundError, head } from "@vercel/blob";
import { downloadTarget, ownsMaterialFile } from "@/lib/material";
import { signedUrl } from "@/lib/media-store";
import { portalAccount, portalMaterial } from "@/lib/portal";
import { RATE_MESSAGE, allowKey, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download de um bloco de arquivo. Confere que o material está publicado e que o visitante pode abrir
 * (nesta etapa: só os públicos), e então redireciona para um link assinado que vale 5 minutos.
 * Se o arquivo sumiu do armazenamento, volta à página do material com um aviso. Se a checagem de existência
 * falhar por outro motivo, segue para o link assinado: o acesso já foi autorizado acima.
 */
export async function GET(req: Request, { params }: { params: Promise<{ conta: string; slug: string; blockId: string }> }) {
  const { conta, slug, blockId } = await params;
  if (!(await allowKey(`portal-dl:${await clientIp()}`, { limit: 60, windowSec: 600 }))) return new Response(RATE_MESSAGE, { status: 429 });

  const account = await portalAccount(conta);
  const material = account ? await portalMaterial(account.accountId, slug) : null;
  const target = material ? downloadTarget(material, blockId) : null;
  if (!account || !target || !ownsMaterialFile(account.accountId, target.path)) return new Response("Arquivo não encontrado.", { status: 404 });

  // Nunca em cache: o link assinado expira e o aviso depende do estado do arquivo.
  const redirectTo = (location: string) => new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
  const unavailable = () => redirectTo(new URL(`/m/${account.username}/${slug}?aviso=arquivo`, req.url).toString());

  try {
    await head(target.path);
  } catch (e) {
    if (e instanceof BlobNotFoundError) {
      console.error("[portal] arquivo sumiu do armazenamento", target.path, e);
      return unavailable();
    }
    console.error("[portal] checagem de existência falhou; seguindo para o link assinado", target.path, e);
  }

  try {
    return redirectTo(await signedUrl(target.path, 5 * 60e3));
  } catch (e) {
    console.error("[portal] falha ao assinar o arquivo", target.path, e);
    return unavailable();
  }
}
