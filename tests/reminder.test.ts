import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, getStore, setStoreForTests } from "@/lib/store";
import { readLog } from "@/lib/processor";
import { ReminderBusy, logReminderFailure, reminderKind, sendReminder, type ReminderDeps } from "@/lib/reminder";
import { GraphError } from "@/lib/instagram";
import { clickPayload, defaultReminder, type Step } from "@/lib/flow";
import { readStats } from "@/lib/stats";
import type { Rule } from "@/config/rules";

const NOW = Date.parse("2026-10-05T15:00:00Z");
const HOUR = 3600e3;

const steps: Step[] = [
  { id: "d1", type: "dm", text: "Clica 👇", button: { kind: "continue", title: "Me envie" } },
  { id: "f1", type: "follow", text: "Você me segue?", button: "Já sigo", retryText: "Ainda não segue", retryButton: "Ok, estou seguindo" },
  { id: "d2", type: "dm", text: "Aqui está {link}" },
];
const rule: Rule = { id: "guia", posts: ["*"], keywords: ["GUIA"], link: "https://x.com/guia", dm: "", steps, active: true, reminder: defaultReminder() };

function deps(over: Partial<ReminderDeps> = {}) {
  const d = {
    replyToComment: vi.fn(async () => ({ id: "r" })),
    sendMessage: vi.fn(async () => ({ message_id: "m" })),
    dryRun: () => false,
    paused: async () => false,
    rules: () => [rule] as Rule[],
    now: () => NOW,
    ...over,
  };
  return d as typeof d & ReminderDeps;
}

/** Comentário c1 parado num botão. Por padrão: nunca clicou, esperando no bloco d1, espera nº 1. */
const waiting = (over: Record<string, unknown> = {}) =>
  getStore().hset("c:c1", { status: "waiting", rule: "guia", username: "ana", mediaId: "m1", at: "d1", waitStep: "d1", pr: 1, wseq: 1, ...over });
const state = () => getStore().hgetall<Record<string, unknown>>("c:c1");

beforeEach(() => setStoreForTests(new MemoryStore()));

