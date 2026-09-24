import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, setStoreForTests } from "@/lib/store";
import { processComment, resetFailed, readLog, type Deps } from "@/lib/processor";
import { hasKeyword, postKey, findRule } from "@/lib/match";
import { extractComments } from "@/lib/webhook";
import { verifySignature } from "@/lib/auth";
import { GraphError } from "@/lib/instagram";
import type { Rule } from "@/config/rules";
import crypto from "node:crypto";

const NOW = Date.parse("2026-09-24T23:00:00Z");
const rule: Rule = {
  id: "contador",
  posts: ["https://www.instagram.com/p/ABC123/"],
  keywords: ["CONTADOR"],
  link: "https://x.notion.site/y",
  dm: "Oi! {link}",
  publicReplies: ["A", "B", "C"],
};

function deps(over: Partial<Deps> = {}): Deps & { dm: ReturnType<typeof vi.fn>; reply: ReturnType<typeof vi.fn> } {
  const dm = vi.fn(async () => ({}));
  const reply = vi.fn(async () => ({ id: "r1" }));
  return {
    sendPrivateReply: dm,
    sendMessage: vi.fn(async () => ({})),
    isFollower: vi.fn(async () => true),
    replyToComment: reply,
    getMedia: async (id: string) => ({ id, shortcode: id === "m1" ? "ABC123" : "OTHER" }),
    ownUserId: async () => "me",
    dryRun: () => false,
    paused: async () => false,
    rules: () => [rule],
    now: () => NOW,
    random: () => 0,
    dm, reply,
    ...over,
  } as any;
}

const comment = (o: Partial<Parameters<typeof processComment>[0]> = {}) => ({
  id: "c1", text: "contador!", mediaId: "m1", fromId: "u1", username: "fulano", timestamp: NOW - 60_000, ...o,
});

beforeEach(() => setStoreForTests(new MemoryStore()));

describe("match", () => {
  it("palavra inteira, sem acento/caixa", () => {
    expect(hasKeyword("Quero! contador 🙏", "CONTADOR")).toBe(true);
    expect(hasKeyword("CONTADOR", "contador")).toBe(true);
    expect(hasKeyword("contadores", "CONTADOR")).toBe(false);
    expect(hasKeyword("Médico", "MEDICO")).toBe(true);
    expect(hasKeyword("#contador", "CONTADOR")).toBe(true);
  });
  it("postKey extrai shortcode", () => {
    expect(postKey("https://www.instagram.com/p/ABC123/?img_index=1")).toBe("ABC123");
    expect(postKey("https://www.instagram.com/d.ia.riamente/p/ABC123/")).toBe("ABC123");
    expect(postKey("*")).toBe("*");
  });
  it("findRule respeita o post", () => {
    expect(findRule("contador", { id: "m1", shortcode: "ABC123" }, [rule])?.id).toBe("contador");
    expect(findRule("contador", { id: "m2", shortcode: "OTHER" }, [rule])).toBeNull();
  });
});

