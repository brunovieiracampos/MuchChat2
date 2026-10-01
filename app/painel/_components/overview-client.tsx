"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { dayName, hourMinute, num } from "@/lib/format";
import type { CalItem } from "@/lib/overview";
import { KIND_LABEL, STATUS_META } from "@/lib/posts";
import { ICONS } from "./icons";
import { Badge, Icon } from "./ui";

/* ---------- colunas por dia (uma série) ---------- */

type Point = { day: string; label: string; value: number };

/**
 * Colunas de uma série só: barras finas com ponta arredondada, valor só no maior e no último ponto,
 * tooltip em cada coluna (mouse e teclado). Os valores também estão no aria-label.
 */
export function ColumnChart({ data, unit, weekly }: { data: Point[]; unit: [string, string]; weekly?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const maxIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const label = (d: Point) => `${weekly ? `Semana de ${d.label}` : d.label}: ${num(d.value)} ${d.value === 1 ? unit[0] : unit[1]}`;
  const empty = data.every((d) => d.value === 0);
  // Com muitas colunas, só parte das datas cabe embaixo; todas continuam no tooltip e no aria-label.
  const every = Math.max(1, Math.ceil(data.length / 8));
  return (
    <div className="ov-cols" role="img" aria-label={data.map(label).join(", ")}>
      {empty && <span className="ov-cols-empty">Nenhum comentário com palavra-chave no período</span>}
      {data.map((d, i) => {
        const shown = d.value > 0 && (i === maxIdx || i === data.length - 1);
        const h = d.value ? Math.max(3, (d.value / max) * 100) : 0;
        return (
          <div key={d.day} className={`ov-col${hover === i ? " is-hover" : ""}`} tabIndex={0}
            onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
            <div className="ov-col-plot">
              {shown && <span className="ov-col-val">{num(d.value)}</span>}
              <span className="ov-col-bar" style={{ height: `${h}%` }} />
              {hover === i && <span className="ov-tip" role="tooltip" style={{ bottom: `calc(${h}% + ${shown ? 26 : 8}px)` }}><b>{num(d.value)}</b> {d.value === 1 ? unit[0] : unit[1]}<br /><span>{weekly ? `Semana de ${d.label}` : d.label}</span></span>}
            </div>
            {(i % every === 0 || i === data.length - 1) && <span className="ov-col-label">{d.label}</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- status das automações (parte do todo) ---------- */

type Slice = { key: string; label: string; value: number; color: string; hint: string };

export function StatusBar({ slices }: { slices: Slice[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <div>
      <div className="ov-stack" role="img" aria-label={slices.map((s) => `${s.label}: ${s.value}`).join(", ")}>
        {total === 0 && <span className="ov-stack-empty" />}
        {slices.filter((s) => s.value > 0).map((s) => (
          <span key={s.key} className={`ov-stack-seg${hover === s.key ? " is-hover" : ""}`} tabIndex={0}
            style={{ flexGrow: s.value, background: s.color }}
            onPointerEnter={() => setHover(s.key)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(s.key)} onBlur={() => setHover(null)}>
            {hover === s.key && <span className="ov-tip" role="tooltip"><b>{s.value}</b> {s.label.toLowerCase()} ({pct(s.value)}%)<br /><span>{s.hint}</span></span>}
          </span>
        ))}
      </div>
      <ul className="ov-legend">
        {slices.map((s) => (
          <li key={s.key}>
            <span className="ov-swatch" style={{ background: s.color }} />
            <span className="ov-legend-label">{s.label}</span>
            <span className="ov-legend-value">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- calendário da semana ---------- */

type Day = { key: string; weekday: string; date: string; isToday: boolean };

const KIND: Record<CalItem["kind"], string> = { ...KIND_LABEL, video: "Vídeo", reel: "Reels" };

function statusOf(it: CalItem): { label: string; tone: string } {
  if (it.status === "instagram") return { label: "Publicado", tone: "green" };
  return STATUS_META[it.status];
}

const isLive = (it: CalItem) => it.status === "published" || it.status === "instagram";

/** Cartãozinho de uma publicação no calendário (miniatura, hora, tipo); abre o modal de detalhes. */
export function EventChip({ item: it, onOpen }: { item: CalItem; onOpen: (it: CalItem) => void }) {
  const s = statusOf(it);
  return (
    <button type="button" className={`ov-event is-${s.tone || "plain"}`} onClick={(e) => { e.stopPropagation(); onOpen(it); }}
      aria-label={`${KIND[it.kind]} ${s.label.toLowerCase()} às ${hourMinute(it.at)}. Ver detalhes`}>
      {it.thumb ? <img src={it.thumb} alt="" className="ov-event-thumb" /> : <span className="ov-event-thumb is-empty"><Icon d={ICONS.image} size={12} /></span>}
      <span className="ov-event-text">
        <span className="ov-event-time">{hourMinute(it.at)}</span>
        <span className="ov-event-kind">{KIND[it.kind]}</span>
      </span>
    </button>
  );
}

export function WeekCalendar({ days, items }: { days: Day[]; items: CalItem[] }) {
  const [open, setOpen] = useState<CalItem | null>(null);
  const close = useCallback(() => setOpen(null), []);
  return (
    <>
      <div className="ov-week">
        {days.map((d) => {
          const list = items.filter((it) => it.day === d.key);
          return (
            <div key={d.key} className={`ov-day${d.isToday ? " is-today" : ""}`}>
              <div className="ov-day-head">
                <span className="ov-day-name">{d.weekday}</span>
                <span className="ov-day-date">{d.date}</span>
              </div>
              <div className="ov-day-body">
                {list.map((it) => <EventChip key={it.id} item={it} onOpen={setOpen} />)}
              </div>
            </div>
          );
        })}
      </div>
      {open && <PostModal item={open} onClose={close} />}
    </>
  );
}

export function PostModal({ item, onClose }: { item: CalItem; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const s = statusOf(item);
  const live = isLive(item);
  const c = item.automation?.counts;
  return (
    <div className="pn-modal-wrap" onClick={onClose}>
      <div ref={ref} className="pn-modal ov-modal" role="dialog" aria-modal="true" aria-labelledby="ov-modal-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="pn-row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pn-row" style={{ gap: 8 }}>
              <Badge tone={s.tone}>{s.label}</Badge>
              <span className="pn-muted pn-small">{KIND[item.kind]}{item.mediaCount > 1 ? `, ${item.mediaCount} mídias` : ""}</span>
            </div>
            <div id="ov-modal-title" className="pn-modal-title" style={{ marginTop: 8 }}>
              {live ? "Publicado" : item.status === "failed" ? "Falhou" : "Programado"} {dayName(item.at).toLowerCase()} às {hourMinute(item.at)}
            </div>
          </div>
          <button type="button" className="pn-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className="ov-modal-body">
          {item.thumb && <img src={item.thumb} alt="" className="ov-modal-thumb" />}
          <p className="ov-modal-caption">{item.kind === "story" ? "Story" : item.caption || "Sem legenda"}</p>
        </div>

        {item.error && <div className="pn-alert is-red" style={{ marginTop: 14 }}><div className="pn-alert-body">{item.error}</div></div>}

        {live && (
          <div className="ov-modal-stats">
            <div><span className="ov-modal-num">{item.likes !== undefined ? num(item.likes) : "-"}</span><span>Curtidas</span></div>
            <div><span className="ov-modal-num">{item.comments !== undefined ? num(item.comments) : "-"}</span><span>Comentários</span></div>
            {c && <div><span className="ov-modal-num">{num(c.dm)}</span><span>DMs enviadas</span></div>}
            {c && <div><span className="ov-modal-num">{num(c.gained)}</span><span>Novos seguidores</span></div>}
          </div>
        )}

        {item.automation ? (
          <p className="pn-small" style={{ marginTop: 14, color: "var(--muted)" }}>
            {live ? "Automação ligada: " : "Automação que começa a responder quando o post sair: "}
            <Link href={`/painel/automacoes/${item.automation.id}`}>{item.automation.name}</Link>
            {live && c ? `. ${num(c.comment)} ${c.comment === 1 ? "comentário acionou" : "comentários acionaram"} o fluxo.` : "."}
          </p>
        ) : (
          <p className="pn-small" style={{ marginTop: 14, color: "var(--muted)" }}>Nenhuma automação ligada a este post.</p>
        )}

        <div className="pn-modal-actions">
          {item.permalink && <a href={item.permalink} target="_blank" rel="noreferrer" className="pn-btn">Ver no Instagram</a>}
          {item.source === "agendada" && <Link href={`/painel/publicacoes/${item.id}`} className="pn-btn is-primary">{live ? "Abrir publicação" : "Editar publicação"}</Link>}
        </div>
      </div>
    </div>
  );
}
