import type { ExecStatus } from "@/lib/activity";

const TZ = "America/Sao_Paulo";

export function relTime(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  return dateShort(ms);
}

export function dateShort(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
}

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function timeOnly(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function num(n: number): string {
  return n.toLocaleString("pt-BR");
}

export const EXEC_STATUS: Record<ExecStatus, { label: string; tone: "green" | "amber" | "violet" | "red" | "" }> = {
  concluida: { label: "Concluída", tone: "green" },
  andamento: { label: "Em andamento", tone: "violet" },
  falhou: { label: "Falhou", tone: "red" },
  simulacao: { label: "Simulação", tone: "amber" },
  expirada: { label: "Expirada", tone: "" },
};