describe("lembrete", () => {
  it("nunca clicou: resposta pública com o nome, uma vez só", async () => {
    await waiting();
    const d = deps();
    expect(await sendReminder("c1", 1, d)).toBe("public");
    expect(d.replyToComment).toHaveBeenCalledWith("c1", "@ana, seu material está te esperando no direct 👀 Se não aparecer, olha na pasta Solicitações.");
    expect(d.sendMessage).not.toHaveBeenCalled();
    expect((await state())?.rp).toBe(1);
    expect((await state())?.status).toBe("waiting");
    expect((await readLog())[0]).toMatchObject({ action: "reminder-public", commentId: "c1", rule: "guia" });
    expect(await sendReminder("c1", 1, d)).toBe("skipped");
    expect(d.replyToComment).toHaveBeenCalledTimes(1);
  });

  it("clicou e parou: DM com o texto do lembrete e o mesmo botão", async () => {
    await waiting({ at: "f1", waitStep: "f1", clicked: 1, igsid: "IG1", clickAt: NOW - 3 * HOUR, wseq: 2, fno: 1 });
    const d = deps();
    expect(await sendReminder("c1", 2, d)).toBe("dm");
    expect(d.sendMessage).toHaveBeenCalledWith("IG1", {
      text: "Ainda dá tempo! É só tocar no botão aqui embaixo para continuar 👇",
      buttons: [{ type: "postback", title: "Ok, estou seguindo", payload: clickPayload("c1", "f1") }],
    });
    expect(d.replyToComment).not.toHaveBeenCalled();
    expect((await state())?.rd).toBe(1);
    expect((await readLog())[0].action).toBe("reminder-dm");
  });

  it("botão da DM: o do bloco em espera (continuar) ou o primeiro do 'verificar se segue'", async () => {
    await waiting({ at: "f1", waitStep: "f1", clicked: 1, igsid: "IG1", clickAt: NOW - HOUR, wseq: 2 });
    const d = deps();
    await sendReminder("c1", 2, d);
    expect(d.sendMessage).toHaveBeenCalledWith("IG1", expect.objectContaining({ buttons: [expect.objectContaining({ title: "Já sigo" })] }));
  });

  it("já recebeu o público e depois clicou: ainda pode receber a DM, e conta uma pessoa só", async () => {
    await waiting({ at: "f1", waitStep: "f1", clicked: 1, igsid: "IG1", clickAt: NOW - HOUR, wseq: 2, rp: 1, s_reminded: 1 });
    expect(await sendReminder("c1", 2, deps())).toBe("dm");
    const raw = await readStats("guia");
    expect(Object.keys(raw).filter((k) => k.endsWith(":reminded"))).toHaveLength(0);
  });

  it("conta 'reminded' no funil na primeira vez", async () => {
    await waiting();
    await sendReminder("c1", 1, deps());
    const raw = await readStats("guia");
    expect(Object.entries(raw).find(([k]) => k.endsWith(":reminded"))?.[1]).toBe(1);
  });

  it("não envia: clicou antes (espera mudou), fluxo terminou, pausa, modo de teste", async () => {
    const d = deps();
    await waiting({ wseq: 2 });
    expect(await sendReminder("c1", 1, d)).toBe("skipped");
    await waiting({ status: "done", wseq: 1 });
    expect(await sendReminder("c1", 1, d)).toBe("skipped");
    await waiting({ status: "waiting" });
    expect(await sendReminder("c1", 1, deps({ paused: async () => true }))).toBe("skipped");
    expect(await sendReminder("c1", 1, deps({ dryRun: () => true }))).toBe("skipped");
    expect(d.replyToComment).not.toHaveBeenCalled();
  });

  it("não envia: automação pausada, excluída ou com o lembrete desligado", async () => {
    await waiting();
    const off = (r: Rule[]) => deps({ rules: () => r });
    expect(await sendReminder("c1", 1, off([{ ...rule, active: false }]))).toBe("skipped");
    expect(await sendReminder("c1", 1, off([]))).toBe("skipped");
    expect(await sendReminder("c1", 1, off([{ ...rule, reminder: { ...defaultReminder(), enabled: false } }]))).toBe("skipped");
    expect(await sendReminder("c1", 1, off([{ ...rule, reminder: undefined }]))).toBe("skipped");
  });

  it("fluxo editado durante a espera (bloco removido ou sem botão): não envia", async () => {
    await waiting();
    const removed = deps({ rules: () => [{ ...rule, steps: steps.slice(1) }] });
    expect(await sendReminder("c1", 1, removed)).toBe("skipped");
    const noButton = deps({ rules: () => [{ ...rule, steps: [{ id: "d1", type: "dm", text: "Oi" } as Step] }] });
    expect(await sendReminder("c1", 1, noButton)).toBe("skipped");
    expect(removed.replyToComment).not.toHaveBeenCalled();
  });

  it("DM só dentro de 23h do último clique, e nunca sem saber quando foi", async () => {
    expect(reminderKind({ clicked: 1, igsid: "IG1", clickAt: NOW - 22 * HOUR }, NOW)).toBe("dm");
    expect(reminderKind({ clicked: 1, igsid: "IG1", clickAt: NOW - 23 * HOUR }, NOW)).toBeNull();
    expect(reminderKind({ clicked: 1, igsid: "IG1" }, NOW)).toBeNull();
    expect(reminderKind({ clicked: 1, clickAt: NOW - HOUR }, NOW)).toBeNull();
    expect(reminderKind({ clicked: 1, igsid: "IG1", clickAt: NOW - HOUR, rd: 1 }, NOW)).toBeNull();
    expect(reminderKind({}, NOW)).toBe("public");
    expect(reminderKind({ rp: 1 }, NOW)).toBeNull();
  });

  it("comentário sem nome de usuário: o texto não começa com vírgula solta", async () => {
    await waiting({ username: "" });
    const d = deps();
    await sendReminder("c1", 1, d);
    expect(d.replyToComment).toHaveBeenCalledWith("c1", "Seu material está te esperando no direct 👀 Se não aparecer, olha na pasta Solicitações.");
  });

  it("comentário em processamento (clique chegando agora): não envia e pede nova tentativa", async () => {
    await waiting();
    await getStore().set("lock:c1", NOW, { nx: true, ex: 60 });
    const d = deps();
    await expect(sendReminder("c1", 1, d)).rejects.toBeInstanceOf(ReminderBusy);
    expect(d.replyToComment).not.toHaveBeenCalled();
  });

  it("Instagram recusa o botão na DM: manda só texto", async () => {
    await waiting({ at: "d1", waitStep: "d1", clicked: 1, igsid: "IG1", clickAt: NOW - HOUR, wseq: 3 });
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new GraphError(400, { error: { code: 100, message: "formato" } }))
      .mockResolvedValueOnce({ message_id: "m" });
    expect(await sendReminder("c1", 3, deps({ sendMessage }))).toBe("dm");
    expect(sendMessage.mock.calls[1][1]).toEqual({ text: "Ainda dá tempo! É só tocar no botão aqui embaixo para continuar 👇\n\nResponda “Me envie” aqui para continuar." });
  });

  it("erro da Meta sobe para quem chamou e não marca como enviado; a falha final fica no log", async () => {
    await waiting();
    const d = deps({ replyToComment: vi.fn(async () => { throw new Error("rede"); }) });
    await expect(sendReminder("c1", 1, d)).rejects.toThrow("rede");
    expect((await state())?.rp).toBeUndefined();
    expect(await getStore().get("lock:c1")).toBeNull();
    await logReminderFailure("c1", "O Instagram recusou: comentário apagado", d);
    expect((await readLog())[0]).toMatchObject({ action: "reminder-failed", commentId: "c1", rule: "guia", detail: "O Instagram recusou: comentário apagado" });
    expect((await state())?.status).toBe("waiting");
  });
});
