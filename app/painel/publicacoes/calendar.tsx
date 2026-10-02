"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { hourMinute } from "@/lib/format";
import type { CalDay, CalItem } from "@/lib/overview";
import { EventChip, PostModal } from "../_components/overview-client";

export type CalView = "mes" | "semana" | "periodo";

const TZ = "America/Sao_Paulo";
const WEEK_HEAD = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
/** Antecedência mínima para agendar (igual à validação do servidor, lib/posts.ts). */
const MIN_LEAD_MS = 2 * 60e3;

const pad = (n: number) => String(n).padStart(2, "0");
/** Instante (ms) de um dia e hora no horário de Brasília. */
const at = (key: string, hour: number, min = 0) => Date.parse(`${key}T${pad(hour)}:${pad(min)}:00-03:00`);
const hourOf = (ms: number) => Number(hourMinute(ms).slice(0, 2));

/**
 * Calendário de publicações: mês (padrão), semana por hora ou período livre em lista.
 * Clicar num dia ou horário futuro abre a nova publicação com a data preenchida.
 */
export function PostsCalendar({ view, days, items, canCreate }: { view: CalView; days: CalDay[]; items: CalItem[]; canCreate: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<CalItem | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60e3); return () => clearInterval(t); }, []);

  const byDay = new Map<string, CalItem[]>();
  for (const it of items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]);

  /** Próximo horário possível num dia: 12h, ou a próxima hora cheia se 12h já passou. null se o dia acabou. */
  const slotFor = (key: string): string | null => {
    if (at(key, 12) >= now + MIN_LEAD_MS) return `${key}T12:00`;
    for (let h = 13; h <= 23; h++) if (at(key, h) >= now + MIN_LEAD_MS) return `${key}T${pad(h)}:00`;
    return null;
  };
  const create = (quando: string | null) => { if (canCreate && quando) router.push(`/painel/publicacoes/nova?quando=${quando}`); };

  return (
    <>
      {view === "mes" && <MonthView days={days} byDay={byDay} slotFor={canCreate ? slotFor : () => null} onCreate={create} onOpen={setOpen} />}
      {view === "semana" && <WeekView days={days} byDay={byDay} now={now} canCreate={canCreate} onCreate={create} onOpen={setOpen} />}
      {view === "periodo" && <AgendaView days={days} byDay={byDay} onOpen={setOpen} />}
      {open && <PostModal item={open} onClose={close} />}
    </>
  );
}

type ViewProps = { days: CalDay[]; byDay: Map<string, CalItem[]>; onOpen: (it: CalItem) => void };

