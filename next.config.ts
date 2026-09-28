import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {};

// Workflow: habilita "use workflow" / "use step" (publicações agendadas em workflows/).
export default withWorkflow(nextConfig);
