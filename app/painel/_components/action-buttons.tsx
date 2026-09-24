"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { retryFailedAction, runSweepAction, setPausedAction, subscribeWebhookAction } from "../actions";
import { Icon, Toggle, useToast } from "./ui";
import { ICONS } from "./icons";

export function SweepButton({ className = "pn-btn", children }: { className?: string; children?: ReactNode }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button type="button" className={className} disabled={pending} onClick={() => start(async () => {
      const r = await runSweepAction();
      if (!r.ok) return toast(`Varredura falhou: ${r.error}`, "red");
      toast(r.summary);
      router.refresh();
    })}>
      {pending ? <span className="pn-spinner" /> : <Icon d={ICONS.refresh} size={14} />}
      {pending ? "Varrendo comentários…" : children ?? "Rodar varredura"}
    </button>
  );
}

export function RetryFailedButton() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button type="button" className="pn-btn is-sm" disabled={pending} onClick={() => start(async () => {
      const r = await retryFailedAction();
      if (!r.ok) return toast(r.error ?? "Erro", "red");
      toast(r.count ? `${r.count} DM(s) liberada(s) para nova tentativa na próxima varredura` : "Nenhuma DM com falha para liberar");
      router.refresh();
    })}>{pending ? "Liberando…" : "Tentar de novo"}</button>
  );
}

export function SubscribeButton() {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button type="button" className="pn-btn is-sm" disabled={pending} onClick={() => start(async () => {
      const r = await subscribeWebhookAction();
      toast(r.ok ? "Conta inscrita no webhook de comentários e mensagens" : `Não foi possível inscrever: ${r.error}`, r.ok ? "green" : "red");
    })}>{pending ? "Inscrevendo…" : "Inscrever"}</button>
  );
}

export function PauseToggle({ paused }: { paused: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Toggle on={paused} disabled={pending} label="Pausar todas as automações" onChange={() => start(async () => {
      const r = await setPausedAction(!paused);
      if (!r.ok) return toast(r.error ?? "Erro", "red");
      toast(paused ? "Automações retomadas" : "Automações pausadas", paused ? "green" : "amber");
      router.refresh();
    })} />
  );
}
