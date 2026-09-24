/** Constantes e helpers sem "use client": podem ser usados em páginas do servidor e no navegador. */

/** Paths dos ícones do design (viewBox 24×24). */
export const ICONS = {
  dashboard: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  inbox: "M4 13h4l1.4 3h5.2L16 13h4M5 5h14l1.6 8H3.4z",
  automations: "M5 5h5v5H5zM14 14h5v5h-5zM10 7.5h4v9",
  contacts: "M12 11a3.4 3.4 0 100-6.8 3.4 3.4 0 000 6.8zM5 20c0-3.3 3.1-5.6 7-5.6s7 2.3 7 5.6",
  executions: "M12 7.5v4.8l3.6 2.1M12 3.2a8.8 8.8 0 100 17.6 8.8 8.8 0 000-17.6z",
  metrics: "M5 19V10M10 19V5M15 19v-7M20 19v-4",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM12 3.5v2.2M12 18.3v2.2M4.3 12h2.2M17.5 12h2.2M6.6 6.6l1.6 1.6M15.8 15.8l1.6 1.6M17.4 6.6L15.8 8.2M8.2 15.8L6.6 17.4",
  plus: "M12 5v14M5 12h14",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4.2-4.2",
  warn: "M12 9v5M12 17.5v.5M10.3 3.9L2.8 17a2 2 0 001.7 3h15a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  error: "M12 8v5M12 16.5v.5M12 3a9 9 0 100 18 9 9 0 000-18z",
  flask: "M10 3h4M12 3v7l5 8a2 2 0 01-1.7 3H8.7A2 2 0 017 18l5-8",
  chat: "M4 5h16v10H8l-4 4z",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 5v6h-6",
  logout: "M15 17l5-5-5-5M20 12H9M11 20H5a1 1 0 01-1-1V5a1 1 0 011-1h6",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
} as const;

export function initials(name: string): string {
  const clean = name.replace(/^@/, "").replace(/[._-]+/g, " ").trim();
  if (!clean || clean === "desconhecido") return "?";
  const parts = clean.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)).toUpperCase();
}
