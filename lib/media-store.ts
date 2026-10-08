import "server-only";
import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import { jpegSize } from "@/lib/jpeg";
import { isPrivateIp } from "@/lib/net";
import { ownsMaterialFile } from "@/lib/material";
import { IMAGE_MAX_BYTES, type PostMedia } from "@/lib/posts";

/**
 * Mídias das publicações no Vercel Blob privado. Ninguém acessa pelo endereço direto:
 * a Meta (e a pré-visualização do painel) recebem um link temporário assinado.
 * Cada conta só grava dentro de posts/{accountId}/.
 */

export const mediaPrefix = (accountId: string) => `posts/${accountId}/`;
export const ownsMedia = (accountId: string, path: string) => path.startsWith(mediaPrefix(accountId)) && !path.includes("..");

/** Link temporário para ler um arquivo (padrão: 2 horas). */
export async function signedUrl(path: string, ttlMs = 2 * 3600e3): Promise<string> {
  const validUntil = Date.now() + ttlMs;
  const tok = await issueSignedToken({ pathname: path, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(tok, { access: "private", operation: "get", pathname: path, validUntil });
  return presignedUrl;
}

/** Links temporários só para arquivos da conta (um path de outra conta é ignorado). */
export async function signedUrls(accountId: string, paths: string[], ttlMs?: number): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(paths.filter((p) => ownsMedia(accountId, p)).map(async (p) => { try { out[p] = await signedUrl(p, ttlMs); } catch { /* arquivo já apagado */ } }));
  return out;
}

/** Apaga só arquivos da conta. */
export async function deleteMedia(accountId: string, paths: string[]): Promise<void> {
  const mine = paths.filter((p) => ownsMedia(accountId, p));
  if (mine.length) await del(mine);
}

/* ---------- materiais do portal (materials/{accountId}/) ---------- */

/** Links temporários só para arquivos de material da conta (padrão: 1 hora). Arquivo que falhar fica de fora. */
export async function materialSignedUrls(accountId: string, paths: string[], ttlMs = 3600e3): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(paths.filter((p) => ownsMaterialFile(accountId, p)).map(async (p) => { try { out[p] = await signedUrl(p, ttlMs); } catch { /* arquivo já apagado */ } }));
  return out;
}

/** Apaga só arquivos de material da conta. */
export async function deleteMaterialFiles(accountId: string, paths: string[]): Promise<void> {
  const mine = paths.filter((p) => ownsMaterialFile(accountId, p));
  if (mine.length) await del(mine);
}

/* ---------- mídia por link (MCP) ---------- */


/** Lê o corpo aos poucos e para ao passar do limite (não acumula arquivos gigantes na memória). */
async function readLimited(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); throw new Error("A imagem passa de 8 MB."); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

/** Baixa uma imagem JPEG pública (https) e guarda na conta. Recusa endereços internos, outros formatos e arquivos grandes. */
export async function storeFromUrl(accountId: string, url: string): Promise<PostMedia> {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error(`Link inválido: ${url}`); }
  if (u.protocol !== "https:") throw new Error("O link da imagem precisa começar com https://.");
  if (u.port && u.port !== "443") throw new Error("O link da imagem precisa usar a porta padrão (443).");
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error(`Não consegui acessar ${u.hostname}.`);

  const res = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`O link da imagem respondeu ${res.status}.`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > IMAGE_MAX_BYTES) throw new Error("A imagem passa de 8 MB.");
  const buf = await readLimited(res, IMAGE_MAX_BYTES);
  const size = jpegSize(buf);
  if (!size) throw new Error("A imagem precisa ser JPEG. Converta ou envie pelo painel, que converte sozinho.");

  const r = await put(`${mediaPrefix(accountId)}${crypto.randomUUID()}.jpg`, Buffer.from(buf), { access: "private", contentType: "image/jpeg", addRandomSuffix: true });
  return { path: r.pathname, width: size.width, height: size.height, size: buf.byteLength };
}
