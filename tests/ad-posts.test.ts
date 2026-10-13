import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, setStoreForTests } from "@/lib/store";
import { processComment, type Deps } from "@/lib/processor";
import { activeAds, knownAd, pickOriginal, rememberAd } from "@/lib/ad-posts";
import { extractComments } from "@/lib/webhook";
import type { Rule } from "@/config/rules";

const NOW = Date.parse("2026-10-13T18:00:00Z");
const CAPTION = "A OpenAI colocou o Codex dentro do Claude Code.";
const rule: Rule = {
  id: "review",
  posts: ["https://www.instagram.com/reel/REEL1/"],
  keywords: ["REVIEW"],
  link: "https://x.notion.site/y",
  dm: "Oi! {link}",
  publicReplies: ["A"],
};
const reel = { id: "post1", shortcode: "REEL1", timestamp: "2026-10-12T15:08:20+0000", caption: CAPTION };
const ad = { id: "ad1", shortcode: "AD1", timestamp: "2026-10-13T01:05:07+0000", caption: CAPTION, media_product_type: "AD" };

function deps(over: Partial<Deps> = {}) {
  const dm = vi.fn(async () => ({}));
  const getMedia = vi.fn(async (id: string) => (id === "ad1" ? ad : id === "post1" ? reel : { id, shortcode: "OTHER", media_product_type: "FEED" }));
  const adCandidates = vi.fn(async () => [reel, { id: "post0", shortcode: "OLD", timestamp: "2026-10-01T10:00:00+0000", caption: "Outra legenda" }]);
  return {
    sendPrivateReply: dm, sendMessage: vi.fn(async () => ({})), isFollower: vi.fn(async () => true),
    replyToComment: vi.fn(async () => ({ id: "r1" })), getMedia, adCandidates,
    ownUserId: async () => "me", dryRun: () => false, paused: async () => false,
    rules: () => [rule], now: () => NOW, random: () => 0,
    dm, ...over,
  } as unknown as Deps & { dm: typeof dm; getMedia: typeof getMedia; adCandidates: typeof adCandidates };
}

const comment = (o: Partial<Parameters<typeof processComment>[0]> = {}) => ({
  id: "c1", text: "Review", mediaId: "ad1", fromId: "u1", username: "fulano", timestamp: NOW - 60_000, ...o,
});

beforeEach(() => setStoreForTests(new MemoryStore()));

describe("pickOriginal", () => {
  it("escolhe o post de mesma legenda publicado antes do anúncio", () => {
    expect(pickOriginal(ad, [reel])?.id).toBe("post1");
    expect(pickOriginal(ad, [{ ...reel, caption: `  ${CAPTION}\n` }])?.id).toBe("post1");
  });
  it("ignora legenda diferente, legenda vazia e post publicado depois do anúncio", () => {
    expect(pickOriginal(ad, [{ ...reel, caption: "Outra" }])).toBeNull();
    expect(pickOriginal({ ...ad, caption: "" }, [{ ...reel, caption: "" }])).toBeNull();
    expect(pickOriginal(ad, [{ ...reel, timestamp: "2026-10-13T09:00:00+0000" }])).toBeNull();
  });
  it("com duas publicações de mesma legenda, fica com a mais recente antes do anúncio", () => {
    const old = { ...reel, id: "post-antigo", timestamp: "2026-09-01T10:00:00+0000" };
    expect(pickOriginal(ad, [old, reel])?.id).toBe("post1");
  });
});

describe("comentário em anúncio", () => {
  it("vale a automação do post original, achado pela legenda", async () => {
    const d = deps();
    expect(await processComment(comment(), "webhook", d)).toBe("completed");
    expect(d.dm).toHaveBeenCalledTimes(1);
    expect(await knownAd("ad1")).toEqual({ id: "post1", shortcode: "REEL1" });
  });

  it("usa o post original informado pelo webhook, sem procurar pela legenda", async () => {
    const d = deps();
    expect(await processComment(comment({ originalMediaId: "post1" }), "webhook", d)).toBe("completed");
    expect(d.adCandidates).not.toHaveBeenCalled();
    expect(await knownAd("ad1")).toEqual({ id: "post1", shortcode: "REEL1" });
  });

  it("no segundo comentário já conhece o anúncio e não consulta o Instagram de novo", async () => {
    const d = deps();
    await processComment(comment(), "webhook", d);
    d.getMedia.mockClear();
    d.adCandidates.mockClear();
    expect(await processComment(comment({ id: "c2", fromId: "u2" }), "webhook", d)).toBe("completed");
    expect(d.adCandidates).not.toHaveBeenCalled();
    expect(d.getMedia.mock.calls.filter(([id]) => id === "ad1")).toHaveLength(0);
  });

  it("anúncio com legenda diferente de todos os posts não casa", async () => {
    const d = deps({ adCandidates: vi.fn(async () => [{ ...reel, caption: "Outra" }]) });
    expect(await processComment(comment(), "webhook", d)).toBe("no-match");
    expect(d.dm).not.toHaveBeenCalled();
    expect(await knownAd("ad1")).toBeNull();
  });

  it("publicação comum de outro post continua sem casar e só é conferida uma vez", async () => {
    const d = deps();
    expect(await processComment(comment({ mediaId: "outro" }), "webhook", d)).toBe("no-match");
    expect(await processComment(comment({ id: "c2", mediaId: "outro" }), "webhook", d)).toBe("no-match");
    expect(d.getMedia.mock.calls.filter(([id]) => id === "outro")).toHaveLength(2); // shortcode (em cache depois) + tipo
    expect(d.adCandidates).not.toHaveBeenCalled();
  });

  it("comentário sem palavra-chave não gasta consulta ao Instagram para saber se é anúncio", async () => {
    const d = deps();
    expect(await processComment(comment({ text: "que legal" }), "webhook", d)).toBe("no-match");
    expect(d.adCandidates).not.toHaveBeenCalled();
  });

  it("falha do Instagram ao conferir o anúncio não derruba o processamento", async () => {
    const d = deps({ getMedia: vi.fn(async () => { throw new Error("rede"); }) });
    expect(await processComment(comment(), "webhook", d)).toBe("no-match");
  });
});

describe("anúncios conhecidos", () => {
  it("entram na varredura por 30 dias depois do último comentário", async () => {
    await rememberAd("ad1", { id: "post1", shortcode: "REEL1" }, NOW);
    await rememberAd("ad-velho", { id: "post0" }, NOW - 31 * 864e5);
    expect(await activeAds(NOW)).toEqual(["ad1"]);
  });
});

describe("webhook", () => {
  it("lê o post original e o tipo quando o Instagram informa", () => {
    const [c] = extractComments({ entry: [{ id: "acc", time: 1, changes: [{ field: "comments", value: {
      id: "c9", text: "Review", from: { id: "u1", username: "fulano" },
      media: { id: "ad1", media_product_type: "AD", original_media_id: "post1" },
    } }] }] });
    expect(c).toMatchObject({ mediaId: "ad1", originalMediaId: "post1", mediaProductType: "AD" });
  });
  it("sem esses campos, segue como antes", () => {
    const [c] = extractComments({ entry: [{ id: "acc", changes: [{ field: "comments", value: { id: "c9", text: "x", media: { id: "m1" } } }] }] });
    expect(c.originalMediaId).toBeUndefined();
    expect(c.mediaProductType).toBeUndefined();
  });
});
