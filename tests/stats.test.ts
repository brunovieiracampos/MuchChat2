import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, setStoreForTests } from "@/lib/store";
import { handleClick, processComment, type Deps } from "@/lib/processor";
import { GraphError } from "@/lib/instagram";
import { clickPayload, type Step } from "@/lib/flow";
import { buildFunnel, readStats, sumCounts } from "@/lib/stats";
import type { Rule } from "@/config/rules";

const NOW = Date.parse("2026-09-24T23:00:00Z");

const steps: Step[] = [
  { id: "r1", type: "reply", replies: ["Te mandei no direct!"] },
  { id: "d1", type: "dm", text: "Clica aqui 👇", button: { kind: "continue", title: "Me envie" } },
  { id: "f1", type: "follow", text: "Você me segue?", button: "Já sigo", retryText: "Ainda não segue", retryButton: "Ok, estou seguindo" },
  { id: "d2", type: "dm", text: "Aqui está 👇", button: { kind: "link", title: "Abrir material" } },
];
const rule: Rule = { id: "guia", posts: ["*"], keywords: ["GUIA"], link: "https://x.com/guia", dm: "", steps };

function deps(over: Partial<Deps> = {}): Deps {
  let n = 0;
  return {
    sendPrivateReply: vi.fn(async () => ({ recipient_id: `IGSID${++n}`, message_id: "m1" })),
    sendMessage: vi.fn(async () => ({ message_id: "m2" })),
    replyToComment: vi.fn(async () => ({ id: "r" })),
    isFollower: vi.fn(async () => false),
    getMedia: async (id: string) => ({ id }),
    ownUserId: async () => "me",
    dryRun: () => false,
    paused: async () => false,
    rules: () => [rule],
    now: () => NOW,
    random: () => 0,
    ...over,
  };
}

const comment = (id: string) => ({ id, text: "quero o guia", mediaId: "m1", fromId: `u-${id}`, username: id, timestamp: NOW - 60_000 });
const counts = async () => sumCounts(await readStats("guia"), 7, NOW);

beforeEach(() => setStoreForTests(new MemoryStore()));

describe("funil por automação", () => {
  it("conta cada etapa uma vez por comentário e separa seguidores novos", async () => {
    const d = deps();
    // c1: não seguia, passa a seguir depois de insistir
    await processComment(comment("c1"), "webhook", d);
    await processComment(comment("c1"), "sweep", d); // repetição não conta de novo
    await handleClick({ igsid: "IGSID1", payload: clickPayload("c1", "d1") }, "webhook", d);
    await handleClick({ igsid: "IGSID1", payload: clickPayload("c1", "f1") }, "webhook", d);
    vi.mocked(d.isFollower).mockResolvedValue(true);
    await handleClick({ igsid: "IGSID1", payload: clickPayload("c1", "f1") }, "webhook", d);
    // c2: já seguia
    await processComment(comment("c2"), "webhook", d);
    await handleClick({ igsid: "IGSID2", payload: clickPayload("c2", "d1") }, "webhook", d);
    // c3: comentou e não clicou
    await processComment(comment("c3"), "webhook", d);

    expect(await counts()).toEqual({ comment: 3, dm: 3, click: 2, follower: 2, gained: 1, done: 2, failed: 0 });
  });

  it("conta falha e ignora modo de teste", async () => {
    await processComment(comment("t1"), "webhook", deps({ dryRun: () => true }));
    const d = deps({ sendPrivateReply: vi.fn(async () => { throw new GraphError(400, { error: { code: 10, message: "no permission" } }); }) });
    await processComment(comment("c1"), "webhook", d);
    expect(await counts()).toMatchObject({ comment: 1, dm: 0, failed: 1 });
  });

  it("monta o funil só com as etapas do fluxo e calcula as taxas", () => {
    const c = { comment: 10, dm: 8, click: 4, follower: 3, gained: 1, done: 3, failed: 2 };
    const f = buildFunnel(rule, c);
    expect(f.map((r) => r.stage)).toEqual(["comment", "dm", "click", "follower", "done"]);
    expect(f[2]).toMatchObject({ value: 4, ofFirst: 0.4, ofPrev: 0.5 });
    const simple: Rule = { ...rule, steps: [{ id: "r", type: "reply", replies: ["ok"] }] };
    expect(buildFunnel(simple, c).map((r) => r.stage)).toEqual(["comment", "done"]);
  });

  it("soma só o período pedido", () => {
    const raw = { "2026-09-24:comment": 2, "2026-09-10:comment": 5, "2026-09-24:dm": "1" };
    expect(sumCounts(raw, 7, NOW)).toMatchObject({ comment: 2, dm: 1 });
    expect(sumCounts(raw, 0, NOW)).toMatchObject({ comment: 7, dm: 1 });
  });
});
