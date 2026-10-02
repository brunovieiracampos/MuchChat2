import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentAccount } from "@/lib/account-context";
import { listAutomations, storeAutomation } from "@/lib/automations";
import { failPost, preparePost, publishPost, cleanupMedia, type PublisherDeps } from "@/lib/publisher";
import { kindFor, scheduledMarker, validatePost, type ScheduledPost } from "@/lib/posts";
import type { Rule } from "@/config/rules";

const NOW = Date.parse("2026-09-30T15:00:00Z");
const img = (path: string) => ({ path, width: 1080, height: 1350, size: 200_000 });
const vid = (path: string, over: object = {}) => ({ path, width: 1080, height: 1920, size: 40_000_000, type: "video" as const, duration: 45, cover: `${path}-capa.jpg`, ...over });

function deps(over: Partial<PublisherDeps> = {}) {
  let n = 0;
  const d: PublisherDeps = {
    signedUrl: vi.fn(async (p: string) => `https://blob/${p}?sig`),
    deleteMedia: vi.fn(async () => {}),
    createContainer: vi.fn(async () => `c${++n}`),
    containerStatus: vi.fn(async () => ({ code: "FINISHED" as const })),
    publishContainer: vi.fn(async () => "media-1"),
    getMediaLink: vi.fn(async () => ({ permalink: "https://www.instagram.com/p/NOVO/", timestamp: "2026-09-30T15:00:01+0000" })),
    recentMedia: vi.fn(async () => []),
    recentStories: vi.fn(async () => []),
    wait: async () => {},
    now: () => NOW,
    dryRun: () => false,
    ...over,
  };
  return d;
}

async function newPost(p: Partial<ScheduledPost>) {
  return currentAccount().repo.createPost({ kind: "image", caption: "Legenda", media: [img("posts/acc-test/a.jpg")], status: "scheduled", scheduleToken: "T1", scheduledAt: NOW, ...p });
}

