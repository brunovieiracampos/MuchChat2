import { DEFAULT_PUBLIC_REPLIES, type Rule } from "@/config/rules";

/**
 * Fluxo de uma automação: lista de blocos executados em ordem para cada comentário.
 * Sem dependências de servidor: roda também no navegador (construtor e teste na tela).
 *
 * Regras do Instagram que moldam o fluxo:
 * - A primeira mensagem é uma Private Reply ao comentário: só uma, até 7 dias depois dele.
 * - Depois dela, só dá para mandar outra se a pessoa interagir (clicar num botão ou responder),
 *   e dentro de 24 horas. Por isso um bloco de mensagem só pode vir depois de um botão "continuar".
 * - Verificar se a pessoa segue o perfil exige que ela já tenha interagido na conversa.
 */

export type Button =
  | { kind: "continue"; title: string }
  | { kind: "link"; title: string; url?: string };

export type ReplyStep = { id: string; type: "reply"; replies: string[] };
export type DmStep = { id: string; type: "dm"; text: string; button?: Button };
export type FollowStep = { id: string; type: "follow"; text: string; button: string; retryText: string; retryButton: string };
export type Step = ReplyStep | DmStep | FollowStep;
export type StepType = Step["type"];

export const TEXT_MAX = 1000;
export const TEMPLATE_TEXT_MAX = 640;
export const BUTTON_TITLE_MAX = 20;
export const REPLY_MAX = 300;
export const MAX_STEPS = 12;

export const STEP_META: Record<StepType, { label: string; color: string; help: string }> = {
  reply: { label: "Responder comentário", color: "#2FA37A", help: "Resposta pública no comentário" },
  dm: { label: "Enviar DM", color: "#A78BFA", help: "Mensagem no direct, com ou sem botão" },
  follow: { label: "Verificar se segue", color: "#E0A526", help: "Só continua para quem segue o perfil" },
};

export function newStepId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function blankStep(type: StepType, defaults: string[] = []): Step {
  const id = newStepId();
  if (type === "reply") return { id, type, replies: defaults.length ? [...defaults] : ["Te mandei no direct! 📩"] };
  if (type === "dm") return { id, type, text: "" };
  return {
    id, type,
    text: "Você já me segue aqui? O material é liberado só para quem segue o perfil 😉",
    button: "Já sigo",
    retryText: "Ainda não apareceu que você segue 🥲 Vai no meu perfil, toca em Seguir e depois clica aqui embaixo.",
    retryButton: "Ok, estou seguindo",
  };
}

/** Automações antigas (dm + publicReplies) viram o fluxo equivalente: DM → resposta pública. */
export function stepsOf(r: Pick<Rule, "steps" | "dm" | "publicReplies">): Step[] {
  if (r.steps?.length) return r.steps;
  const out: Step[] = [];
  if (r.dm) out.push({ id: "dm", type: "dm", text: r.dm });
  out.push({ id: "reply", type: "reply", replies: r.publicReplies?.length ? r.publicReplies : [...DEFAULT_PUBLIC_REPLIES] });
  return out;
}

export function renderText(text: string, link: string, username?: string): string {
  return text.replaceAll("{link}", link).replaceAll("{usuario}", username ? `@${username}` : "");
}

/** Bloco que envia mensagem no direct (DM ou pedido de seguir). */
export const isMessageStep = (s: Step) => s.type === "dm" || s.type === "follow";
/** Bloco que para o fluxo até a pessoa clicar. */
export const waitsForClick = (s: Step) => s.type === "follow" || (s.type === "dm" && s.button?.kind === "continue");

export type StepIssue = { stepId: string | null; message: string };

export function validateSteps(steps: Step[], link: string): StepIssue[] {
  const out: StepIssue[] = [];
  if (!steps.length) out.push({ stepId: null, message: "Adicione pelo menos um bloco ao fluxo." });
  if (steps.length > MAX_STEPS) out.push({ stepId: null, message: `O fluxo pode ter até ${MAX_STEPS} blocos.` });

  let sentMessage = false;
  let windowOpen = false;
  for (const s of steps) {
    const add = (message: string) => out.push({ stepId: s.id, message });
    if (isMessageStep(s) && sentMessage && !windowOpen) {
      add("O Instagram só deixa mandar outra mensagem depois que a pessoa clica. Coloque um botão “continuar” na mensagem anterior.");
    }
    if (s.type === "reply") {
      const rs = s.replies.map((r) => r.trim()).filter(Boolean);
      if (!rs.length) add("Escreva pelo menos uma frase de resposta.");
      if (rs.some((r) => r.length > REPLY_MAX)) add(`Cada resposta pode ter até ${REPLY_MAX} caracteres.`);
    }
    if (s.type === "dm") {
      if (!s.text.trim()) add("Escreva a mensagem.");
      if (s.text.includes("{link}") && !link) add("A mensagem usa {link}, mas o link da automação está vazio.");
      const max = s.button ? TEMPLATE_TEXT_MAX : TEXT_MAX;
      if (renderText(s.text, link, "usuario_exemplo").length > max) add(`Mensagem ${s.button ? "com botão " : ""}pode ter até ${max} caracteres.`);
      if (s.button) {
        if (!s.button.title.trim()) add("Dê um texto para o botão.");
        if (s.button.title.length > BUTTON_TITLE_MAX) add(`O texto do botão pode ter até ${BUTTON_TITLE_MAX} caracteres.`);
        if (s.button.kind === "link") {
          const url = s.button.url || link;
          if (!url) add("O botão de link precisa de um endereço (no botão ou no link da automação).");
          else if (!/^https?:\/\/\S+$/.test(url)) add("O link do botão precisa começar com http:// ou https://.");
        }
      }
    }
    if (s.type === "follow") {
      if (!s.text.trim() || !s.retryText.trim()) add("Preencha as duas mensagens do bloco.");
      if (!s.button.trim() || !s.retryButton.trim()) add("Dê um texto para os dois botões.");
      if (s.button.length > BUTTON_TITLE_MAX || s.retryButton.length > BUTTON_TITLE_MAX) add(`O texto do botão pode ter até ${BUTTON_TITLE_MAX} caracteres.`);
      if (s.text.length > TEMPLATE_TEXT_MAX || s.retryText.length > TEMPLATE_TEXT_MAX) add(`Mensagem com botão pode ter até ${TEMPLATE_TEXT_MAX} caracteres.`);
    }
    if (isMessageStep(s)) sentMessage = true;
    if (waitsForClick(s)) windowOpen = true;
  }
  return out;
}

