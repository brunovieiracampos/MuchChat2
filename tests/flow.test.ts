import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, setStoreForTests } from "@/lib/store";
import { handleClick, processComment, readLog, type Deps } from "@/lib/processor";
import { extractClicks } from "@/lib/webhook";
import { GraphError } from "@/lib/instagram";
import { TEMPLATES, clickPayload, simulate, validateSteps, type Step } from "@/lib/flow";
import type { Rule } from "@/config/rules";

const NOW = Date.parse("2026-09-24T23:00:00Z");

// Fluxo estilo ManyChat: responde → DM com botão → confere se segue → DM com link.
const steps: Step[] = [
  { id: "r1", type: "reply", replies: ["Te mandei no direct!"] },
  { id: "d1", type: "dm", text: "Clica aqui 👇", button: { kind: "continue", title: "Me envie" } },
  { id: "f1", type: "follow", text: "Você me segue?", button: "Já sigo", retryText: "Ainda não segue", retryButton: "Ok, estou seguindo" },
  { id: "d2", type: "dm", text: "Aqui está 👇", button: { kind: "link", title: "Abrir material" } },
  { id: "r2", type: "reply", replies: ["Enviado ✅"] },
];
const rule: Rule = { id: "guia", posts: ["*"], keywords: ["GUIA"], link: "https://x.com/guia", dm: "", steps };

