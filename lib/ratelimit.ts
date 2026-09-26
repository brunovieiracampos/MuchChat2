import "server-only";
import { headers } from "next/headers";
import { baseStore } from "@/lib/store";

/**
 * Limite de tentativas das telas de conta (login, cadastro, senha).
 * O Supabase só enxerga o IP do servidor da Vercel, igual para todos; por isso o limite fica aqui,
 * por IP de quem acessa e por e-mail. Janela fixa, contador no Redis em rl:… (fora das contas).
 */

type Rule = { limit: number; windowSec: number };

export const LIMITS = {
  signIn: { ip: { limit: 30, windowSec: 600 }, email: { limit: 8, windowSec: 600 } },
  signUp: { ip: { limit: 6, windowSec: 3600 }, email: { limit: 3, windowSec: 3600 } },
  email: { ip: { limit: 10, windowSec: 3600 }, email: { limit: 3, windowSec: 3600 } },
} satisfies Record<string, { ip: Rule; email: Rule }>;

async function hit(key: string, r: Rule): Promise<boolean> {
  const store = baseStore();
  const window = Math.floor(Date.now() / 1000 / r.windowSec);
  const k = `rl:${key}:${window}`;
  await store.hincrby(k, "n", 1);
  await store.expire(k, r.windowSec + 5);
  return Number(await store.hget<number>(k, "n")) <= r.limit;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "desconhecido").trim();
}

/** true = pode seguir. Conta a tentativa por IP e (se houver) por e-mail. */
export async function allow(kind: keyof typeof LIMITS, email?: string): Promise<boolean> {
  const rules = LIMITS[kind];
  const okIp = await hit(`${kind}:ip:${await clientIp()}`, rules.ip);
  const okEmail = email ? await hit(`${kind}:email:${email.trim().toLowerCase()}`, rules.email) : true;
  return okIp && okEmail;
}

export const RATE_MESSAGE = "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
