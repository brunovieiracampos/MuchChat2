"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { relTime } from "@/lib/format";
import type { MaterialStatus, MaterialVisibility } from "@/lib/material";
import { setMaterialStatusAction } from "./actions";
import { Badge, Icon, Toggle, useToast } from "../_components/ui";
import { ICONS } from "../_components/icons";

export type MaterialRow = {
  id: string; title: string; slug: string; visibility: MaterialVisibility; status: MaterialStatus; blocks: number; updatedAt: number;
};

const FILTERS = ["Todos", "Publicados", "Rascunhos"] as const;
const COLS = "minmax(0,2.4fr) 110px 110px 130px 190px";
const NARROW = "minmax(150px,1fr) 100px 110px";

export function MaterialList({ rows, username }: { rows: MaterialRow[]; username: string | null }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Todos");
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const list = rows.filter((r) => (filter === "Publicados" ? r.status === "published" : filter === "Rascunhos" ? r.status === "draft" : true));

  const toggle = (r: MaterialRow) => {
    const publish = r.status !== "published";
    setBusy(r.id);
    start(async () => {
      let res;
      try { res = await setMaterialStatusAction(r.id, publish ? "published" : "draft"); } catch {
        return toast("Não foi possível alterar", "red");
      } finally { setBusy(null); }
      if (!res.ok) return toast(res.issues?.[0]?.message ?? res.error ?? "Não foi possível alterar", "red");
      toast(publish ? `“${r.title}” publicado` : `“${r.title}” voltou para rascunho`, publish ? "green" : "amber");
      router.refresh();
    });
  };

  return (
    <div className="pn-page">
      <div className="pn-row">
        <div className="pn-row" style={{ gap: 6 }}>
          {FILTERS.map((f) => (
            <button key={f} type="button" className={`pn-chip${filter === f ? " is-on" : ""}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>{f}</button>
          ))}
        </div>
        <div className="pn-row pn-spacer" style={{ gap: 8 }}>
          {username && <a href={`/m/${username}`} target="_blank" rel="noopener noreferrer" className="pn-btn">Ver o portal</a>}
          <Link href="/painel/materiais/novo" className="pn-btn is-primary"><Icon d={ICONS.plus} size={14} width={2} />Criar material</Link>
        </div>
      </div>

      <div className="pn-card is-flush">
        <div className="pn-thead" data-narrow style={{ gridTemplateColumns: COLS, ["--narrow" as string]: NARROW }}>
          <div>Material</div>
          <div>Status</div>
          <div className="pn-wide-only">Acesso</div>
          <div className="pn-wide-only">Última alteração</div>
          <div style={{ textAlign: "right" }}>Ações</div>
        </div>
        {list.map((r) => (
          <div key={r.id} className="pn-trow" data-narrow style={{ gridTemplateColumns: COLS, ["--narrow" as string]: NARROW }}>
            <div style={{ minWidth: 0 }}>
              <Link href={`/painel/materiais/${r.id}`} style={{ color: "var(--text)", fontSize: 13.5, fontWeight: 500 }}>{r.title}</Link>
              <div className="pn-cell-sub pn-ellipsis">/{r.slug} · {r.blocks} bloco{r.blocks === 1 ? "" : "s"}</div>
            </div>
            <div><Badge tone={r.status === "published" ? "green" : ""}>{r.status === "published" ? "Publicado" : "Rascunho"}</Badge></div>
            <div className="pn-wide-only" style={{ fontSize: 12.5, color: "var(--text-3)" }}>{r.visibility === "public" ? "Público" : "Exclusivo"}</div>
            <div className="pn-wide-only" style={{ fontSize: 12.5, color: "var(--muted)" }}>{relTime(r.updatedAt)}</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
              {username && r.status === "published" && (
                <a href={`/m/${username}/${r.slug}`} target="_blank" rel="noopener noreferrer" className="pn-btn is-sm pn-wide-only">Abrir</a>
              )}
              <Link href={`/painel/materiais/${r.id}`} className="pn-btn is-sm">Editar</Link>
              <Toggle on={r.status === "published"} disabled={busy === r.id}
                label={r.status === "published" ? `Voltar ${r.title} para rascunho` : `Publicar ${r.title}`} onChange={() => toggle(r)} />
            </div>
          </div>
        ))}
        {!list.length && (
          <div className="pn-table-empty">
            {rows.length ? "Nenhum material com esse filtro" : <>Nenhum material ainda. <Link href="/painel/materiais/novo">Criar o primeiro</Link></>}
          </div>
        )}
      </div>
    </div>
  );
}