function deps(over: Partial<Deps> = {}) {
  const d = {
    sendPrivateReply: vi.fn(async () => ({ recipient_id: "IGSID1", message_id: "m1" })),
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
  return d as typeof d & Deps;
}

const comment = { id: "c1", text: "quero o guia", mediaId: "m1", fromId: "u1", username: "ana", timestamp: NOW - 60_000 };

beforeEach(() => setStoreForTests(new MemoryStore()));

describe("fluxo com botão e seguidor", () => {
  it("para no botão, segue no clique, insiste até seguir e libera o link", async () => {
    const d = deps();
    expect(await processComment(comment, "webhook", d)).toBe("waiting");
    expect(d.replyToComment).toHaveBeenCalledWith("c1", "Te mandei no direct!");
    expect(d.sendPrivateReply).toHaveBeenCalledWith("c1", {
      text: "Clica aqui 👇",
      buttons: [{ type: "postback", title: "Me envie", payload: clickPayload("c1", "d1") }],
    });
    // repetir comentário/varredura enquanto espera não reenvia nada
    expect(await processComment(comment, "sweep", d)).toBe("waiting");
    expect(d.sendPrivateReply).toHaveBeenCalledTimes(1);

    // clique em "Me envie" → não segue → pede para seguir
    expect(await handleClick({ igsid: "IGSID1", payload: clickPayload("c1", "d1") }, "webhook", d)).toBe("waiting");
    expect(d.isFollower).toHaveBeenCalledWith("IGSID1");
    expect(d.sendMessage).toHaveBeenLastCalledWith("IGSID1", expect.objectContaining({ text: "Você me segue?" }));

    // clique em "Já sigo" ainda sem seguir → insiste
    expect(await handleClick({ igsid: "IGSID1", payload: clickPayload("c1", "f1") }, "webhook", d)).toBe("waiting");
    expect(d.sendMessage).toHaveBeenLastCalledWith("IGSID1", expect.objectContaining({ text: "Ainda não segue" }));

    // agora segue → link + resposta final
    vi.mocked(d.isFollower).mockResolvedValue(true);
    expect(await handleClick({ igsid: "IGSID1", payload: clickPayload("c1", "f1") }, "webhook", d)).toBe("completed");
    expect(d.sendMessage).toHaveBeenLastCalledWith("IGSID1", {
      text: "Aqui está 👇",
      buttons: [{ type: "web_url", title: "Abrir material", url: "https://x.com/guia" }],
    });
    expect(d.replyToComment).toHaveBeenLastCalledWith("c1", "Enviado ✅");

    // clique repetido depois do fim é ignorado
    expect(await handleClick({ igsid: "IGSID1", payload: clickPayload("c1", "f1") }, "webhook", d)).toBe("ignored");
    expect((await readLog())[0].action).toBe("flow-done");
  });

  it("quem já segue passa direto pela verificação", async () => {
    const d = deps({ isFollower: vi.fn(async () => true) });
    await processComment(comment, "webhook", d);
    expect(await handleClick({ igsid: "IGSID1", payload: clickPayload("c1", "d1") }, "webhook", d)).toBe("completed");
    expect(d.sendMessage).toHaveBeenCalledTimes(1); // só o link, sem perguntar
  });

  it("ignora clique de outra pessoa e de bloco antigo", async () => {
    const d = deps();
    await processComment(comment, "webhook", d);
    expect(await handleClick({ igsid: "OUTRO", payload: clickPayload("c1", "d1") }, "webhook", d)).toBe("ignored");
    expect(await handleClick({ igsid: "IGSID1", payload: clickPayload("c1", "d2") }, "webhook", d)).toBe("ignored");
    expect(await handleClick({ igsid: "IGSID1", payload: "lixo" }, "webhook", d)).toBe("ignored");
  });

  it("se o Instagram recusar o botão, manda texto e aceita a resposta digitada", async () => {
    const refused = new GraphError(400, { error: { code: 100, message: "Invalid parameter" } });
    const d = deps({ sendPrivateReply: vi.fn().mockRejectedValueOnce(refused).mockResolvedValue({ recipient_id: "IGSID1" }), isFollower: vi.fn(async () => true) });
    expect(await processComment(comment, "webhook", d)).toBe("waiting");
    expect(d.sendPrivateReply).toHaveBeenLastCalledWith("c1", { text: "Clica aqui 👇\n\nResponda “Me envie” aqui para continuar." });
    // conversa qualquer não conta como clique
    expect(await handleClick({ igsid: "IGSID1", text: "oi, tudo bem?" }, "webhook", d)).toBe("ignored");
    expect(await handleClick({ igsid: "IGSID1", text: "me envie!" }, "webhook", d)).toBe("completed");
  });

  it("modo de teste descreve o fluxo até o primeiro botão sem enviar nada", async () => {
    const d = deps({ dryRun: () => true });
    expect(await processComment(comment, "webhook", d)).toBe("dry-run");
    expect(d.sendPrivateReply).not.toHaveBeenCalled();
    const detail = (await readLog())[0].detail!;
    expect(detail).toContain("Responderia o comentário");
    expect(detail).toContain("[botão: Me envie]");
    expect(detail).not.toContain("Aqui está");
  });

  it("só responder o comentário, sem DM", async () => {
    const d = deps({ rules: () => [{ ...rule, steps: [{ id: "r", type: "reply", replies: ["Valeu!"] }] }] });
    expect(await processComment(comment, "webhook", d)).toBe("completed");
    expect(d.sendPrivateReply).not.toHaveBeenCalled();
    expect(d.replyToComment).toHaveBeenCalledWith("c1", "Valeu!");
  });
});

describe("webhook de mensagens", () => {
  it("extrai postback, resposta rápida e texto; ignora eco", () => {
    const p = { object: "instagram", entry: [{ id: "me", messaging: [
      { sender: { id: "A" }, recipient: { id: "me" }, postback: { title: "Me envie", payload: "f1:c1:d1" } },
      { sender: { id: "B" }, recipient: { id: "me" }, message: { mid: "x", text: "Me envie", quick_reply: { payload: "f1:c2:d1" } } },
      { sender: { id: "C" }, recipient: { id: "me" }, message: { mid: "y", text: "me envie" } },
      { sender: { id: "me" }, recipient: { id: "C" }, message: { mid: "z", text: "eco", is_echo: true } },
    ] }] };
    expect(extractClicks(p)).toEqual([
      { igsid: "A", payload: "f1:c1:d1" },
      { igsid: "B", payload: "f1:c2:d1" },
      { igsid: "C", text: "me envie" },
    ]);
  });
});

describe("modelos e simulação", () => {
  it("todos os modelos são válidos", () => {
    for (const t of TEMPLATES) expect(validateSteps(t.build(["Oi"]), "https://x.com")).toEqual([]);
  });

  it("simulação para no botão e continua a cada clique", () => {
    expect(simulate(steps, "https://x.com", "ana", false, 0).waiting).toBe(true);
    const notFollowing = simulate(steps, "https://x.com", "ana", false, 2);
    expect(notFollowing.waiting).toBe(true);
    expect(notFollowing.items.filter((i) => i.kind === "click")).toHaveLength(2);
    const done = simulate(steps, "https://x.com", "ana", true, 1);
    expect(done.waiting).toBe(false);
    expect(done.items.at(-1)).toEqual({ kind: "end" });
  });
});
