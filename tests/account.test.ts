import { describe, expect, it } from "vitest";
import { authError, isOwner, safeNext } from "@/lib/account";

describe("contas", () => {
  it("só redireciona para caminhos internos", () => {
    expect(safeNext("/painel/metricas?periodo=30")).toBe("/painel/metricas?periodo=30");
    expect(safeNext("https://malicioso.com")).toBe("/painel");
    expect(safeNext("//malicioso.com")).toBe("/painel");
    expect(safeNext("/\\malicioso.com")).toBe("/painel");
    expect(safeNext(null)).toBe("/painel");
  });

  it("traduz os erros do Supabase Auth", () => {
    expect(authError({ code: "invalid_credentials" })).toBe("E-mail ou senha incorretos.");
    expect(authError({ message: "Email not confirmed" })).toMatch(/^Confirme seu e-mail/);
    expect(authError({ code: "over_email_send_rate_limit" })).toMatch(/Muitas tentativas/);
    expect(authError({ message: "algo inesperado" })).toMatch(/Não foi possível/);
  });

  it("só os e-mails da lista de donos abrem o painel", () => {
    const list = " bruno@exemplo.com, Outro@Exemplo.com ";
    expect(isOwner("bruno@exemplo.com", list)).toBe(true);
    expect(isOwner("OUTRO@exemplo.com", list)).toBe(true);
    expect(isOwner("estranho@exemplo.com", list)).toBe(false);
    expect(isOwner("bruno@exemplo.com", "")).toBe(false);
  });
});
