/** Regras das contas de usuário: mensagens de erro e redirecionamento seguro. */

/** Mensagens do Supabase Auth traduzidas para o que a pessoa precisa fazer. */
export function authError(e: { message?: string; code?: string } | null | undefined): string {
  const code = e?.code ?? "";
  const msg = (e?.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar. Procure a mensagem do Much Chat na sua caixa de entrada.";
  if (code === "user_already_exists" || msg.includes("already registered")) return "Já existe uma conta com este e-mail. Entre ou redefina a senha.";
  if (code === "weak_password" || msg.includes("password should")) return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
  if (code === "same_password") return "A nova senha precisa ser diferente da atual.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || msg.includes("rate limit")) return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if (code === "email_address_invalid" || msg.includes("invalid format")) return "Este e-mail não parece válido.";
  if (code === "otp_expired" || msg.includes("expired")) return "O link expirou. Peça um novo.";
  return "Não foi possível concluir agora. Tente de novo em instantes.";
}

/** Só aceita caminhos internos em ?next= (evita redirecionar para outro site). */
export function safeNext(next: string | null | undefined, fallback = "/painel"): string {
  // Valida o endereço como o navegador vai interpretar (ele ignora tab e quebra de linha, e trata "\\" como "/").
  if (!next || !next.startsWith("/") || /[\x00-\x1f\\]/.test(next)) return fallback;
  try {
    const u = new URL(next, "http://interno");
    return u.origin === "http://interno" ? u.pathname + u.search + u.hash : fallback;
  } catch {
    return fallback;
  }
}

export const PASSWORD_MIN = 8;

