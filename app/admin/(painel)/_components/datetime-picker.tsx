"use client";

import { useEffect, useRef, useState } from "react";
import { ICONS } from "./icons";
import { Icon } from "./ui";

/**
 * Seletor de data e hora no visual do painel (substitui o datetime-local do navegador).
 * Valor no formato do datetime-local ("AAAA-MM-DDTHH:MM", horário do computador).
 * Dias e horários antes de `min` (ms) ficam desabilitados.
 */

const WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (v: string) => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  return m ? { day: `${m[1]}-${m[2]}-${m[3]}`, h: Number(m[4]), min: Number(m[5]) } : null;
};
const msOf = (day: string, h: number, min: number) => { const [y, mo, d] = day.split("-").map(Number); return new Date(y, mo - 1, d, h, min).getTime(); };

function label(v: string): string {
  const p = parse(v);
  if (!p) return "Escolher data e hora";
  const [y, mo, d] = p.day.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const day = keyOf(date) === keyOf(today) ? "Hoje" : keyOf(date) === keyOf(tomorrow) ? "Amanhã"
    : date.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short", ...(y !== today.getFullYear() ? { year: "numeric" } : {}) });
  return `${day} às ${pad(p.h)}:${pad(p.min)}`;
}

export function DateTimePicker({ id, value, onChange, min }: { id?: string; value: string; onChange: (v: string) => void; min: number }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const p = parse(value);
  const [view, setView] = useState(() => { const d = p ? new Date(`${p.day}T12:00`) : new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [open]);

  // Ao abrir, volta o mês para a data escolhida e rola as colunas até a hora e o minuto escolhidos.
  useEffect(() => {
    if (!open) return;
    // Abre para cima quando não cabe embaixo do campo.
    const r = wrap.current?.getBoundingClientRect();
    if (r) setUp(window.innerHeight - r.bottom < 400 && r.top > 400);
    if (p) { const [y, m] = p.day.split("-").map(Number); setView({ y, m: m - 1 }); }
    requestAnimationFrame(() => wrap.current?.querySelectorAll<HTMLElement>(".dtp-col .is-on").forEach((el) => el.scrollIntoView({ block: "center" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const day = p?.day ?? keyOf(new Date(min));
  const h = p?.h ?? 12, minute = p?.min ?? 0;
  const set = (d: string, hh: number, mm: number) => {
    // Se o horário escolhido já passou naquele dia, sobe para o primeiro horário possível.
    if (msOf(d, hh, mm) < min) {
      const m = new Date(Math.ceil(min / 300e3) * 300e3);
      if (keyOf(m) === d) { hh = m.getHours(); mm = m.getMinutes(); }
    }
    onChange(`${d}T${pad(hh)}:${pad(mm)}`);
  };

  const first = new Date(view.y, view.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((offset + new Date(view.y, view.m + 1, 0).getDate()) / 7) * 7 }, (_, i) => new Date(view.y, view.m, 1 - offset + i));
  const minDay = keyOf(new Date(min));
  const todayKey = keyOf(new Date());
  const canPrev = new Date(view.y, view.m, 1) > new Date(new Date(min).getFullYear(), new Date(min).getMonth(), 1);
  const shift = (n: number) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const minutes = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort((a, b) => a - b);
  const tomorrow9 = (() => { const t = new Date(); t.setDate(t.getDate() + 1); return keyOf(t); })();

  return (
    <div className="dtp" ref={wrap}>
      <button id={id} type="button" className="pn-input dtp-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon d={ICONS.calendar} size={15} />
        <span>{label(value)}</span>
      </button>
      {open && (
        <div className={`dtp-pop${up ? " is-up" : ""}`} role="dialog" aria-label="Escolher data e hora">
          <div className="dtp-cal">
            <div className="dtp-head">
              <button type="button" className="dtp-nav" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Mês anterior">‹</button>
              <span className="dtp-month">{MONTHS[view.m][0].toUpperCase() + MONTHS[view.m].slice(1)} de {view.y}</span>
              <button type="button" className="dtp-nav" onClick={() => shift(1)} aria-label="Próximo mês">›</button>
            </div>
            <div className="dtp-grid" role="grid">
              {WEEK.map((w) => <span key={w} className="dtp-wd">{w[0]}</span>)}
              {cells.map((d) => {
                const k = keyOf(d);
                const past = k < minDay;
                const out = d.getMonth() !== view.m;
                return (
                  <button key={k} type="button" disabled={past}
                    className={`dtp-day${out ? " is-out" : ""}${k === day ? " is-on" : ""}${k === todayKey ? " is-today" : ""}`}
                    aria-pressed={k === day} aria-label={d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                    onClick={() => set(k, h, minute)}>
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="dtp-quick">
              <button type="button" className="pn-btn is-ghost" onClick={() => set(todayKey, h, minute)}>Hoje</button>
              <button type="button" className="pn-btn is-ghost" onClick={() => set(tomorrow9, 9, 0)}>Amanhã às 9h</button>
            </div>
          </div>
          <div className="dtp-time">
            <div className="dtp-col" role="listbox" aria-label="Hora">
              {HOURS.map((hh) => {
                const past = msOf(day, hh, 59) < min;
                return <button key={hh} type="button" role="option" aria-selected={hh === h} disabled={past} className={hh === h ? "is-on" : ""} onClick={() => set(day, hh, minute)}>{pad(hh)}</button>;
              })}
            </div>
            <div className="dtp-col" role="listbox" aria-label="Minuto">
              {minutes.map((mm) => {
                const past = msOf(day, h, mm) < min;
                return <button key={mm} type="button" role="option" aria-selected={mm === minute} disabled={past} className={mm === minute ? "is-on" : ""} onClick={() => set(day, h, mm)}>{pad(mm)}</button>;
              })}
            </div>
            <button type="button" className="pn-btn is-primary dtp-done" onClick={() => setOpen(false)}>Pronto</button>
          </div>
        </div>
      )}
    </div>
  );
}
