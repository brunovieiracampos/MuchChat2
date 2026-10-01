import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";

/** Buscadores: página inicial e documentos públicos; painel, contas e API ficam de fora. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/painel", "/api/", "/entrar", "/cadastro", "/esqueci-senha", "/redefinir-senha", "/aguardando", "/auth/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
