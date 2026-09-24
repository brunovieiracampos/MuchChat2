"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { duplicateAutomationAction, setAutomationActiveAction } from "../../actions";
import { ConfirmModal, useToast } from "../../_components/ui";

export function DetailActions({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const setActive = (on: boolean) => start(async () => {
    const r = await setAutomationActiveAction(id, on);
    setAsk(false);
    if (!r.ok) return toast(r.issues?.[0]?.message ?? r.error ?? "Não foi possível alterar", "red");
    toast(on ? "Automação ativada" : "Automação pausada", on ? "green" : "amber");
    router.refresh();
  });
  const duplicate = () => start(async () => {
    const r = await duplicateAutomationAction(id);
    if (!r.ok) return toast(r.error ?? "Erro ao duplicar", "red");
    toast(`“${name}” duplicada como pausada`);
    router.push(`/painel/automacoes/${r.id}/editar`);
  });

  return (
    <div className="pn-row pn-spacer" style={{ gap: 8 }}>
      <Link href={`/painel/automacoes/${id}/editar`} className="pn-btn is-primary">Editar fluxo</Link>
      <button type="button" className="pn-btn" onClick={duplicate} disabled={pending}>Duplicar</button>
      {active
        ? <button type="button" className="pn-btn" onClick={() => setAsk(true)} disabled={pending}>Pausar</button>
        : <button type="button" className="pn-btn" onClick={() => setActive(true)} disabled={pending}>Ativar</button>}
      {ask && (
        <ConfirmModal title="Pausar esta automação?" confirmLabel="Pausar automação" tone="warn" busy={pending}
          body="Comentários novos com a palavra-chave deixam de ser respondidos até você reativar. Ao reativar, a varredura recupera os comentários dos últimos 7 dias."
          onConfirm={() => setActive(false)} onClose={() => setAsk(false)} />
      )}
    </div>
  );
}
