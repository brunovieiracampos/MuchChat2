import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { DEFAULT_PUBLIC_REPLIES, type Rule } from "@/config/rules";
import { PRODUCT } from "@/config/site";
import { currentAccount } from "@/lib/account-context";
import { buildExecutions, summarize, type ExecStatus } from "@/lib/activity";
import {
  deleteAutomation, getAutomation, isPaused, listAutomations, saveAutomation, setAutomationActive, setPaused, toInput,
  type AutomationInput, type Issue,
} from "@/lib/automations";
import { TEMPLATES, blankStep, newStepId, stepsOf, type Step } from "@/lib/flow";
import { listMediaPage } from "@/lib/instagram";
import { NEXT_POST, isNextPost, postKey } from "@/lib/match";
import { readLog } from "@/lib/processor";
import { buildFunnel, readStats, sumCounts } from "@/lib/stats";

/**
 * Ferramentas do MCP do Much Chat. Rodam dentro da conta do dono do token (app/api/mcp/route.ts),
 * com as mesmas regras e validações do painel.
 */

type Out = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): Out => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const err = (message: string): Out => ({ content: [{ type: "text", text: message }], isError: true });
const issuesText = (issues: Issue[]) => `Não foi possível salvar:\n${issues.map((i) => `- ${i.message}`).join("\n")}`;

/* ---------- descrição das automações ---------- */

function describePosts(r: Rule): string {
  if (r.posts.some((p) => postKey(p) === "*")) return "qualquer post ou Reels";
  if (r.posts.some(isNextPost)) return r.active !== false && r.armedAt ? `próxima publicação (esperando desde ${new Date(r.armedAt).toISOString()})` : "próxima publicação (ative para começar a esperar)";
  if (!r.posts.length) return "nenhum post escolhido";
  return r.posts.join(", ") + (r.boundAt ? ` (preso automaticamente em ${new Date(r.boundAt).toISOString()})` : "");
}

function describeStep(s: Step): Record<string, unknown> {
  if (s.type === "reply") return { tipo: "responder_comentario", respostas: s.replies };
  if (s.type === "dm") return { tipo: "enviar_dm", texto: s.text, botao: s.button ?? null };
  return { tipo: "verificar_se_segue", texto: s.text, botao: s.button, texto_insistencia: s.retryText, botao_insistencia: s.retryButton };
}

async function describe(r: Rule, full: boolean) {
  const funnel = sumCounts(await readStats(r.id), 7);
  const base = {
    id: r.id, nome: r.name ?? r.id, ativa: r.active !== false, palavras_chave: r.keywords, posts: describePosts(r), link: r.link || null,
    funil_7_dias: { comentaram: funnel.comment, receberam_dm: funnel.dm, clicaram: funnel.click, novos_seguidores: funnel.gained, concluiram: funnel.done, falhas: funnel.failed },
  };
  if (!full) return { ...base, blocos: stepsOf(r).length };
  return { ...base, fluxo: stepsOf(r).map(describeStep), funil_detalhado: buildFunnel(r, funnel).map((f) => ({ etapa: f.label, pessoas: f.value })) };
}

/* ---------- entrada do fluxo ---------- */

const buttonSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("continue").describe("Botão que continua o fluxo (espera o clique)"), title: z.string().max(20) }),
  z.object({ kind: z.literal("link").describe("Botão que abre um link"), title: z.string().max(20), url: z.string().optional().describe("Sem url, usa o link da automação") }),
]);

const stepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reply").describe("Resposta pública no comentário"), replies: z.array(z.string()).min(1).describe("Frases; uma é sorteada a cada comentário") }),
  z.object({ type: z.literal("dm").describe("Mensagem no direct"), text: z.string().describe("Aceita {link} e {usuario}"), button: buttonSchema.optional() }),
  z.object({
    type: z.literal("follow").describe("Só continua para quem segue o perfil; senão pede para seguir"),
    text: z.string().optional(), button: z.string().max(20).optional(), retryText: z.string().optional(), retryButton: z.string().max(20).optional(),
  }),
]);

function toSteps(input: z.infer<typeof stepSchema>[]): Step[] {
  return input.map((s): Step => {
    if (s.type === "reply") return { id: newStepId(), type: "reply", replies: s.replies };
    if (s.type === "dm") return { id: newStepId(), type: "dm", text: s.text, ...(s.button ? { button: s.button } : {}) };
    const d = blankStep("follow") as Extract<Step, { type: "follow" }>;
    return { ...d, text: s.text ?? d.text, button: s.button ?? d.button, retryText: s.retryText ?? d.retryText, retryButton: s.retryButton ?? d.retryButton };
  });
}

