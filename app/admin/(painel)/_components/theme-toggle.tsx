"use client";

import { useEffect, useState } from "react";
import { applyChoice, readChoice, type ThemeChoice } from "@/lib/theme";
import { ICONS } from "./icons";
import { Icon } from "./ui";

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeChoice, string> = { system: "Tema do sistema", light: "Tema claro", dark: "Tema escuro" };
const ICON: Record<ThemeChoice, string> = { system: ICONS.monitor, light: ICONS.sun, dark: ICONS.moon };

/** Alterna o tema: sistema, claro, escuro. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => setChoice(readChoice()), []);

  const next = NEXT[choice];
  return (
    <button
      type="button"
      className={`pn-theme-toggle ${className}`}
      onClick={() => { applyChoice(next); setChoice(next); }}
      title={`${LABEL[choice]}. Clique para ${LABEL[next].toLowerCase()}.`}
      aria-label={`${LABEL[choice]}. Trocar para ${LABEL[next].toLowerCase()}`}
    >
      <Icon d={ICON[choice]} size={16} width={1.7} />
    </button>
  );
}
