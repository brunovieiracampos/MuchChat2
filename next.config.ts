import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { PORTAL_HOME } from "./config/site";

// Portal principal em /portal: serve as páginas de /m/{conta}, e o endereço antigo redireciona para o novo.
const home = `/m/${PORTAL_HOME.username}`;
const homeSource = home.replace(/\./g, "\\.");

// Painel e telas de conta foram para /admin; os endereços antigos (favoritos, links de e-mail) continuam valendo.
const OLD_ADMIN = ["/entrar", "/aguardando"];
// Cadastro e recuperação de senha foram desligados (só o dono usa o painel): quem chegar por link antigo vai para o login.
const REMOVED = ["/cadastro", "/esqueci-senha", "/redefinir-senha"];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: homeSource, destination: PORTAL_HOME.path, permanent: true },
      { source: `${homeSource}/:path*`, destination: `${PORTAL_HOME.path}/:path*`, permanent: true },
      { source: "/painel", destination: "/admin", permanent: true },
      { source: "/painel/:path*", destination: "/admin/:path*", permanent: true },
      ...OLD_ADMIN.map((p) => ({ source: p, destination: `/admin${p}`, permanent: true })),
      ...REMOVED.flatMap((p) => [p, `/admin${p}`]).map((source) => ({ source, destination: "/admin/entrar", permanent: false })),
    ];
  },
  async rewrites() {
    return [
      // A raiz também abre o portal principal.
      { source: "/", destination: home },
      { source: PORTAL_HOME.path, destination: home },
      { source: `${PORTAL_HOME.path}/:path*`, destination: `${home}/:path*` },
    ];
  },
};

// Workflow: habilita "use workflow" / "use step" (publicações agendadas em workflows/).
export default withWorkflow(nextConfig);
