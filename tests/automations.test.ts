import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, setStoreForTests } from "@/lib/store";
import { normalizeInput, validateAutomation, type AutomationInput } from "@/lib/automation-input";
import { renderText, type Step } from "@/lib/flow";
import { listAutomations, saveAutomation, setAutomationActive, setPaused, duplicateAutomation, deleteAutomation } from "@/lib/automations";
import { buildContacts, buildExecutions, summarize } from "@/lib/activity";
import { processComment, type LogEntry } from "@/lib/processor";
import type { Rule } from "@/config/rules";

const base: AutomationInput = {
  name: "Advogado",
  posts: ["https://www.instagram.com/p/XYZ789/"],
  keywords: ["advogado"],
  link: "https://exemplo.com/material",
  steps: [{ id: "s1", type: "dm", text: "Oi {usuario}! {link}" }, { id: "s2", type: "reply", replies: ["Enviado!"] }],
  active: true,
};

beforeEach(() => setStoreForTests(new MemoryStore()));

describe("validação do formulário", () => {
  it("aceita uma automação completa e normaliza palavras", () => {
    const i = normalizeInput({ ...base, keywords: [" advogado ", "ADVOGADO", ""] });
    expect(i.keywords).toEqual(["ADVOGADO"]);
    expect(validateAutomation(i)).toEqual([]);
  });

  it("rascunho só exige nome; publicar exige tudo", () => {
    const empty: AutomationInput = { ...base, posts: [], keywords: [], link: "", steps: [] };
    expect(validateAutomation({ ...empty, active: false })).toEqual([]);
    const fields = validateAutomation(empty).map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(["posts", "keywords", "steps"]));
    expect(validateAutomation({ ...empty, name: "", active: false }).map((i) => i.field)).toEqual(["name"]);
  });

  it("aponta link vazio usado na mensagem, link inválido e palavra com espaço", () => {
    expect(validateAutomation({ ...base, link: "" }).some((i) => i.field === "steps" && i.stepId === "s1")).toBe(true);
    expect(validateAutomation({ ...base, link: "exemplo.com" }).some((i) => i.field === "link")).toBe(true);
    expect(validateAutomation({ ...base, keywords: ["DUAS PALAVRAS"] }).some((i) => i.field === "keywords")).toBe(true);
  });

  it("bloqueia a mesma palavra em outra automação ativa no mesmo post", () => {
    const other: Rule = { id: "x", name: "Outra", posts: ["*"], keywords: ["ADVOGADO"], link: "", dm: "", active: true };
    expect(validateAutomation(normalizeInput(base), [other])[0].message).toContain("Outra");
    expect(validateAutomation(normalizeInput(base), [{ ...other, active: false }])).toEqual([]);
  });

  it("renderText troca {link} e {usuario}", () => {
    expect(renderText("Oi {usuario}! {link}", base.link, "fulano")).toBe("Oi @fulano! https://exemplo.com/material");
  });

  it("segunda mensagem exige botão “continuar” antes", () => {
    const two: Step[] = [{ id: "a", type: "dm", text: "um" }, { id: "b", type: "dm", text: "dois" }];
    expect(validateAutomation({ ...base, steps: two }).map((i) => i.stepId)).toContain("b");
    const ok: Step[] = [{ id: "a", type: "dm", text: "um", button: { kind: "continue", title: "Quero" } }, { id: "b", type: "dm", text: "dois" }];
    expect(validateAutomation({ ...base, steps: ok })).toEqual([]);
    const longTitle: Step[] = [{ id: "a", type: "dm", text: "um", button: { kind: "continue", title: "Um botão com texto longo demais" } }];
    expect(validateAutomation({ ...base, steps: longTitle }).some((i) => i.stepId === "a")).toBe(true);
  });
});

