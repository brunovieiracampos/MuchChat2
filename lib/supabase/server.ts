import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Cliente do Supabase com a sessão do usuário (cookies): respeita o RLS.
 * Crie um por requisição; em Server Components a escrita de cookies é ignorada
 * (o proxy.ts já renova a sessão antes da página renderizar).
 */
export async function createClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Component: não pode escrever cookies; o proxy cuida disso.
        }
      },
    },
  });
}

/**
 * Cliente com a chave de serviço: ignora o RLS. Só para o que roda sem usuário logado
 * (webhook da Meta, varredura, tarefas de manutenção). Nunca importe em código de cliente.
 */
export function createAdminClient() {
  return createSupabaseClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
