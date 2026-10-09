"use client";

import { useEffect } from "react";

/**
 * Parallax dos elementos marcados com `data-dia-depth` (os grupos de caracteres do hero e dos cartões).
 * Só em aparelho com cursor e sem "reduzir movimento": no celular a composição fica como está, com a animação
 * ambiente do CSS. O cursor é seguido com atraso (interpolação) e o laço para sozinho quando tudo assenta.
 * Só mexe em `transform`, então não desloca o layout nem bloqueia cliques.
 */
export function GlyphMotion() {
  useEffect(() => {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = [...document.querySelectorAll<HTMLElement>("[data-dia-depth]")];
    if (!els.length) return;
    const depth = els.map((el) => Number(el.dataset.diaDepth) || 0);
    let centers: { x: number; y: number }[] = [];
    const measure = () => {
      for (const el of els) el.style.transform = "";
      centers = els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 + scrollX, y: r.top + r.height / 2 + scrollY };
      });
    };
    measure();

    // Posição do cursor na janela, de -1 a 1 a partir do centro: o alvo e o valor suavizado.
    const target = { x: 0, y: 0 }, now = { x: 0, y: 0 };
    let frame = 0;
    const NEAR = 520; // distância, em pixels, até onde o cursor "puxa" mais um grupo

    const tick = () => {
      now.x += (target.x - now.x) * 0.07;
      now.y += (target.y - now.y) * 0.07;
      const cx = (now.x + 1) / 2 * innerWidth + scrollX, cy = (now.y + 1) / 2 * innerHeight + scrollY;
      for (let i = 0; i < els.length; i++) {
        const c = centers[i];
        const near = Math.max(0, 1 - Math.hypot(c.x - cx, c.y - cy) / NEAR);
        const k = depth[i] * (0.55 + 0.9 * near);
        els[i].style.transform = `translate3d(${(now.x * k).toFixed(2)}px, ${(now.y * k).toFixed(2)}px, 0)`;
      }
      frame = Math.abs(target.x - now.x) + Math.abs(target.y - now.y) > 0.0015 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / innerWidth) * 2 - 1;
      target.y = (e.clientY / innerHeight) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onResize = () => { measure(); if (!frame) frame = requestAnimationFrame(tick); };

    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("resize", onResize);
    return () => {
      removeEventListener("pointermove", onMove);
      removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
      for (const el of els) el.style.transform = "";
    };
  }, []);
  return null;
}