describe("armazenamento das automações", () => {
  it("conta nova começa sem automações", async () => {
    expect(await listAutomations()).toEqual([]);
  });

  it("cria, edita, pausa, duplica e exclui", async () => {
    const r = await saveAutomation(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const id = r.automation.id;
    expect(r.automation.keywords).toEqual(["ADVOGADO"]);

    const edited = await saveAutomation({ ...base, id, name: "Advogados" });
    expect(edited.ok && edited.automation.createdAt).toBe(r.automation.createdAt);
    expect((await listAutomations()).filter((a) => a.id === id)).toHaveLength(1);

    await setAutomationActive(id, false);
    expect((await listAutomations()).find((a) => a.id === id)?.active).toBe(false);

    const copy = await duplicateAutomation(id);
    expect(copy?.active).toBe(false);
    expect(copy?.name).toBe("Advogados (cópia)");

    await deleteAutomation(id);
    expect((await listAutomations()).some((a) => a.id === id)).toBe(false);
  });

  it("não ativa automação incompleta", async () => {
    const r = await saveAutomation({ ...base, steps: [{ id: "x", type: "dm", text: "" }], active: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const res = await setAutomationActive(r.automation.id, true);
    expect(res.ok).toBe(false);
  });

  it("pausa geral: processador não faz nada e não marca o comentário", async () => {
    await setPaused(true);
    const dm = vi.fn(async () => ({}));
    const deps = {
      sendPrivateReply: dm, sendMessage: vi.fn(), isFollower: vi.fn(), replyToComment: vi.fn(), getMedia: async (id: string) => ({ id }),
      ownUserId: async () => "me", dryRun: () => false, paused: async () => true,
      rules: () => [{ id: "r", posts: ["*"], keywords: ["X"], link: "", dm: "oi" }], now: () => Date.now(), random: () => 0,
    };
    expect(await processComment({ id: "c1", text: "x", mediaId: "m" }, "sweep", deps)).toBe("paused");
    expect(dm).not.toHaveBeenCalled();
    expect(await processComment({ id: "c1", text: "x", mediaId: "m" }, "sweep", { ...deps, paused: async () => false })).toBe("completed");
  });
});

describe("execuções a partir do log", () => {
  const rules: Rule[] = [{ id: "r1", name: "Contador", posts: ["*"], keywords: ["CONTADOR"], link: "", dm: "" }];
  const at = Date.parse("2026-09-24T15:00:00Z");
  const e = (commentId: string, action: string, dt: number, extra: Partial<LogEntry> = {}): LogEntry =>
    ({ at: at + dt, source: "sweep", commentId, mediaId: "m1", username: "ana", text: "quero contador!", rule: "r1", action, ...extra });
  // log vem do mais recente para o mais antigo
  const log = [
    e("c3", "dry-run", 50), e("c3", "dry-run", 40),
    e("c2", "dm-failed", 30, { username: "bia", detail: "(#10) sem permissão" }),
    e("c1", "flow-done", 3), e("c1", "reply-sent", 2), e("c1", "dm-sent", 1),
  ];

  it("agrupa por comentário e define o status", () => {
    const ex = buildExecutions(log, rules);
    expect(ex.map((x) => [x.commentId, x.status])).toEqual([["c3", "simulacao"], ["c2", "falhou"], ["c1", "concluida"]]);
    expect(ex[0].steps).toHaveLength(1); // simulações repetidas viram uma
    expect(ex[1].error).toContain("permissão");
    expect(ex[2].keyword).toBe("CONTADOR");
    expect(ex[2].ruleName).toBe("Contador");
  });

  it("contatos e resumo do dia", () => {
    const ex = buildExecutions(log, rules);
    const contacts = buildContacts(ex);
    expect(contacts.find((c) => c.username === "ana")?.count).toBe(2);
    const s = summarize(ex, rules, 7, at + 3600e3);
    expect(s).toMatchObject({ comments: 3, dmSent: 1, replies: 1, failed: 1, simulated: 1 });
    expect(s.perDay).toHaveLength(7);
    expect(s.perDay[6].value).toBe(3);
    expect(s.perKeyword).toEqual([{ keyword: "CONTADOR", count: 3 }]);
  });
});