describe("publicador", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prepara e publica uma imagem, e grava o link", async () => {
    const p = await newPost({});
    const d = deps();
    expect(await preparePost(p.id, "T1", d)).toBe("ok");
    expect(d.createContainer).toHaveBeenCalledWith({ image_url: "https://blob/posts/acc-test/a.jpg?sig", caption: "Legenda" });
    expect(await publishPost(p.id, "T1", d)).toBe("ok");
    expect(d.publishContainer).toHaveBeenCalledWith("c1");
    expect(await currentAccount().repo.getPost(p.id)).toMatchObject({ status: "published", igMediaId: "media-1", permalink: "https://www.instagram.com/p/NOVO/" });
  });

  it("carrossel cria um item por imagem e depois o carrossel; story vai sem legenda", async () => {
    const c = await newPost({ kind: "carousel", media: [img("posts/acc-test/1.jpg"), img("posts/acc-test/2.jpg")] });
    const d = deps();
    await preparePost(c.id, "T1", d);
    expect(d.createContainer).toHaveBeenNthCalledWith(1, { image_url: "https://blob/posts/acc-test/1.jpg?sig", is_carousel_item: "true" });
    expect(d.createContainer).toHaveBeenNthCalledWith(3, { media_type: "CAROUSEL", children: "c1,c2", caption: "Legenda" });
    const s = await newPost({ kind: "story", caption: "" });
    const d2 = deps();
    await preparePost(s.id, "T1", d2);
    expect(d2.createContainer).toHaveBeenCalledWith({ media_type: "STORIES", image_url: "https://blob/posts/acc-test/a.jpg?sig" });
  });

  it("em modo de teste não envia nada à Meta e marca como falha com o motivo", async () => {
    const p = await newPost({});
    const d = deps({ dryRun: () => true });
    expect(await preparePost(p.id, "T1", d)).toBe("stop");
    expect(d.createContainer).not.toHaveBeenCalled();
    expect(await currentAccount().repo.getPost(p.id)).toMatchObject({ status: "failed", error: expect.stringMatching(/Modo de teste/) });
    const q = await newPost({ status: "preparing", containerId: "c5" });
    expect(await publishPost(q.id, "T1", d)).toBe("stop");
    expect(d.publishContainer).not.toHaveBeenCalled();
  });

  it("Reels e Story de vídeo vão para a Meta com video_url", async () => {
    const r = await newPost({ kind: "reel", media: [vid("posts/acc-test/v.mp4")] });
    const d = deps();
    expect(await preparePost(r.id, "T1", d)).toBe("ok");
    expect(d.createContainer).toHaveBeenCalledWith({ media_type: "REELS", video_url: "https://blob/posts/acc-test/v.mp4?sig", caption: "Legenda", share_to_feed: "true" });
    const s = await newPost({ kind: "story", caption: "", media: [vid("posts/acc-test/s.mp4")] });
    const d2 = deps();
    await preparePost(s.id, "T1", d2);
    expect(d2.createContainer).toHaveBeenCalledWith({ media_type: "STORIES", video_url: "https://blob/posts/acc-test/s.mp4?sig" });
  });

  it("vídeo ainda processando: a nova tentativa reaproveita o container e espera antes de publicar", async () => {
    const r = await newPost({ kind: "reel", media: [vid("posts/acc-test/v.mp4")] });
    let calls = 0;
    const slow = deps({ containerStatus: vi.fn(async () => ({ code: "IN_PROGRESS" as const })) });
    await expect(preparePost(r.id, "T1", slow)).rejects.toThrow(/demorou/);
    expect(slow.createContainer).toHaveBeenCalledTimes(1);
    expect((await currentAccount().repo.getPost(r.id))!.containerId).toBe("c1");
    const ready = deps({ containerStatus: vi.fn(async () => ({ code: (++calls < 3 ? "IN_PROGRESS" : "FINISHED") as "IN_PROGRESS" | "FINISHED" })) });
    expect(await preparePost(r.id, "T1", ready)).toBe("ok");
    expect(ready.createContainer).not.toHaveBeenCalled();
    calls = 0;
    expect(await publishPost(r.id, "T1", ready)).toBe("ok");
    expect(ready.publishContainer).toHaveBeenCalledWith("c1");
  });

  it("ficha trocada (reagendada ou cancelada) não prepara nem publica", async () => {
    const p = await newPost({ scheduleToken: "T2" });
    const d = deps();
    expect(await preparePost(p.id, "T1", d)).toBe("stop");
    expect(await publishPost(p.id, "T1", d)).toBe("stop");
    const canceled = await newPost({ status: "canceled" });
    expect(await publishPost(canceled.id, "T1", d)).toBe("stop");
    expect(d.createContainer).not.toHaveBeenCalled();
    expect(d.publishContainer).not.toHaveBeenCalled();
  });

  it("nunca publica duas vezes: se a Meta já publicou, só acha o post", async () => {
    const p = await newPost({ containerId: "c9", status: "publishing" });
    const d = deps({
      containerStatus: vi.fn(async () => ({ code: "PUBLISHED" as const })),
      recentMedia: vi.fn(async () => [{ id: "media-9", timestamp: "2026-09-30T15:00:02+0000", caption: "Legenda" }]),
    });
    expect(await publishPost(p.id, "T1", d)).toBe("ok");
    expect(d.publishContainer).not.toHaveBeenCalled();
    expect((await currentAccount().repo.getPost(p.id))?.igMediaId).toBe("media-9");
    // Repetir depois de publicado também não publica.
    expect(await publishPost(p.id, "T1", deps())).toBe("stop");
  });

  it("mídia expirada na Meta é preparada de novo antes de publicar", async () => {
    const p = await newPost({ containerId: "velho", status: "preparing" });
    const statuses = vi.fn(async (id: string) => ({ code: (id === "velho" ? "EXPIRED" : "FINISHED") as "EXPIRED" | "FINISHED" }));
    const d = deps({ containerStatus: statuses });
    expect(await publishPost(p.id, "T1", d)).toBe("ok");
    expect(d.createContainer).toHaveBeenCalledTimes(1);
    expect(d.publishContainer).toHaveBeenCalledWith("c1");
  });

  it("liga e ativa a automação no post publicado", async () => {
    const p = await newPost({ automationId: "guia" });
    const rule: Rule = { id: "guia", name: "Guia", posts: [scheduledMarker(p.id)], keywords: ["GUIA"], link: "https://x.com", dm: "", steps: [{ id: "d", type: "dm", text: "Oi {link}" }], active: false };
    await storeAutomation(rule);
    await publishPost(p.id, "T1", deps());
    const [a] = await listAutomations();
    expect(a).toMatchObject({ posts: ["https://www.instagram.com/p/NOVO/"], active: true });
    expect((await currentAccount().repo.getPost(p.id))?.error).toBeNull();
  });

  it("automação incompleta: publica mesmo assim e avisa", async () => {
    const p = await newPost({ automationId: "rascunho" });
    await storeAutomation({ id: "rascunho", name: "Rascunho", posts: [scheduledMarker(p.id)], keywords: [], link: "", dm: "", steps: [], active: false });
    await publishPost(p.id, "T1", deps());
    const post = await currentAccount().repo.getPost(p.id);
    expect(post?.status).toBe("published");
    expect(post?.error).toMatch(/não foi ativada/);
    expect((await listAutomations())[0].posts).toEqual(["https://www.instagram.com/p/NOVO/"]);
  });

  it("falha final marca a publicação; apagar mídia só depois de publicada e uma vez", async () => {
    const p = await newPost({});
    await failPost(p.id, "T1", "O Instagram recusou: formato");
    expect(await currentAccount().repo.getPost(p.id)).toMatchObject({ status: "failed", error: "O Instagram recusou: formato" });
    const d = deps();
    await cleanupMedia(p.id, d);
    await cleanupMedia(p.id, d);
    expect(d.deleteMedia).toHaveBeenCalledTimes(1);
  });
});

