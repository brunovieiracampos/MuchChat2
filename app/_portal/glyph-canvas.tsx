"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Fundo do portal inteiro: uma grade densa de caracteres do universo de IA, fixa atrás do conteúdo.
 * Perto do cursor os caracteres clareiam, crescem um pouco e se afastam (uma "lente"); a grade toda
 * acompanha o mouse em duas profundidades e rola mais devagar que a página.
 *
 * A grade é desenhada uma vez em duas imagens fora da tela; cada quadro só copia essas imagens e
 * redesenha os poucos caracteres dentro da lente. O laço para quando nada mais se move.
 * Sem cursor não há lente nem parallax do mouse; com "reduzir movimento" a grade fica parada.
 * É decorativo: não recebe cliques e não entra na leitura de tela.
 */

const SINGLE = "0011223456789<>/=+-*%{}[]()#@$_:|.".split("");
const WORDS = ["AI", "ML", "API", "LLM", "prompt", "data", "model", "agent", "token", "json", "ctx", "eval"];
const CW = 15, CH = 21;          // célula da grade
const PAD = 32;                  // sobra nas bordas, para o deslocamento não mostrar o fim da grade
const SHIFT = [5, 13];           // quanto cada profundidade acompanha o mouse, em pixels
const SCROLL = 0.22;             // fração da rolagem da página que a grade acompanha
const LENS = 210;                // raio da lente
const INK = "243, 239, 231", ACCENT = "255, 122, 69";

function hash(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

type Cell = { ch: string; alpha: number; layer: 0 | 1; accent: boolean };

/** Grade de `cols` × `rows`, sempre a mesma: os caracteres saem da posição, não de sorteio. */
function buildGrid(cols: number, rows: number): (Cell | null)[] {
  const cells: (Cell | null)[] = new Array(cols * rows).fill(null);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h = hash(c, r);
      if (h % 100 >= 66) continue; // cerca de dois terços das células têm caractere
      cells[r * cols + c] = {
        ch: SINGLE[(h >>> 8) % SINGLE.length],
        alpha: 0.04 + ((h >>> 16) % 100) / 100 * 0.085,
        layer: (h >>> 5) % 3 === 0 ? 1 : 0,
        accent: false,
      };
    }
    // Uma ou outra palavra por linha, letra a letra nas células, um pouco mais visível.
    const hr = hash(r, 9973);
    if (hr % 5 < 2) {
      const word = WORDS[(hr >>> 4) % WORDS.length];
      const start = (hr >>> 10) % Math.max(1, cols - word.length);
      for (let i = 0; i < word.length; i++) cells[r * cols + start + i] = { ch: word[i], alpha: 0.12, layer: 0, accent: false };
    }
    // Raros pontos laranja: a ligação com a identidade do portal.
    if (hr % 7 === 3) cells[r * cols + ((hr >>> 14) % cols)] = { ch: "•", alpha: 0.5, layer: 1, accent: true };
  }
  return cells;
}

