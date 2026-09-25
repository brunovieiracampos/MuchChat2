"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PASSWORD_MIN, authError, safeNext } from "@/lib/account";
import { baseUrl } from "@/lib/panel";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; sent?: string; values?: Record<string, string> };

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Endereço deste deploy (produção, preview ou local), para os links dos e-mails. */
async function origin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? baseUrl();
}

export async function signInAction(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email"), password = String(f.get("password") ?? "");
  if (!email || !password) return { error: "Preencha e-mail e senha.", values: { email } };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authError(error), values: { email } };
  redirect(safeNext(str(f, "next")));
}

export async function signUpAction(_: FormState, f: FormData): Promise<FormState> {
  const name = str(f, "name"), email = str(f, "email"), password = String(f.get("password") ?? "");
  const values = { name, email };
  if (!name) return { error: "Diga como podemos te chamar.", values };
  if (!email) return { error: "Informe seu e-mail.", values };
  if (password.length < PASSWORD_MIN) return { error: `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`, values };
  if (f.get("terms") !== "on") return { error: "Para criar a conta, aceite a política de privacidade.", values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name }, emailRedirectTo: `${await origin()}/auth/confirmar?next=/painel` },
  });
  if (error) return { error: authError(error), values };
  // Com confirmação de e-mail desligada no Supabase, a sessão já vem pronta.
  if (data.session) redirect("/painel");
  // E-mail já cadastrado: o Supabase não diz (para não revelar contas) e devolve um usuário sem identidades.
  return { sent: email };
}

export async function forgotPasswordAction(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email");
  if (!email) return { error: "Informe o e-mail da sua conta." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/confirmar?next=/redefinir-senha`,
  });
  // Só mostra erro de limite de envio; para o resto, a resposta é a mesma exista ou não a conta.
  if (error && /rate/i.test(`${error.code} ${error.message}`)) return { error: authError(error), values: { email } };
  return { sent: email };
}

export async function resetPasswordAction(_: FormState, f: FormData): Promise<FormState> {
  const password = String(f.get("password") ?? ""), confirm = String(f.get("confirm") ?? "");
  if (password.length < PASSWORD_MIN) return { error: `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.` };
  if (password !== confirm) return { error: "As duas senhas não são iguais." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "O link de redefinição expirou. Peça um novo em “Esqueci minha senha”." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authError(error) };
  redirect("/painel");
}

export async function resendConfirmationAction(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email");
  if (!email) return { error: "Informe o e-mail." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${await origin()}/auth/confirmar?next=/painel` } });
  if (error) return { error: authError(error), values: { email } };
  return { sent: email };
}

export async function signOutAction(): Promise<void> {
  await (await createClient()).auth.signOut();
  redirect("/entrar");
}
