import { describe, expect, it, vi } from "vitest";
import { MemoryStore, setStoreForTests } from "@/lib/store";
import { listAutomations, saveAutomation, setAutomationActive, duplicateAutomation, storeAutomation, isPaused } from "@/lib/automations";
import { validateAutomation, type AutomationInput } from "@/lib/automation-input";
import { NEXT_POST } from "@/lib/match";
import { pickNextPost, resolveArmed } from "@/lib/next-post";
import { processComment, type Deps } from "@/lib/processor";
import type { Rule } from "@/config/rules";

const ARMED = Date.parse("2026-09-26T12:00:00Z");
const NOW = Date.parse("2026-09-27T10:00:00Z");
const media = [
  { id: "m3", timestamp: "2026-09-27T09:00:00+0000", permalink: "https://www.instagram.com/p/SEGUNDO/", shortcode: "SEGUNDO" },
  { id: "m2", timestamp: "2026-09-27T08:00:00+0000", permalink: "https://www.instagram.com/p/PRIMEIRO/", shortcode: "PRIMEIRO" },
  { id: "m1", timestamp: "2026-09-25T08:00:00+0000", permalink: "https://www.instagram.com/p/ANTIGO/", shortcode: "ANTIGO" },
];
const armed: Rule = { id: "guia", name: "Guia", posts: [NEXT_POST], keywords: ["GUIA"], link: "https://x.com", dm: "", steps: [{ id: "d", type: "dm", text: "Oi" }], active: true, armedAt: ARMED };

function deps(rules: Rule[]) {
  const saved: Rule[] = [];
  const d: Deps = {
    sendPrivateReply: vi.fn(async () => ({ recipient_id: "P" })), sendMessage: vi.fn(async () => ({})),
    replyToComment: vi.fn(async () => ({ id: "r" })), isFollower: vi.fn(async () => true),
    getMedia: vi.fn(async (id: string) => media.find((m) => m.id === id)!),
    recentMedia: vi.fn(async () => media),
    saveRule: async (r) => { saved.push(r); const i = rules.findIndex((x) => x.id === r.id); rules[i] = r; },
    ownUserId: async () => "eu", dryRun: () => false, paused: async () => false,
    rules: () => rules, now: () => NOW, random: () => 0,
  };
  return { d, saved };
}
const comment = (id: string, mediaId: string) => ({ id, text: "quero o GUIA", mediaId, fromId: "u", timestamp: NOW - 1000 });

describe("próxima publicação", () => {
  it("escolhe o primeiro post publicado depois de armar", () => {
    expect(pickNextPost(ARMED, media)?.id).toBe("m2");
    expect(pickNextPost(Date.parse("2026-09-28T00:00:00Z"), media)).toBeNull();
  });

  it("comentário em post antigo não prende nem lista posts", async () => {
    setStoreForTests(new MemoryStore());
    const rules = [{ ...armed }];
    const { d, saved } = deps(rules);
    expect(await processComment(comment("c1", "m1"), "webhook", d)).toBe("no-match");
    expect(d.recentMedia).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("primeiro comentário no post novo prende a automação e já dispara o fluxo", async () => {
    setStoreForTests(new MemoryStore());
    const rules = [{ ...armed }];
    const { d, saved } = deps(rules);
    expect(await processComment(comment("c2", "m2"), "webhook", d)).toBe("completed");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ posts: ["https://www.instagram.com/p/PRIMEIRO/"], armedAt: undefined, boundAt: NOW });
  });

  it("comentário num segundo post novo prende ao primeiro, não ao comentado", async () => {
    setStoreForTests(new MemoryStore());
    const rules = [{ ...armed }];
    const { d, saved } = deps(rules);
    expect(await processComment(comment("c3", "m3"), "webhook", d)).toBe("no-match");
    expect(saved[0].posts).toEqual(["https://www.instagram.com/p/PRIMEIRO/"]);
  });

  it("automação pausada ou já presa não é armada", () => {
    expect(resolveArmed([{ ...armed, active: false }], media, NOW)).toEqual([]);
    expect(resolveArmed([{ ...armed, posts: ["https://www.instagram.com/p/PRIMEIRO/"], armedAt: undefined }], media, NOW)).toEqual([]);
  });
});

describe("salvar com próxima publicação", () => {
  const input: AutomationInput = { name: "Amanhã", posts: [NEXT_POST], keywords: ["AMANHA"], link: "https://x.com", steps: [{ id: "d", type: "dm", text: "Oi {link}" }], active: true };

  it("é válida, arma ao ativar e desarma ao pausar", async () => {
    expect(validateAutomation(input)).toEqual([]);
    const r = await saveAutomation(input);
    if (!r.ok) throw new Error("não salvou");
    const [saved] = await listAutomations();
    expect(saved.armedAt).toBeTypeOf("number");
    await setAutomationActive(r.automation.id, false);
    expect((await listAutomations())[0].armedAt).toBeUndefined();
  });

  it("rascunho sem post é aceito; ativar sem post não", () => {
    expect(validateAutomation({ ...input, posts: [], active: false })).toEqual([]);
    expect(validateAutomation({ ...input, posts: [] }).map((i) => i.field)).toContain("posts");
  });

  it("mesma palavra em outra automação esperando a próxima publicação é bloqueada", () => {
    const other = { id: "o", name: "Outra", posts: [NEXT_POST], keywords: ["AMANHA"], active: true };
    expect(validateAutomation(input, [other]).some((i) => i.field === "keywords")).toBe(true);
  });

  it("cópia fica pausada e desarmada", async () => {
    const r = await saveAutomation(input);
    if (!r.ok) throw new Error("não salvou");
    const copy = await duplicateAutomation(r.automation.id);
    expect(copy).toMatchObject({ active: false, armedAt: undefined });
    void storeAutomation; void isPaused;
  });
});
