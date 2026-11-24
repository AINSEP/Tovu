import { createExportRunner } from "@jini-ai/devops/deploy/site/export-run";

/**
 * @file This process's ONE static-export runner. The admin export route
 * (`server/inbound/admin-http/routes/system/export-site.ts`), the composition root's status read
 * (`server/runtime/composition/app.ts`) and the deployments agent tools (`tool-registrations.ts`)
 * all import these four functions from here, so they share a single slot and "one export at a
 * time" holds in-process. It lives under `features/deployments/` rather than the composition root
 * because a domain's `tool-registrations.ts` must never import from `src/server/**` (the back-edge
 * `development/scripts/check-architecture.ts` measures). The standalone agent daemon is a separate
 * OS process and therefore gets its own instance — the cross-process gap the runner's own header
 * discloses.
 */
export const { getExportRunSnapshot, startExportRun, assertExportNotRunning, diagnoseStaticExport } = createExportRunner({
  // The errored snapshot keeps the caught message verbatim, as before the move.
  describeError: ({ error }) => (error instanceof Error ? error.message : String(error)),
});