describe("processComment", () => {
  it("envia DM e depois resposta pública, uma única vez", async () => {
    const d = deps();
    expect(await processComment(comment(), "webhook", d)).toBe("completed");
    expect(d.dm).toHaveBeenCalledWith("c1", { text: "Oi! https://x.notion.site/y" });
    expect(d.reply).toHaveBeenCalledTimes(1);
    // webhook repetido + varredura: nada novo
    expect(await processComment(comment(), "webhook", d)).toBe("done");
    expect(await processComment(comment(), "sweep", d)).toBe("done");
    expect(d.dm).toHaveBeenCalledTimes(1);
    expect(d.reply).toHaveBeenCalledTimes(1);
  });

  it("concorrência webhook + varredura não duplica", async () => {
    const d = deps({ sendPrivateReply: vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); return {}; }) });
    const rs = await Promise.all([processComment(comment(), "webhook", d), processComment(comment(), "sweep", d)]);
    expect(rs.sort()).toEqual(["completed", "locked"]);
    expect(d.sendPrivateReply).toHaveBeenCalledTimes(1);
  });

  it("ignora próprio usuário, outro post e sem palavra-chave", async () => {
    const d = deps();
    expect(await processComment(comment({ fromId: "me" }), "webhook", d)).toBe("own");
    expect(await processComment(comment({ mediaId: "m2" }), "webhook", d)).toBe("no-match");
    expect(await processComment(comment({ text: "legal!" }), "webhook", d)).toBe("no-match");
    expect(d.dm).not.toHaveBeenCalled();
  });

  it("não envia fora da janela de 7 dias", async () => {
    const d = deps();
    expect(await processComment(comment({ timestamp: NOW - 8 * 864e5 }), "sweep", d)).toBe("expired");
    expect(d.dm).not.toHaveBeenCalled();
  });

  it("erro transitório tenta de novo; permanente para e pode ser liberado", async () => {
    const transient = new GraphError(500, { error: { code: 2, message: "tmp" } });
    const d1 = deps({ sendPrivateReply: vi.fn().mockRejectedValueOnce(transient).mockResolvedValue({}) });
    expect(await processComment(comment(), "webhook", d1)).toBe("dm-error");
    expect(await processComment(comment(), "sweep", d1)).toBe("completed");

    setStoreForTests(new MemoryStore());
    const perm = new GraphError(400, { error: { code: 10, message: "no permission" } });
    const dm = vi.fn().mockRejectedValueOnce(perm).mockResolvedValue({});
    const d2 = deps({ sendPrivateReply: dm });
    expect(await processComment(comment(), "webhook", d2)).toBe("dm-failed");
    expect(await processComment(comment(), "sweep", d2)).toBe("done");
    expect(d2.reply).not.toHaveBeenCalled(); // não promete DM publicamente se falhou
    expect(await resetFailed()).toBe(1);
    expect(await processComment(comment(), "sweep", d2)).toBe("completed");
    expect(dm).toHaveBeenCalledTimes(2);
  });

  it("falha na resposta pública não reenvia a DM", async () => {
    const reply = vi.fn().mockRejectedValueOnce(new GraphError(500, { error: { code: 2 } })).mockResolvedValue({ id: "x" });
    const d = deps({ replyToComment: reply });
    expect(await processComment(comment(), "webhook", d)).toBe("reply-error");
    expect(await processComment(comment(), "sweep", d)).toBe("completed");
    expect(d.dm).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledTimes(2);
  });

  it("dry-run não envia", async () => {
    const d = deps({ dryRun: () => true });
    expect(await processComment(comment(), "webhook", d)).toBe("dry-run");
    expect(d.dm).not.toHaveBeenCalled();
    expect((await readLog())[0].action).toBe("dry-run");
  });
});

describe("webhook", () => {
  it("extrai comentários do payload", () => {
    const p = { object: "instagram", entry: [{ id: "me", time: 1790000000, changes: [{ field: "comments", value: { id: "c9", text: "CONTADOR", from: { id: "u", username: "x" }, media: { id: "m1", media_product_type: "FEED" } } }] }] };
    const [c] = extractComments(p);
    expect(c).toMatchObject({ id: "c9", mediaId: "m1", fromId: "u", username: "x", timestamp: 1790000000000 });
  });
  it("valida assinatura", () => {
    const body = '{"a":1}';
    const sig = "sha256=" + crypto.createHmac("sha256", "s3").update(body).digest("hex");
    expect(verifySignature(body, sig, "s3")).toBe(true);
    expect(verifySignature(body, sig, "outro")).toBe(false);
    expect(verifySignature(body, null, "s3")).toBe(false);
  });
});

describe("webhook formatos alternativos", () => {
  it("entry.field/value direto e comment_id, dentro de array", () => {
    const p = [{ object: "instagram", entry: [{ id: "me", time: 1790000000, field: "comments", value: { comment_id: "c10", text: "x", media: { id: "m1" }, from: { id: "u" } } }] }];
    expect(extractComments(p).map((c) => c.id)).toEqual(["c10"]);
  });
});