describe("correções da revisão de segurança", () => {
  it("M2: preparação antiga não grava a mídia por cima de um reagendamento", async () => {
    const p = await newPost({});
    const d = deps({
      // Enquanto a Meta processa a mídia antiga, a pessoa reagenda (ficha nova).
      containerStatus: vi.fn(async () => { await currentAccount().repo.updatePost(p.id, { scheduleToken: "T2", containerId: null }); return { code: "FINISHED" as const }; }),
    });
    expect(await preparePost(p.id, "T1", d)).toBe("stop");
    expect((await currentAccount().repo.getPost(p.id))?.containerId).toBeNull();
  });

  it("M3: Story publicada com a resposta perdida é achada na lista de stories", async () => {
    const p = await newPost({ kind: "story", caption: "", containerId: "c9", status: "publishing" });
    const d = deps({
      containerStatus: vi.fn(async () => ({ code: "PUBLISHED" as const })),
      recentStories: vi.fn(async () => [{ id: "story-1", timestamp: "2026-09-30T15:00:03+0000" }]),
    });
    expect(await publishPost(p.id, "T1", d)).toBe("ok");
    expect(d.publishContainer).not.toHaveBeenCalled();
    expect((await currentAccount().repo.getPost(p.id))?.igMediaId).toBe("story-1");
  });

  it("M3: Meta confirmou mas o post não aparece: fica publicado com aviso, nunca “falhou”", async () => {
    const p = await newPost({ containerId: "c9", status: "publishing", caption: "outra legenda" });
    const d = deps({ containerStatus: vi.fn(async () => ({ code: "PUBLISHED" as const })) });
    expect(await publishPost(p.id, "T1", d)).toBe("ok");
    expect(await currentAccount().repo.getPost(p.id)).toMatchObject({ status: "published", error: expect.stringMatching(/Confira no perfil/) });
    expect(d.publishContainer).not.toHaveBeenCalled();
  });

  it("M3: falha final de algo que a Meta já publicou vira publicado com aviso", async () => {
    const p = await newPost({ containerId: "c9", status: "publishing" });
    await failPost(p.id, "T1", "erro qualquer", { containerStatus: async () => ({ code: "PUBLISHED" }), now: () => NOW });
    expect((await currentAccount().repo.getPost(p.id))?.status).toBe("published");
  });

  it("M3: se a automação falhar depois de publicar, a publicação continua publicada", async () => {
    const p = await newPost({ automationId: "quebrada" });
    const d = deps({ getMediaLink: vi.fn(async () => { throw new Error("rede"); }) });
    expect(await publishPost(p.id, "T1", d)).toBe("ok");
    expect(await currentAccount().repo.getPost(p.id)).toMatchObject({ status: "published", igMediaId: "media-1" });
  });

  it("M1: mídia de outra conta não vai para a Meta", async () => {
    const p = await newPost({ media: [img("posts/outra-conta/x.jpg")] });
    const d = deps();
    await expect(preparePost(p.id, "T1", d)).rejects.toThrow(/não é desta conta/);
    expect(d.signedUrl).not.toHaveBeenCalled();
  });
});

