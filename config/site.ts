// Nome do produto: troque aqui e ele muda em todas as telas, e-mails de sistema e títulos.
export const PRODUCT = {
  name: "Much Chat",
  tagline: "Comentário vira conversa no direct, sozinho.",
  description: "Quem comenta a palavra-chave no seu post do Instagram recebe o material no direct. Monte o fluxo uma vez e acompanhe os resultados.",
};

// Endereço público, usado nos links do Google e das prévias de compartilhamento. Com domínio próprio, defina NEXT_PUBLIC_SITE_URL.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://muchchat2.vercel.app");

// Dados exibidos nas páginas públicas (política de privacidade / exclusão de dados). Ajuste se quiser.
export const SITE = {
  name: "d.ia.riamente: mensagens automáticas",
  account: "@d.ia.riamente",
  owner: "Bruno",
  contactEmail: "software@cbyk.com.br",
  updatedAt: "24/09/2026",
};
