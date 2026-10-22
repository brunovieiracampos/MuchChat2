"use client";

import { useEffect } from "react";

/**
 * Contagem de visitas do portal no PostHog: páginas vistas, de onde a pessoa veio e quem está online agora.
 * Só entra no layout do portal, então o /admin não é contado.
 *
 * Roda sem cookies nem armazenamento no navegador (cookieless_mode): o PostHog identifica a visita por um
 * hash calculado nos servidores dele, o que dispensa aviso de cookies. Esse modo precisa estar ligado nas
 * configurações do projeto no PostHog, senão os eventos são descartados.
 * Sem a chave (desenvolvimento local, por exemplo) não faz nada.
 */
export function PortalAnalytics() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    // Carregado sob demanda: o portal não espera a biblioteca para aparecer.
    import("posthog-js").then(({ default: posthog }) => {
      if (posthog.__loaded) return;
      posthog.init(key, {
        api_host: "/ingest",
        ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        defaults: "2026-08-30",
        cookieless_mode: "always",
        person_profiles: "identified_only",
      });
    });
  }, []);
  return null;
}
