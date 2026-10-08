import { describe, expect, it, vi } from "vitest";
import { MemoryStore, getStore, setStoreForTests } from "@/lib/store";
import { setAccountForTests, testAccountCtx, withAccount, type AccountCtx } from "@/lib/account-context";
import { listAutomations, isPaused, setPaused } from "@/lib/automations";
import { processComment, readLog, type Deps } from "@/lib/processor";
import { listMaterials, removeMaterial, saveMaterial, type MaterialDeps, type MaterialInput } from "@/lib/materials";
import { readStats } from "@/lib/stats";
import { extractComments } from "@/lib/webhook";
import type { Rule } from "@/config/rules";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const rule = (id: string, kw: string): Rule => ({ id, posts: ["*"], keywords: [kw], link: "https://x.com", dm: "", steps: [{ id: "d", type: "dm", text: "Oi" }] });

function account(igUserId: string, rules: Rule[]): AccountCtx {
  const ctx = testAccountCtx({ accountId: `acc-${igUserId}`, igUserId });
  for (const r of rules) void ctx.repo.saveAutomation(r);
  return ctx;
}

// O processador de verdade, mas com a Meta simulada; regras e dono vêm da conta em uso.
const deps = (): Deps => ({
  sendPrivateReply: vi.fn(async () => ({ recipient_id: "P1" })),
  sendMessage: vi.fn(async () => ({})),
  replyToComment: vi.fn(async () => ({ id: "r" })),
  isFollower: vi.fn(async () => true),
  getMedia: async (id: string) => ({ id }),
  ownUserId: async () => "nao-e-a-pessoa",
  dryRun: () => false,
  paused: isPaused,
  rules: listAutomations,
  now: () => NOW,
  random: () => 0,
});

describe("isolamento entre contas", () => {
  it("fora de uma conta, acessar dados dá erro", () => {
    setAccountForTests(null);
    expect(() => getStore()).toThrow(/Nenhuma conta/);
  });

  it("cada conta só vê as próprias automações, estado, log e contadores", async () => {
    setAccountForTests(null);
    const base = new MemoryStore();
    setStoreForTests(base);
    const a = account("111", [rule("guia", "GUIA")]);
    const b = account("222", [rule("prompt", "PROMPT")]);
    const c = { id: "c1", text: "quero o GUIA", mediaId: "m1", fromId: "u1", username: "ana", timestamp: NOW - 1000 };

    // A mesma palavra "GUIA" só dispara na conta A; o mesmo id de comentário não colide entre contas.
    expect(await withAccount(a, () => processComment(c, "webhook", deps()))).toBe("completed");
    expect(await withAccount(b, () => processComment(c, "webhook", deps()))).toBe("no-match");

    await withAccount(a, async () => {
      expect((await listAutomations()).map((r) => r.id)).toEqual(["guia"]);
      expect((await readLog()).length).toBeGreaterThan(0);
      expect(await readStats("guia")).not.toEqual({});
    });
    await withAccount(b, async () => {
      expect((await listAutomations()).map((r) => r.id)).toEqual(["prompt"]);
      expect(await readLog()).toEqual([]);
      expect(await readStats("guia")).toEqual({});
    });

    // Tudo o que foi gravado ficou sob o prefixo da conta A.
    const keys = [...base.kv.keys()];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith("a:acc-111:"))).toBe(true);
  });

  it("pausa de uma conta não afeta a outra", async () => {
    setAccountForTests(null);
    setStoreForTests(new MemoryStore());
    const a = account("111", [rule("guia", "GUIA")]);
    const b = account("222", [rule("guia", "GUIA")]);
    await withAccount(a, () => setPaused(true));
    const c = { id: "c9", text: "GUIA", mediaId: "m1", fromId: "u1", timestamp: NOW - 1000 };
    expect(await withAccount(a, () => processComment(c, "webhook", deps()))).toBe("paused");
    expect(await withAccount(b, () => processComment(c, "webhook", deps()))).toBe("completed");
  });

  it("o webhook identifica a conta de destino de cada comentário", () => {
    const p = { object: "instagram", entry: [
      { id: "111", time: 1, changes: [{ field: "comments", value: { id: "c1", text: "GUIA", media: { id: "m1" }, from: { id: "u1" } } }] },
      { id: "222", time: 1, changes: [{ field: "comments", value: { id: "c2", text: "GUIA", media: { id: "m2" }, from: { id: "u2" } } }] },
    ] };
    expect(extractComments(p).map((c) => [c.accountId, c.id])).toEqual([["111", "c1"], ["222", "c2"]]);
  });

  it("cada conta só vê, edita e exclui os próprios materiais; o mesmo endereço pode existir nas duas", async () => {
    setAccountForTests(null);
    setStoreForTests(new MemoryStore());
    const a = account("111", []);
    const b = account("222", []);
    const mdeps: MaterialDeps = { deleteFiles: vi.fn(async () => {}), now: () => NOW };
    const input = (title: string, over: Partial<MaterialInput> = {}): MaterialInput => ({
      title, slug: "guia", description: "", coverPath: null, blocks: [{ id: "t1", type: "text", markdown: title }],
      visibility: "public", ctaPost: "", ctaKeyword: "", ...over,
    });

    const inA = await withAccount(a, () => saveMaterial(input("Guia da conta A"), "published", mdeps));
    const inB = await withAccount(b, () => saveMaterial(input("Guia da conta B"), "published", mdeps));
    expect(inA.ok && inB.ok).toBe(true);
    if (!inA.ok || !inB.ok) return;

    expect((await withAccount(a, listMaterials)).map((m) => m.title)).toEqual(["Guia da conta A"]);
    expect((await withAccount(b, listMaterials)).map((m) => m.title)).toEqual(["Guia da conta B"]);

    // A conta B tenta editar e excluir o material da A pelo id: não encontra.
    const edit = await withAccount(b, () => saveMaterial({ ...input("Invadido", { slug: "outro" }), id: inA.material.id }, "published", mdeps));
    expect(edit.ok).toBe(false);
    expect((await withAccount(b, () => removeMaterial(inA.material.id, mdeps))).ok).toBe(false);

    // A conta B tenta usar um arquivo da pasta da A.
    const steal = await withAccount(b, () => saveMaterial(input("Com arquivo alheio", {
      slug: "roubo", blocks: [{ id: "f1", type: "file", path: "materials/acc-111/guia.pdf", name: "guia.pdf", size: 10, description: "" }],
    }), "draft", mdeps));
    expect(steal.ok).toBe(false);

    expect((await withAccount(a, listMaterials)).map((m) => m.title)).toEqual(["Guia da conta A"]);
    expect(mdeps.deleteFiles).not.toHaveBeenCalled();
  });
});
