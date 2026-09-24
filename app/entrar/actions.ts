"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE, checkPassword, sessionToken } from "@/lib/session";

export async function loginAction(_: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const password = String(form.get("password") ?? "").trim();
  const token = sessionToken();
  if (!token) return { error: "ADMIN_SECRET não está configurado na Vercel." };
  if (!checkPassword(password)) return { error: "Senha incorreta." };
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE,
  });
  redirect("/painel");
}