const postsSchema = z.union([
  z.literal("qualquer").describe("Qualquer post ou Reels"),
  z.literal("proxima").describe("Próxima publicação: ao ativar, espera e se prende ao primeiro post publicado depois"),
  z.array(z.string()).describe("Links (ou ids) de posts específicos; lista vazia = rascunho sem post"),
]);

function toPosts(p: z.infer<typeof postsSchema>): string[] {
  if (p === "qualquer") return ["*"];
  if (p === "proxima") return [NEXT_POST];
  return p;
}

const templateIds = TEMPLATES.map((t) => t.id) as [string, ...string[]];

/* ---------- ferramentas ---------- */

export function registerTools(server: McpServer) {
  server.registerTool("account_info", {
    title: "Conta conectada",
    description: `Mostra a conta do Instagram conectada ao ${PRODUCT.name} e se as automações estão pausadas.`,
    inputSchema: z.object({}),
  }, async () => {
    const a = currentAccount();
    return ok({ instagram: `@${a.username}`, tipo: a.accountType, automacoes_pausadas: await isPaused() });
  });

  server.registerTool("list_automations", {
    title: "Listar automações",
    description: "Lista as automações da conta: status, palavras-chave, posts (ou se espera a próxima publicação) e o funil dos últimos 7 dias.",
    inputSchema: z.object({}),
  }, async () => ok(await Promise.all((await listAutomations()).map((r) => describe(r, false)))));

  server.registerTool("get_automation", {
    title: "Ver automação",
    description: "Detalhes de uma automação: fluxo bloco a bloco, posts, link e funil.",
    inputSchema: z.object({ id: z.string() }),
  }, async ({ id }) => {
    const r = await getAutomation(id);
    return r ? ok(await describe(r, true)) : err(`Automação “${id}” não encontrada. Use list_automations para ver os ids.`);
  });

  server.registerTool("list_posts", {
    title: "Listar posts",
    description: "Posts e Reels mais recentes do perfil (do mais novo para o mais antigo), com link, data, legenda e número de comentários. Use o link para associar uma automação.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(12) }),
  }, async ({ limit }) => {
    const { items } = await listMediaPage(limit);
    return ok(items.map((m) => ({ link: m.permalink ?? m.id, id: m.id, publicado_em: m.timestamp, tipo: m.media_type, comentarios: m.comments_count, legenda: m.caption?.slice(0, 160) ?? "" })));
  });

  server.registerTool("list_templates", {
    title: "Modelos de fluxo",
    description: "Modelos prontos de fluxo (ids e blocos). Use o id em create_automation ou copie os blocos para montar um fluxo próprio.",
    inputSchema: z.object({}),
  }, async () => ok(TEMPLATES.map((t) => ({ id: t.id, nome: t.name, descricao: t.desc, fluxo: t.build([...DEFAULT_PUBLIC_REPLIES]).map(describeStep) }))));

  server.registerTool("create_automation", {
    title: "Criar automação",
    description: "Cria uma automação. Sem `active`, fica como rascunho (pausada). Posts: \"qualquer\", \"proxima\" (post agendado que ainda não saiu) ou lista de links; pode ficar vazio num rascunho e ser associado depois com set_automation_post. Fluxo: use `template` (ver list_templates) ou `steps`.",
    inputSchema: z.object({
      name: z.string().min(1),
      keywords: z.array(z.string()).describe("Palavras que disparam (uma palavra cada; maiúsculas e acentos não importam)"),
      link: z.string().optional().describe("Link do material; entra no lugar de {link} nas mensagens e nos botões de link"),
      posts: postsSchema.optional(),
      template: z.enum(templateIds).optional(),
      steps: z.array(stepSchema).optional(),
      active: z.boolean().default(false),
    }),
  }, async (a) => {
    if (a.template && a.steps) return err("Use `template` ou `steps`, não os dois.");
    const steps = a.steps ? toSteps(a.steps) : (TEMPLATES.find((t) => t.id === (a.template ?? "dm-link")) ?? TEMPLATES[0]).build([...DEFAULT_PUBLIC_REPLIES]);
    const input: AutomationInput = { name: a.name, keywords: a.keywords, link: a.link ?? "", posts: a.posts ? toPosts(a.posts) : [], steps, active: a.active };
    const r = await saveAutomation(input);
    if (!r.ok) return err(issuesText(r.issues));
    return ok({ criada: await describe(r.automation, true) });
  });

  server.registerTool("update_automation", {
    title: "Editar automação",
    description: "Altera campos de uma automação existente. Só os campos enviados mudam; `steps` substitui o fluxo inteiro.",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      link: z.string().optional(),
      posts: postsSchema.optional(),
      steps: z.array(stepSchema).optional(),
      active: z.boolean().optional(),
    }),
  }, async (a) => {
    const cur = await getAutomation(a.id);
    if (!cur) return err(`Automação “${a.id}” não encontrada.`);
    const base = toInput(cur);
    const input: AutomationInput = {
      ...base,
      name: a.name ?? base.name, keywords: a.keywords ?? base.keywords, link: a.link ?? base.link,
      posts: a.posts ? toPosts(a.posts) : base.posts, steps: a.steps ? toSteps(a.steps) : base.steps, active: a.active ?? base.active,
    };
    const r = await saveAutomation(input);
    if (!r.ok) return err(issuesText(r.issues));
    return ok({ atualizada: await describe(r.automation, true) });
  });

  server.registerTool("set_automation_post", {
    title: "Associar post",
    description: "Define em qual post a automação vale: link do post (ver list_posts), \"proxima\" (primeiro post publicado depois de ativar) ou \"qualquer\". Com activate=true, já ativa.",
    inputSchema: z.object({ id: z.string(), post: z.string().describe("Link do post, \"proxima\" ou \"qualquer\""), activate: z.boolean().optional() }),
  }, async ({ id, post, activate }) => {
    const cur = await getAutomation(id);
    if (!cur) return err(`Automação “${id}” não encontrada.`);
    const posts = post === "qualquer" ? ["*"] : post === "proxima" ? [NEXT_POST] : [post];
    const r = await saveAutomation({ ...toInput(cur), posts, active: activate ?? cur.active !== false });
    if (!r.ok) return err(issuesText(r.issues));
    return ok({ atualizada: await describe(r.automation, false) });
  });

  server.registerTool("set_automation_active", {
    title: "Ativar ou pausar automação",
    description: "Ativa ou pausa uma automação. Ativar confere se ela está completa (post, palavra-chave e fluxo).",
    inputSchema: z.object({ id: z.string(), active: z.boolean() }),
  }, async ({ id, active }) => {
    const r = await setAutomationActive(id, active);
    if (!r.ok) return err(issuesText(r.issues));
    const a = await getAutomation(id);
    return ok(a ? await describe(a, false) : { id, ativa: active });
  });

  server.registerTool("delete_automation", {
    title: "Excluir automação",
    description: "Exclui uma automação e o funil dela. Não dá para desfazer: confirme com a pessoa antes de usar.",
    inputSchema: z.object({ id: z.string() }),
    annotations: { destructiveHint: true },
  }, async ({ id }) => {
    const cur = await getAutomation(id);
    if (!cur) return err(`Automação “${id}” não encontrada.`);
    await deleteAutomation(id);
    return ok(`Automação “${cur.name ?? id}” excluída.`);
  });

  server.registerTool("recent_executions", {
    title: "Execuções recentes",
    description: "Comentários atendidos mais recentes: quem comentou, em qual automação, status e etapa atual. Filtra por automação e status.",
    inputSchema: z.object({
      automation_id: z.string().optional(),
      status: z.enum(["concluida", "andamento", "aguardando", "falhou", "simulacao", "expirada"]).optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }),
  }, async ({ automation_id, status, limit }) => {
    const [log, rules] = await Promise.all([readLog(2000), listAutomations()]);
    const list = buildExecutions(log, rules)
      .filter((e) => (!automation_id || e.ruleId === automation_id) && (!status || e.status === (status as ExecStatus)))
      .slice(0, limit);
    return ok(list.map((e) => ({ quando: new Date(e.lastAt).toISOString(), usuario: e.username ? `@${e.username}` : null, automacao: e.ruleName, comentario: e.text, status: e.status, etapa: e.step, erro: e.error ?? null })));
  });

  server.registerTool("summary", {
    title: "Resumo do período",
    description: "Números do período: comentários, DMs, respostas, falhas, palavras-chave mais comentadas e execuções por automação.",
    inputSchema: z.object({ days: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90)]).default(7) }),
  }, async ({ days }) => {
    const [log, rules] = await Promise.all([readLog(2000), listAutomations()]);
    const s = summarize(buildExecutions(log, rules), rules, days);
    return ok({ dias: days, comentarios: s.comments, dms_enviadas: s.dmSent, respostas_publicas: s.replies, falhas: s.failed, palavras_chave: s.perKeyword, por_automacao: s.perAutomation, observacao: "Baseado nos últimos 2.000 eventos; o funil de cada automação está em get_automation." });
  });

  server.registerTool("pause_all", {
    title: "Pausar ou retomar tudo",
    description: "Pausa ou retoma todas as automações da conta. Ao retomar, os comentários dos últimos 7 dias são recuperados pela varredura.",
    inputSchema: z.object({ paused: z.boolean() }),
  }, async ({ paused }) => {
    await setPaused(paused);
    return ok(paused ? "Automações pausadas." : "Automações retomadas.");
  });
}
