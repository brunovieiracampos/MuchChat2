/**
 * Regras de automação: post + palavra-chave → DM com link.
 *
 * posts: URLs dos posts (https://www.instagram.com/p/XXXX/), shortcodes (XXXX),
 *        media IDs numéricos, ou "*" para qualquer post.
 * keywords: palavras que disparam a regra (sem diferença de maiúsculas/acentos;
 *           precisa ser a palavra inteira: "contador" casa, "contadores" não).
 * dm: texto da DM. Use {link} onde o link deve entrar. Máx. 1000 caracteres.
 * publicReplies: opcional; se omitido, usa DEFAULT_PUBLIC_REPLIES.
 */
export type Rule = {
  id: string;
  posts: string[];
  keywords: string[];
  link: string;
  dm: string;
  publicReplies?: string[];
  active?: boolean;
};

export const DEFAULT_PUBLIC_REPLIES = [
  "Te mandei no direct! 📩",
  "Enviado! Confere seu direct 😉",
  "Já está no seu direct 🚀",
  "Mandei lá no DM, aproveita!",
  "Chegou no seu direct, corre lá 👀",
  "Pronto! Olha sua caixa de mensagens 📬",
  "Te enviei por mensagem ✅",
  "Tá no seu direct! Depois me conta 😄",
];

export const RULES: Rule[] = [
  {
    id: "contador-2026-09-24",
    // TODO: troque "*" pela URL do carrossel CONTADOR assim que tiver
    // (ex.: "https://www.instagram.com/p/ABC123xyz/"). Com "*", vale para qualquer post.
    posts: ["*"],
    keywords: ["CONTADOR"],
    link: "https://wandering-diver-d89.notion.site/2-prompts-para-o-contador-extrato-em-PDF-vira-tabela-e-mensagem-para-o-cliente-3e51c005a89c809babd0dd2d1f18c24f",
    dm:
      "Oi! Aqui estão os 2 prompts para o contador 👇\n\n" +
      "1) Extrato em PDF vira tabela\n" +
      "2) Mensagem pronta para o cliente\n\n" +
      "{link}\n\n" +
      "Se usar, me conta como foi 😉",
  },
];
