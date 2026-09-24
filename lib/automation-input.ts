import type { Rule } from "@/config/rules";
import { stepsOf, validateSteps, type Step } from "@/lib/flow";
import { postKey } from "@/lib/match";

/** Regras do formulário de automação. Sem dependências de servidor: roda também no navegador. */

export type AutomationInput = {
  id?: string;
  name: string;
  posts: string[];
  keywords: string[];
  link: string;
  steps: Step[];
  active: boolean;
};

export type Issue = { field: "name" | "posts" | "keywords" | "link" | "steps"; stepId?: string | null; message: string };

/** Limpa a entrada do formulário (espaços, duplicados, vazios). */
export function normalizeInput(i: AutomationInput): AutomationInput {
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  return {
    ...i,
    name: i.name.trim(),
    posts: uniq(i.posts),
    keywords: uniq(i.keywords.map((k) => k.toUpperCase())),
    link: i.link.trim(),
    steps: i.steps.map((s): Step => {
      if (s.type === "reply") return { ...s, replies: uniq(s.replies) };
      if (s.type === "dm") {
        const text = s.text.replace(/\r\n/g, "\n").trim();
        if (!s.button) return { id: s.id, type: "dm", text };
        const b = s.button.kind === "link"
          ? { kind: "link" as const, title: s.button.title.trim(), ...(s.button.url?.trim() ? { url: s.button.url.trim() } : {}) }
          : { kind: "continue" as const, title: s.button.title.trim() };
        return { id: s.id, type: "dm", text, button: b };
      }
      return { ...s, text: s.text.trim(), retryText: s.retryText.trim(), button: s.button.trim(), retryButton: s.retryButton.trim() };
    }),
  };
}

export function toInput(a: Rule): AutomationInput {
  return { id: a.id, name: a.name ?? a.id, posts: a.posts, keywords: a.keywords, link: a.link, steps: stepsOf(a), active: a.active !== false };
}

/**
 * Problemas que impedem salvar. Rascunho (inativa) só precisa de nome e de campos bem formados;
 * para ativar, tudo tem que estar preenchido.
 */
export function validateAutomation(i: AutomationInput, others: Pick<Rule, "id" | "name" | "posts" | "keywords" | "active">[] = []): Issue[] {
  const out: Issue[] = [];
  const publish = i.active;
  if (!i.name) out.push({ field: "name", message: "Dê um nome para a automação." });

  if (publish && !i.posts.length) out.push({ field: "posts", message: "Escolha pelo menos um post, ou marque “qualquer post”." });
  for (const p of i.posts) {
    const k = postKey(p);
    if (k !== "*" && !/^[A-Za-z0-9_-]+$/.test(k)) out.push({ field: "posts", message: `Não reconheci o post “${p}”. Cole o link do post ou do Reels.` });
  }

  if (publish && !i.keywords.length) out.push({ field: "keywords", message: "Informe pelo menos uma palavra-chave." });
  for (const k of i.keywords) {
    if (/\s/.test(k)) out.push({ field: "keywords", message: `“${k}” tem espaço. Use uma palavra só por palavra-chave.` });
  }

  if (i.link && !/^https?:\/\/\S+$/.test(i.link)) out.push({ field: "link", message: "O link precisa começar com http:// ou https://." });
  if (publish) for (const s of validateSteps(i.steps, i.link)) out.push({ field: "steps", stepId: s.stepId, message: s.message });

  // Mesma palavra-chave em outra automação ativa para o mesmo post: só a primeira dispararia.
  if (publish) {
    const mine = new Set(i.posts.map(postKey));
    for (const o of others) {
      if (o.id === i.id || o.active === false) continue;
      const theirs = o.posts.map(postKey);
      const samePost = mine.has("*") || theirs.includes("*") || theirs.some((p) => mine.has(p));
      const kw = o.keywords.find((k) => i.keywords.includes(k.toUpperCase()));
      if (samePost && kw) out.push({ field: "keywords", message: `“${kw}” já está na automação ativa “${o.name ?? o.id}” para o mesmo post.` });
    }
  }
  return out;
}
