"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelPostAction, deletePostAction } from "../actions";
import { ConfirmModal, useToast } from "../../_components/ui";

/** Cancelar agendamento e excluir, com confirmação. */
export function PostActions({ id, canCancel, canDelete, published }: { id: string; canCancel: boolean; canDelete: boolean; published: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [ask, setAsk] = useState<"cancel" | "delete" | null>(null);
  const [pending, start] = useTransition();
  const run = (what: "cancel" | "delete") => start(async () => {
    const r = what === "cancel" ? await cancelPostAction(id) : await deletePostAction(id);
    setAsk(null);
    if (!r.ok) return toast(r.issues?.[0]?.message ?? r.error ?? "Não foi possível concluir", "red");
    toast(what === "cancel" ? "Agendamento cancelado; ficou como rascunho" : "Publicação excluída", "amber");
    if (what === "delete") router.push("/painel/publicacoes");
    router.refresh();
  });
  return (
    <>
      {canCancel && <button type="button" className="pn-btn is-sm" onClick={() => setAsk("cancel")}>Cancelar agendamento</button>}
      {canDelete && <button type="button" className="pn-btn is-sm is-danger" onClick={() => setAsk("delete")}>Excluir</button>}
      {ask && (
        <ConfirmModal
          title={ask === "cancel" ? "Cancelar o agendamento?" : "Excluir a publicação?"}
          body={ask === "cancel"
            ? "Ela não vai ser publicada e volta a ser rascunho, com a mídia e a automação guardadas."
            : published ? "Some daqui do painel. O post continua no Instagram; para tirar do ar, apague por lá." : "A publicação e a mídia são apagadas. A automação ligada volta a ser rascunho sem post."}
          confirmLabel={ask === "cancel" ? "Cancelar agendamento" : "Excluir"}
          tone={ask === "cancel" ? "warn" : "danger"}
          busy={pending}
          onConfirm={() => run(ask)}
          onClose={() => setAsk(null)}
        />
      )}
    </>
  );
}
