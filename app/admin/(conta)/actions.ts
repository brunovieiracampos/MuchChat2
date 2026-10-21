"use server";

import { redirect } from "next/navigation";
import { authError, safeNext } from "@/lib/account";
import { RATE_MESSAGE, allow } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; values?: Record<string, string> };

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function signInAction(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email"), password = String(f.get("password") ?? "");
  if (!email || !password) return { error: "Preencha e-mail e senha.", values: { email } };
  if (!(await allow("signIn", email))) return { error: RATE_MESSAGE, values: { email } };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authError(error), values: { email } };
  redirect(safeNext(str(f, "next")));
}

export async function signOutAction(): Promise<void> {
  await (await createClient()).auth.signOut();
  redirect("/admin/entrar");
}