function MonthView({ days, byDay, slotFor, onCreate, onOpen }: ViewProps & { slotFor: (key: string) => string | null; onCreate: (q: string | null) => void }) {
  return (
    <div className="pc-month" role="grid" aria-label="Calendário do mês">
      {WEEK_HEAD.map((w) => <div key={w} className="pc-head" role="columnheader">{w}</div>)}
      {days.map((d) => {
        const slot = slotFor(d.key);
        const list = byDay.get(d.key) ?? [];
        return (
          <div key={d.key} role="gridcell"
            className={`pc-cell${d.inMonth === false ? " is-out" : ""}${d.isToday ? " is-today" : ""}${slot ? " is-open" : ""}`}
            onClick={slot ? () => onCreate(slot) : undefined}
            onKeyDown={slot ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onCreate(slot); } } : undefined}
            tabIndex={slot ? 0 : -1}
            aria-label={slot ? `${d.weekday}, ${d.date}: nova publicação` : `${d.weekday}, ${d.date}`}>
            <div className="pc-cell-head">
              <span className="pc-date">{Number(d.key.slice(8))}</span>
              {slot && <span className="pc-add" aria-hidden>+ Nova</span>}
            </div>
            <div className="pc-events">{list.map((it) => <EventChip key={it.id} item={it} onOpen={onOpen} />)}</div>
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ days, byDay, now, canCreate, onCreate, onOpen }: ViewProps & { now: number; canCreate: boolean; onCreate: (q: string | null) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  // Abre a grade perto das 7h; os horários da madrugada continuam acessíveis rolando para cima.
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 7 * 52; }, []);
  return (
    <div className="pc-week">
      <div className="pc-week-head">
        <span />
        {days.map((d) => (
          <div key={d.key} className={`pc-week-day${d.isToday ? " is-today" : ""}`}>
            <span>{d.weekday}</span><b>{Number(d.key.slice(8))}</b>
          </div>
        ))}
      </div>
      <div className="pc-week-body" ref={scroller}>
        {HOURS.map((h) => (
          <div key={h} className="pc-week-row">
            <span className="pc-hour">{pad(h)}h</span>
            {days.map((d) => {
              const free = canCreate && at(d.key, h) >= now + MIN_LEAD_MS;
              const list = (byDay.get(d.key) ?? []).filter((it) => hourOf(it.at) === h);
              const q = `${d.key}T${pad(h)}:00`;
              return (
                <div key={d.key} className={`pc-slot${free ? " is-open" : ""}${d.isToday ? " is-today" : ""}`}
                  onClick={free ? () => onCreate(q) : undefined}
                  onKeyDown={free ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onCreate(q); } } : undefined}
                  tabIndex={free ? 0 : -1} aria-label={free ? `${d.weekday} ${d.date} às ${pad(h)}h: nova publicação` : undefined}>
                  {list.map((it) => <EventChip key={it.id} item={it} onOpen={onOpen} />)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgendaView({ days, byDay, onOpen }: ViewProps) {
  const withItems = days.filter((d) => byDay.has(d.key));
  if (!withItems.length) return <p className="pn-small pn-muted" style={{ marginTop: 14 }}>Nenhuma publicação neste período.</p>;
  const label = (key: string) => { const s = new Date(`${key}T12:00:00-03:00`).toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }); return s[0].toUpperCase() + s.slice(1); };
  return (
    <div className="pc-agenda">
      {withItems.map((d) => (
        <section key={d.key} className={`pc-agenda-day${d.isToday ? " is-today" : ""}`}>
          <h3 className="pc-agenda-title">{label(d.key)}</h3>
          <div className="pc-agenda-list">{byDay.get(d.key)!.map((it) => <EventChip key={it.id} item={it} onOpen={onOpen} />)}</div>
        </section>
      ))}
    </div>
  );
}

/* ---------- barra + filtro de status (no navegador, sem ir ao servidor) ---------- */

export type StatusFilter = "todos" | "publicados" | "agendados";
const STATUS_FILTERS: [StatusFilter, string][] = [["todos", "Todos"], ["publicados", "Publicados"], ["agendados", "Agendados"]];
const PUBLISHED = new Set(["published", "instagram"]);
const UPCOMING = new Set(["scheduled", "preparing", "publishing"]);
const VIEWS: [CalView, string][] = [["mes", "Mês"], ["semana", "Semana"], ["periodo", "Período"]];

/** Acrescenta (ou tira) o status da URL; "todos" é o padrão e não aparece. */
function withStatus(href: string, status: StatusFilter): string {
  const [path, qs = ""] = href.split("?");
  const s = new URLSearchParams(qs);
  if (status === "todos") s.delete("status"); else s.set("status", status);
  const q = s.toString();
  return q ? `${path}?${q}` : path;
}

/**
 * Calendário com a barra de navegação. O servidor entrega todas as publicações do intervalo com o status de cada
 * uma; o filtro de status só esconde e mostra no navegador e grava a escolha na URL (sem recarregar a página).
 * Trocar de mês, semana ou vista ainda busca no servidor, porque muda o intervalo de datas.
 */
export function CalendarPanel({ view, title, links, period, days, items, canCreate, initialStatus, children }: {
  view: CalView; title: string;
  links: { prev?: string; next?: string; today?: string; views: Record<CalView, string> };
  period?: { from: string; to: string };
  days: CalDay[]; items: CalItem[]; canCreate: boolean; initialStatus: StatusFilter;
  /** Conteúdo que só aparece em "Todos" (lista de rascunhos). */
  children?: React.ReactNode;
}) {
  const [status, setStatus] = useState(initialStatus);
  const pick = (s: StatusFilter) => {
    setStatus(s);
    window.history.replaceState(null, "", withStatus(window.location.pathname + window.location.search, s));
  };
  const shown = status === "todos" ? items : items.filter((it) => (status === "publicados" ? PUBLISHED.has(it.status) : UPCOMING.has(it.status)));
  const link = (href: string) => withStatus(href, status);

  return (
    <>
      <section className="pn-card pc-card">
        <div className="pc-toolbar">
          <div className="pc-nav">
            {links.prev && <Link href={link(links.prev)} className="pn-btn is-sm" scroll={false} aria-label={view === "mes" ? "Mês anterior" : "Semana anterior"}>‹</Link>}
            {links.next && <Link href={link(links.next)} className="pn-btn is-sm" scroll={false} aria-label={view === "mes" ? "Próximo mês" : "Próxima semana"}>›</Link>}
            {links.today && <Link href={link(links.today)} className="pn-btn is-sm" scroll={false}>Hoje</Link>}
            <h2 className="pc-title">{title}</h2>
          </div>
          <div className="pc-filters">
            <div className="pn-seg" role="tablist" aria-label="Status">
              {STATUS_FILTERS.map(([v, label]) => (
                <button key={v} type="button" role="tab" aria-selected={status === v} className={status === v ? "is-on" : ""} onClick={() => pick(v)}>{label}</button>
              ))}
            </div>
            <div className="pn-seg" role="tablist" aria-label="Visualização">
              {VIEWS.map(([v, label]) => (
                <Link key={v} href={link(links.views[v])} role="tab" aria-selected={view === v} className={view === v ? "is-on" : ""} scroll={false}>{label}</Link>
              ))}
            </div>
          </div>
        </div>

        {period && (
          <form className="pc-range" action="/painel/publicacoes">
            <input type="hidden" name="vista" value="periodo" />
            {status !== "todos" && <input type="hidden" name="status" value={status} />}
            <label className="pn-field-label" htmlFor="pc-de">De<input id="pc-de" name="de" type="date" className="pn-input" defaultValue={period.from} required /></label>
            <label className="pn-field-label" htmlFor="pc-ate">Até<input id="pc-ate" name="ate" type="date" className="pn-input" defaultValue={period.to} required /></label>
            <button type="submit" className="pn-btn">Mostrar</button>
            <span className="pn-help">Até 93 dias.</span>
          </form>
        )}

        <PostsCalendar view={view} days={days} items={shown} canCreate={canCreate} />
      </section>
      {status === "todos" && children}
    </>
  );
}
