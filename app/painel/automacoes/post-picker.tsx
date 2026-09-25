"use client";

import { useEffect, useState, useTransition } from "react";
import { dateShort } from "@/lib/format";
import { postKey } from "@/lib/match";
import { listMediaAction } from "../actions";
import { ICONS } from "../_components/icons";
import { Icon, Toggle, useToast } from "../_components/ui";
import type { MediaOption } from "./builder-data";

const matches = (p: string, m: MediaOption) => { const k = postKey(p); return k === m.id || (!!m.shortcode && k === m.shortcode); };

export function PostPicker({ posts, onChange, media, mediaNext, connected, invalid }: {
  posts: string[];
  onChange: (posts: string[]) => void;
  media: MediaOption[];
  mediaNext?: string;
  connected: boolean;
  invalid?: boolean;
}) {
  const [all, setAll] = useState(false);
  const [url, setUrl] = useState("");
  const [known, setKnown] = useState<MediaOption[]>(media);
  const anyPost = posts.some((p) => postKey(p) === "*");
  const specific = posts.filter((p) => postKey(p) !== "*");
  const isSel = (m: MediaOption) => specific.some((p) => matches(p, m));
  const toggle = (m: MediaOption) => onChange(isSel(m) ? specific.filter((p) => !matches(p, m)) : [...specific, m.permalink ?? m.id]);
  const addUrl = () => { const v = url.trim(); if (v) onChange([...specific, v]); setUrl(""); };
  // Posts escolhidos fora dos 3 recentes aparecem como lista, com miniatura quando já carregada.
  const chosenElsewhere = specific.filter((p) => !media.slice(0, 3).some((m) => matches(p, m)));

  return (
    <div>
      <div className="pn-row" style={{ gap: 10, flexWrap: "nowrap", border: "1px solid #22222B", background: "var(--card)", borderRadius: 8, padding: "10px 11px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5 }}>Qualquer post ou Reels</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Inclui os posts que você publicar depois</div>
        </div>
        <Toggle on={anyPost} label="Qualquer post" onChange={() => onChange(anyPost ? [] : ["*"])} />
      </div>

      {!anyPost && (
        <>
          {connected ? (
            media.length ? (
              <>
                <div className="pn-post-grid" style={{ marginTop: 10, ...(invalid ? { outline: "1px solid var(--red-line)", borderRadius: 8 } : {}) }}>
                  {media.slice(0, 3).map((m) => <PostTile key={m.id} m={m} on={isSel(m)} onClick={() => toggle(m)} />)}
                </div>
                <button type="button" className="pn-btn is-sm" style={{ width: "100%", marginTop: 8 }} onClick={() => setAll(true)}>
                  Ver todos os posts
                </button>
              </>
            ) : <div className="pn-help">Nenhum post encontrado na conta.</div>
          ) : (
            <div className="pn-help">Conecte o Instagram para escolher entre os seus posts. Enquanto isso, cole o link do post abaixo.</div>
          )}

          {chosenElsewhere.map((p) => {
            const m = known.find((x) => matches(p, x));
            return (
              <div key={p} className="pn-row" style={{ gap: 8, flexWrap: "nowrap", marginTop: 8, fontSize: 12 }}>
                {m?.thumb
                  ? <img src={m.thumb} alt="" referrerPolicy="no-referrer" style={{ width: 28, height: 28, borderRadius: 5, objectFit: "cover", flex: "none" }} />
                  : <Icon d={ICONS.link} size={14} color="#8A8A99" />}
                <span className="pn-ellipsis" style={{ flex: 1, fontSize: 11.5 }}>{m?.caption || postKey(p)}</span>
                <button type="button" className="pn-btn is-sm" onClick={() => onChange(specific.filter((x) => x !== p))}>Remover</button>
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <input className="pn-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Ou cole o link do post / Reels"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} aria-label="Link do post" />
            <button type="button" className="pn-btn is-sm" onClick={addUrl}>Adicionar</button>
          </div>
        </>
      )}

      {all && (
        <AllPostsModal first={media} next={mediaNext} isSel={isSel} onToggle={toggle}
          onLoaded={(items) => setKnown((k) => [...k, ...items.filter((m) => !k.some((x) => x.id === m.id))])}
          count={specific.length} onClose={() => setAll(false)} />
      )}
    </div>
  );
}

function PostTile({ m, on, onClick, meta }: { m: MediaOption; on: boolean; onClick: () => void; meta?: boolean }) {
  return (
    <button type="button" className={`pn-post${on ? " is-on" : ""}`} onClick={onClick} aria-pressed={on} title={m.caption || m.shortcode}>
      {m.thumb && <img src={m.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      <span className="pn-post-cap" style={m.thumb ? undefined : { position: "static", background: "none" }}>
        {meta && m.timestamp ? `${dateShort(Date.parse(m.timestamp))}${typeof m.comments === "number" ? `, ${m.comments} ${m.comments === 1 ? "comentário" : "comentários"}` : ""}\n` : ""}
        {m.caption.slice(0, meta ? 60 : 40)}
      </span>
      {on && <span className="pn-post-check">✓</span>}
    </button>
  );
}

function AllPostsModal({ first, next: firstNext, isSel, onToggle, onLoaded, count, onClose }: {
  first: MediaOption[]; next?: string; isSel: (m: MediaOption) => boolean; onToggle: (m: MediaOption) => void;
  onLoaded: (items: MediaOption[]) => void; count: number; onClose: () => void;
}) {
  const [items, setItems] = useState(first);
  const [next, setNext] = useState(firstNext);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const more = () => start(async () => {
    const r = await listMediaAction(next);
    if (!r.ok) return toast(r.error ?? "Não foi possível carregar os posts", "red");
    setItems((xs) => [...xs, ...r.items]);
    setNext(r.next);
    onLoaded(r.items);
  });
  const needle = q.trim().toLowerCase();
  const shown = needle ? items.filter((m) => m.caption.toLowerCase().includes(needle)) : items;

  return (
    <div className="pn-modal-wrap" onClick={onClose}>
      <div className="pn-modal" role="dialog" aria-modal="true" aria-label="Escolher posts" onClick={(e) => e.stopPropagation()}
        style={{ width: 720, maxHeight: "86dvh", display: "flex", flexDirection: "column" }}>
        <div className="pn-row" style={{ flexWrap: "nowrap" }}>
          <div className="pn-modal-title">Escolher posts</div>
          <span className="pn-small pn-muted">{count ? `${count} selecionado${count > 1 ? "s" : ""}` : ""}</span>
          <button type="button" className="pn-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <input type="search" className="pn-input" style={{ marginTop: 12 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar pela legenda" aria-label="Filtrar posts" />
        <div style={{ overflow: "auto", marginTop: 12, flex: 1, minHeight: 0 }}>
          <div className="pn-post-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
            {shown.map((m) => <PostTile key={m.id} m={m} on={isSel(m)} onClick={() => onToggle(m)} meta />)}
          </div>
          {!shown.length && <div className="pn-table-empty">Nenhum post com esse texto na legenda{next ? " entre os carregados" : ""}.</div>}
          {next && (
            <button type="button" className="pn-btn" style={{ width: "100%", marginTop: 12 }} onClick={more} disabled={pending}>
              {pending ? "Carregando…" : "Carregar mais posts"}
            </button>
          )}
        </div>
        <div className="pn-modal-actions" style={{ marginTop: 14 }}>
          <button type="button" className="pn-btn is-primary" onClick={onClose}>Concluir</button>
        </div>
      </div>
    </div>
  );
}