describe("regras da publicação", () => {
  const base = { kind: "image" as const, caption: "Oi", media: [img("x")], scheduledAt: NOW + 3600e3 };
  it("aceita post válido e recusa horário no passado", () => {
    expect(validatePost(base, { schedule: true, now: NOW })).toEqual([]);
    expect(validatePost({ ...base, scheduledAt: NOW + 30e3 }, { schedule: true, now: NOW }).map((i) => i.field)).toEqual(["scheduledAt"]);
  });
  it("proporção, carrossel, story e hashtags", () => {
    expect(validatePost({ ...base, media: [{ width: 1080, height: 1920, size: 1 }] }, { schedule: true, now: NOW })[0].message).toMatch(/proporção/);
    expect(validatePost({ ...base, kind: "carousel" }, { schedule: true, now: NOW })[0].message).toMatch(/pelo menos 2/);
    expect(validatePost({ ...base, kind: "story", media: [{ width: 1080, height: 1920, size: 1 }] }, { schedule: true, now: NOW })[0].message).toMatch(/Story não tem legenda/);
    expect(validatePost({ ...base, caption: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ") }, { schedule: true, now: NOW })[0].message).toMatch(/30 hashtags/);
  });
  it("vídeo: Reels, Story de vídeo e limites", () => {
    expect(kindFor(false, [vid("v")])).toBe("reel");
    expect(kindFor(true, [vid("v")])).toBe("story");
    expect(kindFor(false, [{ ...img("a"), type: "image" as const }, vid("v")])).toBe("carousel");
    const reel = { ...base, kind: "reel" as const, media: [vid("v")] };
    expect(validatePost(reel, { schedule: true, now: NOW })).toEqual([]);
    expect(validatePost({ ...reel, media: [vid("v", { duration: 2 })] }, { schedule: true, now: NOW })[0].message).toMatch(/menos de 3 segundos/);
    expect(validatePost({ ...reel, media: [vid("v", { size: 400 * 1024 * 1024 })] }, { schedule: true, now: NOW })[0].message).toMatch(/300 MB/);
    expect(validatePost({ ...reel, media: [vid("v", { width: 2160, height: 3840 })] }, { schedule: true, now: NOW })[0].message).toMatch(/1920 px/);
    const story = { ...base, kind: "story" as const, caption: "", media: [vid("v", { duration: 75 })] };
    expect(validatePost(story, { schedule: true, now: NOW })[0].message).toMatch(/60 segundos.*Story de vídeo/);
    expect(validatePost({ ...base, kind: "carousel" as const, media: [img("a"), vid("v")] }, { schedule: true, now: NOW })[0].message).toMatch(/Carrossel com vídeo/);
  });

  it("rascunho pode ficar sem mídia e sem horário", () => {
    expect(validatePost({ ...base, media: [], scheduledAt: null }, { schedule: false, now: NOW })).toEqual([]);
  });
});
