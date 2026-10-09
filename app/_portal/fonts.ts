import { Hanken_Grotesk, Instrument_Serif, JetBrains_Mono } from "next/font/google";

/**
 * Fontes do portal de materiais (design/portal): serifa nos títulos, grotesca na leitura e mono nos rótulos e prompts.
 * Ficam fora do layout raiz para o painel não carregar o que não usa.
 */
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--dia-font-display", display: "swap" });
const sans = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"], variable: "--dia-font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--dia-font-mono", display: "swap" });

/** Classes que definem as variáveis das fontes: vão no mesmo elemento que `.dia-screen`. */
export const portalFonts = `${display.variable} ${sans.variable} ${mono.variable}`;

/** Classes da raiz de qualquer tela do portal. */
export const portalRoot = `dia-screen dia-grain ${portalFonts}`;
