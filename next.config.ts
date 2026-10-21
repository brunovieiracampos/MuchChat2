import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { PORTAL_HOME } from "./config/site";

// Portal principal em /portal: serve as páginas de /m/{conta}, e o endereço antigo redireciona para o novo.
const home = `/m/${PORTAL_HOME.username}`;
const homeSource = home.replace(/\./g, "\\.");

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: homeSource, destination: PORTAL_HOME.path, permanent: true },
      { source: `${homeSource}/:path*`, destination: `${PORTAL_HOME.path}/:path*`, permanent: true },
    ];
  },
  async rewrites() {
    return [
      { source: PORTAL_HOME.path, destination: home },
      { source: `${PORTAL_HOME.path}/:path*`, destination: `${home}/:path*` },
    ];
  },
};

// Workflow: habilita "use workflow" / "use step" (publicações agendadas em workflows/).
export default withWorkflow(nextConfig);
