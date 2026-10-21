import { describe, expect, it } from "vitest";
import { authError, safeNext } from "@/lib/account";

describe("contas", () => {
  it("só redireciona para caminhos internos", () => {
    expect(safeNext("/admin/metricas?periodo=30")).toBe("/admin/metricas?periodo=30");
    expect(safeNext("https://malicioso.com")).toBe("/admin");
    expect(safeNext("//malicioso.com")).toBe("/admin");
    expect(safeNext("/\\malicioso.com")).toBe("/admin");
    expect(safeNext(null)).toBe("/admin");
    expect(safeNext("/\t/malicioso.com")).toBe("/admin");
    expect(safeNext("/%09/malicioso.com")).toBe("/%09/malicioso.com");
    expect(safeNext("/\n/malicioso.com")).toBe("/admin");
    expect(safeNext("/painel\\..\\x")).toBe("/admin");
  });

  it("traduz os erros do Supabase Auth", () => {
    expect(authError({ code: "invalid_credentials" })).toBe("E-mail ou senha incorretos.");
    expect(authError({ message: "Email not confirmed" })).toMatch(/^Confirme seu e-mail/);
    expect(authError({ code: "over_email_send_rate_limit" })).toMatch(/Muitas tentativas/);
    expect(authError({ message: "algo inesperado" })).toMatch(/Não foi possível/);
  });
});
