import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, getStore, setStoreForTests } from "@/lib/store";
import { autoReply, getAutoReply, saveAutoReply, type AutoReplyDeps } from "@/lib/auto-reply";

function deps(over: Partial<AutoReplyDeps> = {}) {
  const d = {
    sendMessage: vi.fn(async () => ({ message_id: "m" })),
    ownUserId: async () => "eu",
    dryRun: () => false,
    paused: async () => false,
    ...over,
  };
  return d as typeof d & AutoReplyDeps;
}

const oi = { igsid: "ana", text: "oi" };

beforeEach(() => setStoreForTests(new MemoryStore()));

describe("resposta automática de DM", () => {
  it("desligada por padrão: não envia", async () => {
    const d = deps();
    expect(await getAutoReply()).toEqual({ enabled: false, text: "" });
    expect(await autoReply(oi, d)).toBe("off");
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it("ligada: responde com o texto salvo", async () => {
    await saveAutoReply({ enabled: true, text: "  Oi! Já te respondo.  " });
    const d = deps();
    expect(await autoReply(oi, d)).toBe("sent");
    expect(d.sendMessage).toHaveBeenCalledWith("ana", { text: "Oi! Já te respondo." });
  });

  it("uma resposta por pessoa a cada 24h", async () => {
    await saveAutoReply({ enabled: true, text: "Oi!" });
    const d = deps();
    expect(await autoReply(oi, d)).toBe("sent");
    expect(await autoReply({ igsid: "ana", text: "tudo bem?" }, d)).toBe("cooldown");
    expect(await autoReply({ igsid: "bia", text: "olá" }, d)).toBe("sent");
    expect(d.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("mensagem sem texto não conta", async () => {
    await saveAutoReply({ enabled: true, text: "Oi!" });
    const d = deps();
    expect(await autoReply({ igsid: "ana", text: "   " }, d)).toBe("ignored");
    expect(await autoReply({ igsid: "ana" }, d)).toBe("ignored");
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it("mensagem da própria conta não conta", async () => {
    await saveAutoReply({ enabled: true, text: "Oi!" });
    const d = deps();
    expect(await autoReply({ igsid: "eu", text: "oi" }, d)).toBe("ignored");
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it("modo de teste e pausa geral não enviam nem gastam a vez da pessoa", async () => {
    await saveAutoReply({ enabled: true, text: "Oi!" });
    expect(await autoReply(oi, deps({ dryRun: () => true }))).toBe("dry-run");
    expect(await autoReply(oi, deps({ paused: async () => true }))).toBe("paused");
    const d = deps();
    expect(await autoReply(oi, d)).toBe("sent");
  });

  it("quem está parado num botão de automação não recebe", async () => {
    await saveAutoReply({ enabled: true, text: "Oi!" });
    await getStore().set("w:ana", "c1");
    await getStore().hset("c:c1", { status: "waiting", waitStep: "d1" });
    const d = deps();
    expect(await autoReply(oi, d)).toBe("in-flow");
    expect(d.sendMessage).not.toHaveBeenCalled();
    await getStore().hset("c:c1", { status: "done" });
    expect(await autoReply(oi, d)).toBe("sent");
  });

  it("se o envio falha, libera a pessoa para a próxima mensagem", async () => {
    await saveAutoReply({ enabled: true, text: "Oi!" });
    const fail = deps({ sendMessage: vi.fn(async () => { throw new Error("recusado"); }) });
    expect(await autoReply(oi, fail)).toBe("error");
    expect(await autoReply(oi, deps())).toBe("sent");
  });

  it("não deixa ligar sem texto e limita o tamanho", async () => {
    expect(await saveAutoReply({ enabled: true, text: " " })).toEqual({ ok: false, error: "Escreva a mensagem antes de ligar." });
    expect(await saveAutoReply({ enabled: true, text: "x".repeat(1001) })).toEqual({ ok: false, error: "A mensagem pode ter até 1000 caracteres." });
    expect(await saveAutoReply({ enabled: false, text: "" })).toEqual({ ok: true });
  });
});