/* ---------- modelos prontos ---------- */

export type FlowTemplate = { id: string; name: string; desc: string; build: (defaults: string[]) => Step[] };

export const TEMPLATES: FlowTemplate[] = [
  {
    id: "dm-link",
    name: "DM com o link",
    desc: "Manda o material no direct e responde o comentário.",
    build: (d) => [
      { id: newStepId(), type: "dm", text: "Oi! Aqui está o material que você pediu 👇\n\n{link}" },
      { id: newStepId(), type: "reply", replies: [...d] },
    ],
  },
  {
    id: "button-follow",
    name: "Botão + só para seguidores",
    desc: "Como o ManyChat: botão “Me envie”, confere se segue e só então libera o link.",
    build: (d) => [
      { id: newStepId(), type: "reply", replies: [...d] },
      { id: newStepId(), type: "dm", text: "Fico feliz que você se interessou! Clica aqui embaixo que eu já te mando o material 👇", button: { kind: "continue", title: "Me envie" } },
      blankStep("follow"),
      { id: newStepId(), type: "dm", text: "Prontinho! Aqui está o seu material 👇", button: { kind: "link", title: "Abrir material" } },
    ],
  },
  {
    id: "reply-only",
    name: "Só responder o comentário",
    desc: "Resposta pública, sem mensagem no direct.",
    build: () => [{ id: newStepId(), type: "reply", replies: ["Obrigado pelo comentário! 🙌"] }],
  },
  {
    id: "reply-dm-confirm",
    name: "Responder, enviar e confirmar",
    desc: "Responde, manda a DM com botão e, depois do clique, confirma no comentário.",
    build: () => [
      { id: newStepId(), type: "reply", replies: ["Vou te mandar no direct! 📩"] },
      { id: newStepId(), type: "dm", text: "Oi! Toca no botão para receber o material 👇", button: { kind: "continue", title: "Quero receber" } },
      { id: newStepId(), type: "dm", text: "Aqui está 👇\n\n{link}" },
      { id: newStepId(), type: "reply", replies: ["Enviado! Confere seu direct ✅"] },
    ],
  },
];

/* ---------- payload dos botões ---------- */

export function clickPayload(commentId: string, stepId: string): string {
  return `f1:${commentId}:${stepId}`;
}

export function parseClickPayload(p: string): { commentId: string; stepId: string } | null {
  const m = p.match(/^f1:([^:]+):([^:]+)$/);
  return m ? { commentId: m[1], stepId: m[2] } : null;
}

/* ---------- simulação (teste na tela) ---------- */

export type SimItem =
  | { kind: "reply"; text: string }
  | { kind: "dm"; stepId: string; text: string; button?: { title: string; url?: string; continues: boolean } }
  | { kind: "click"; title: string }
  | { kind: "note"; text: string }
  | { kind: "end" };

/**
 * Roda o fluxo no papel: `clicks` é quantas vezes a pessoa já clicou no botão que estava esperando;
 * `follows` diz se ela segue o perfil. Para no próximo botão sem clique.
 */
export function simulate(steps: Step[], link: string, username: string, follows: boolean, clicks: number): { items: SimItem[]; waiting: boolean } {
  const items: SimItem[] = [];
  let used = 0;
  let open = false;
  const click = (title: string) => {
    if (used >= clicks) return false;
    used++;
    open = true;
    items.push({ kind: "click", title });
    return true;
  };
  for (const s of steps) {
    if (s.type === "reply") {
      items.push({ kind: "reply", text: s.replies.find((r) => r.trim()) ?? "" });
    } else if (s.type === "dm") {
      const b = s.button;
      items.push({ kind: "dm", stepId: s.id, text: renderText(s.text, link, username), button: b ? { title: b.title, url: b.kind === "link" ? b.url || link : undefined, continues: b.kind === "continue" } : undefined });
      if (b?.kind === "continue" && !click(b.title)) return { items, waiting: true };
    } else {
      if (open && follows) { items.push({ kind: "note", text: "Conferiu: segue o perfil ✓" }); continue; }
      items.push({ kind: "dm", stepId: s.id, text: renderText(s.text, link, username), button: { title: s.button, continues: true } });
      if (!click(s.button)) return { items, waiting: true };
      while (!follows) {
        items.push({ kind: "note", text: "Conferiu: ainda não segue" });
        items.push({ kind: "dm", stepId: s.id, text: renderText(s.retryText, link, username), button: { title: s.retryButton, continues: true } });
        if (!click(s.retryButton)) return { items, waiting: true };
      }
      items.push({ kind: "note", text: "Conferiu: segue o perfil ✓" });
    }
  }
  items.push({ kind: "end" });
  return { items, waiting: false };
}