export function GlyphCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const path = usePathname();
  // Na página de um material há texto longo por cima: a grade fica mais apagada.
  const intensity = /^\/m\/[^/]+\/[^/]+/.test(path) ? 0.6 : 1;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = !still && matchMedia("(hover: hover) and (pointer: fine)").matches;
    const root = document.querySelector(".dia-screen");
    const family = (root && getComputedStyle(root).getPropertyValue("--font-mono").trim()) || "ui-monospace, monospace";
    const font = (px: number) => `500 ${px}px ${family}`;

    let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, tileH = 0;
    let cells: (Cell | null)[] = [];
    const tiles = [document.createElement("canvas"), document.createElement("canvas")];

    const build = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      cols = Math.ceil((W + PAD * 2) / CW);
      rows = Math.ceil((H + PAD * 2) / CH);
      tileH = rows * CH;
      cells = buildGrid(cols, rows);
      for (const [layer, tile] of tiles.entries()) {
        tile.width = Math.round(cols * CW * dpr); tile.height = Math.round(tileH * dpr);
        const t = tile.getContext("2d")!;
        t.setTransform(dpr, 0, 0, dpr, 0, 0);
        t.font = font(12); t.textAlign = "center"; t.textBaseline = "middle";
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const cell = cells[r * cols + c];
          if (!cell || cell.layer !== layer) continue;
          t.fillStyle = `rgba(${cell.accent ? ACCENT : INK}, ${(cell.alpha * (cell.accent ? 1 : intensity)).toFixed(3)})`;
          t.fillText(cell.ch, c * CW + CW / 2, r * CH + CH / 2);
        }
      }
    };

    // Mouse na janela (-1 a 1 a partir do centro) e posição da lente: alvo e valor suavizado.
    const aim = { x: 0, y: 0 }, now = { x: 0, y: 0 };
    const lensAim = { x: -9999, y: -9999, on: 0 }, lens = { x: -9999, y: -9999, on: 0 };
    let frame = 0;

    const draw = () => {
      now.x += (aim.x - now.x) * 0.07; now.y += (aim.y - now.y) * 0.07;
      lens.x += (lensAim.x - lens.x) * 0.2; lens.y += (lensAim.y - lens.y) * 0.2;
      lens.on += (lensAim.on - lens.on) * 0.08;

      const scroll = still ? 0 : scrollY * SCROLL;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const origin = [0, 1].map((layer) => ({
        x: -PAD + now.x * SHIFT[layer],
        y: -PAD - (((scroll * (layer ? 1.25 : 1)) % tileH) + tileH) % tileH + now.y * SHIFT[layer],
      }));
      for (const [layer, o] of origin.entries()) {
        for (let y = o.y; y < H; y += tileH) ctx.drawImage(tiles[layer], o.x, y, cols * CW, tileH);
      }

      if (pointer && lens.on > 0.01) {
        // Apaga a grade parada dentro da lente (some no centro, intacta na borda)...
        const fade = ctx.createRadialGradient(lens.x, lens.y, 0, lens.x, lens.y, LENS);
        fade.addColorStop(0, `rgba(0,0,0,${lens.on})`); fade.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = fade;
        ctx.fillRect(lens.x - LENS, lens.y - LENS, LENS * 2, LENS * 2);
        ctx.globalCompositeOperation = "source-over";
        // ...e redesenha só esses caracteres: mais claros, maiores e empurrados para fora.
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (const [layer, o] of origin.entries()) {
          const c0 = Math.max(0, Math.floor((lens.x - LENS - o.x) / CW)), c1 = Math.min(cols - 1, Math.ceil((lens.x + LENS - o.x) / CW));
          const r0 = Math.floor((lens.y - LENS - o.y) / CH), r1 = Math.ceil((lens.y + LENS - o.y) / CH);
          for (let r = r0; r <= r1; r++) {
            const row = ((r % rows) + rows) % rows;
            for (let c = c0; c <= c1; c++) {
              const cell = cells[row * cols + c];
              if (!cell || cell.layer !== layer) continue;
              const x = o.x + c * CW + CW / 2, y = o.y + r * CH + CH / 2;
              const dx = x - lens.x, dy = y - lens.y, d = Math.hypot(dx, dy);
              if (d >= LENS) continue;
              const g = (1 - d / LENS) * lens.on;
              const base = cell.alpha * (cell.accent ? 1 : intensity);
              const push = d > 0.5 ? (16 * g * g) / d : 0;
              ctx.font = font(12 * (1 + 0.3 * g * g));
              ctx.fillStyle = `rgba(${cell.accent ? ACCENT : INK}, ${Math.min(0.95, base * g * (1 + 9 * g)).toFixed(3)})`;
              ctx.fillText(cell.ch, x + dx * push, y + dy * push);
            }
          }
        }
      }

      const moving = Math.abs(aim.x - now.x) + Math.abs(aim.y - now.y) > 0.0015
        || Math.abs(lensAim.x - lens.x) + Math.abs(lensAim.y - lens.y) > 0.3
        || Math.abs(lensAim.on - lens.on) > 0.01;
      frame = moving ? requestAnimationFrame(draw) : 0;
    };
    const kick = () => { if (!frame) frame = requestAnimationFrame(draw); };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      aim.x = (e.clientX / W) * 2 - 1; aim.y = (e.clientY / H) * 2 - 1;
      if (lensAim.on === 0) { lens.x = e.clientX; lens.y = e.clientY; }
      lensAim.x = e.clientX; lensAim.y = e.clientY; lensAim.on = 1;
      kick();
    };
    const onLeave = () => { lensAim.on = 0; kick(); };
    const onResize = () => { build(); kick(); };

    build();
    kick();
    // A fonte mono pode chegar depois do primeiro desenho: refaz a grade com ela.
    document.fonts?.ready.then(() => { build(); kick(); });
    addEventListener("resize", onResize);
    if (!still) addEventListener("scroll", kick, { passive: true });
    if (pointer) {
      addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
    }
    return () => {
      if (frame) cancelAnimationFrame(frame);
      removeEventListener("resize", onResize);
      removeEventListener("scroll", kick);
      removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [intensity]);

  return <canvas ref={ref} className="dia-field" aria-hidden="true" />;
}
