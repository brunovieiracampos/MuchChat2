import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { accountForUser } from "@/lib/accounts";
import { mediaPrefix } from "@/lib/media-store";
import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from "@/lib/posts";
import { allowKey } from "@/lib/ratelimit";
import { getUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Autoriza o navegador a enviar uma mídia direto para o Blob privado (sem passar pelo limite de 4,5 MB das funções).
 * Só usuário logado, com Instagram conectado, gravando dentro de posts/{accountId}/.
 * Pela extensão: .jpg (imagem ou capa de vídeo) até 8 MB; .mp4 ou .mov (Reels e Story de vídeo) até 300 MB.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getUser();
        const account = user ? await accountForUser(user.id) : null;
        if (!account) throw new Error("Entre e conecte o Instagram para enviar mídia.");
        if (!pathname.startsWith(mediaPrefix(account.accountId)) || pathname.includes("..")) throw new Error("Caminho de envio inválido.");
        if (!(await allowKey(`upload:${account.accountId}`, { limit: 60, windowSec: 3600 }))) throw new Error("Muitos envios seguidos. Espere alguns minutos.");
        const ext = pathname.toLowerCase().split(".").pop();
        const video = ext === "mp4" || ext === "mov";
        if (!video && ext !== "jpg") throw new Error("Envie imagem (JPEG) ou vídeo MP4 ou MOV.");
        return {
          allowedContentTypes: video ? ["video/mp4", "video/quicktime"] : ["image/jpeg"],
          maximumSizeInBytes: video ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES,
          addRandomSuffix: true,
          // Vídeo grande pode levar mais para subir.
          validUntil: Date.now() + (video ? 60 : 10) * 60e3,
        };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha no envio." }, { status: 400 });
  }
}
