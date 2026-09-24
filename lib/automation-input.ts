import type { Rule } from "@/config/rules";
import { postKey } from "@/lib/match";

/** Regras do formulário de automação. Sem dependências de servidor: roda também no navegador. */

export const DM_MAX = 1000;
export const REPLY_MAX = 300;

export type AutomationInput = {
  id?: string;
  name: string;
  posts: string[];
  keywords: string[];
  link: string;
  dm: string;
  publicReplies: string[];
  active: boolean;
};

export type Issue = { field: "name" | "posts" | "keywords" | "link" | "dm" | "publicReplies"; message: string };

/** Limpa a entrada do formulário (espaços, duplicados, vazios). */
export function normalizeInput(i: AutomationInput): AutomationInput {
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  return {
    ...i,
    name: i.name.trim(),
    posts: uniq(i.posts),
    keywords: uniq(i.keywords.map((k) => k.toUpperCase())),
    link: i.link.trim(),
    dm: i.dm.replace(/\r\n/g, "\n").trim(),
    publicReplies: uniq(i.publicReplies),
  };
}

export function renderDm(r: Pick<Rule, "dm" | "link">, username?: string): string {
  return r.dm.replaceAll("{link}", r.link).replaceAll("{usuario}", username ? `@${username}` : "");
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
  if (publish && !i.dm) out.push({ field: "dm", message: "Escreva a mensagem que vai no direct." });
  if (publish && i.dm.includes("{link}") && !i.link) out.push({ field: "link", message: "A mensagem usa {link}, mas o link está vazio." });
  if (i.link && i.dm && !i.dm.includes("{link}")) out.push({ field: "dm", message: "Coloque {link} na mensagem onde o link deve aparecer." });
  if (renderDm(i, "usuario_exemplo").length > DM_MAX) out.push({ field: "dm", message: `A mensagem passa de ${DM_MAX} caracteres com o link.` });
  if (i.publicReplies.some((r) => r.length > REPLY_MAX)) out.push({ field: "publicReplies", message: `Cada resposta pública pode ter até ${REPLY_MAX} caracteres.` });

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
