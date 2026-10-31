import localFont from "next/font/local";

/**
 * Fontes do portal de materiais (design/portal): serifa nos títulos, grotesca na leitura e mono nos rótulos e prompts.
 * Ficam fora do layout raiz para o painel não carregar o que não usa.
 * Arquivos em app/_fonts (subconjunto latino), como no layout raiz.
 */
const display = localFont({
  src: [{ path: "../_fonts/instrument-serif-normal.woff2", weight: "400", style: "normal" }, { path: "../_fonts/instrument-serif-italic.woff2", weight: "400", style: "italic" }],
  variable: "--dia-font-display", display: "swap",
});
const sans = localFont({
  src: [{ path: "../_fonts/hanken-grotesk-normal.woff2", weight: "400 700", style: "normal" }, { path: "../_fonts/hanken-grotesk-italic.woff2", weight: "400 700", style: "italic" }],
  variable: "--dia-font-sans", display: "swap",
});
const mono = localFont({ src: "../_fonts/jetbrains-mono-normal.woff2", weight: "400 600", variable: "--dia-font-mono", display: "swap" });

/** Classes que definem as variáveis das fontes: vão no mesmo elemento que `.dia-screen`. */
export const portalFonts = `${display.variable} ${sans.variable} ${mono.variable}`;

/** Classes da raiz de qualquer tela do portal. */
export const portalRoot = `dia-screen dia-grain ${portalFonts}`;
