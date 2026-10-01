/** Tema claro/escuro. A escolha fica no navegador; "sistema" segue a preferência do aparelho. */

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "mc-theme";

/** Roda no <head> antes de pintar a página, para não piscar o tema errado. */
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_KEY}");var q=matchMedia("(prefers-color-scheme: light)");function a(){var t=c==="light"||c==="dark"?c:(q.matches?"light":"dark");document.documentElement.dataset.theme=t}a();q.addEventListener("change",function(){c=localStorage.getItem("${THEME_KEY}");a()})}catch(e){}})()`;

export function readChoice(): ThemeChoice {
  try {
    const c = localStorage.getItem(THEME_KEY);
    return c === "light" || c === "dark" ? c : "system";
  } catch {
    return "system";
  }
}

export function applyChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {}
  const light = choice === "light" || (choice === "system" && matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
}
