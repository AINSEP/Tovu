import {
  type AuthorizeFn,
  buildDomainRegistrations,
  indexCatalogById,
  isRecord,
  optionalBoolean,
  optionalString,
  requireInputRecord,
  requireNoInput,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import { deploymentsAgentToolCatalog } from "./agent-tools";
import { readDockerfileSource, writeDockerfileSource } from "./dockerfile";
import { getExportRunSnapshot, startExportRun } from "./export-run";
import type { DeploymentsReadRepoPort } from "./read-repo";

/**
 * @file The Deployments domain's half of the agent-tool wiring split — maps
 * `agent-tools.ts`'s five catalog entries onto the same domain logic the admin HTTP routes already
 * use, as `ToolRegistration`s. All five are wired; none is excluded (see `agent-tools.ts`'s file
 * header for why this domain, unlike Recovery/Database, has no token-gated/human-only entry).
 *
 * Authorization shape: none of `startExportRun`/`getExportRunSnapshot`/`readDockerfileSource`/
 * `writeDockerfileSource`/`DeploymentsReadRepoPort`'s methods call `authorize()` internally (they
 * mirror the plain domain functions the admin routes already call inline), so every handler below
 * calls the kit's `requireToolPermission` itself — the same shape `recovery`/`database` already use.
 */

/**
 * The exact slice of the route-deps bag this domain's tool handlers read.
 *
 * `deploymentsReadRepo` is declared explicitly even though it is already present on the type
 * `Parameters<typeof startExportRun>[0]` resolves to, purely for readability — a reader scanning
 * this file should not have to chase into `export-run.ts` to learn that `deployment_list` needs it.
 *
 * Every OTHER domain's `tool-registrations.ts` declares a narrow structural interface instead of
 * importing `server/routes/types`'s `RouteDeps`, specifically to avoid a `features/<domain> ->
 * src/server/**` back-edge (see `features/recovery/tool-registrations.ts`'s file header). This
 * domain cannot follow that pattern for `deployment_trigger_export` alone: `startExportRun` calls
 * `exportSite`, which boots an entirely separate in-process copy of `createApp(routeDeps)` to fetch
 * every route — it genuinely needs the WHOLE deps bag, not a slice of it, so there is no honest
 * narrower type to declare. `Parameters<typeof startExportRun>[0]` gets the same full shape (which
 * IS `RouteDeps` at every real call site) without writing a named `import type { RouteDeps } from
 * "#src/server/routes/types"` anywhere in this file — see `export-run.ts`'s own header for the full
 * argument. This is a disclosed, deliberate exception to the narrow-slice convention, not an
 * oversight.
 */
export type DeploymentsToolDeps = Parameters<typeof startExportRun>[0] & {
  deploymentsReadRepo: DeploymentsReadRepoPort;
};

const CATALOG_BY_ID = indexCatalogById(deploymentsAgentToolCatalog);

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const deploymentsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> startExportRun (export-run.ts) -> exportSite: writes a folder of HTML/CSS/JS/asset files to
  //    disk. A real mutation, same classification as `backup_create_restore_point`.
  ["deployment_trigger_export", "mutates-durable-state"],
  // -> getExportRunSnapshot(): reads a process-local in-memory variable. No I/O of any kind.
  ["deployment_get_export_status", "none"],
  // -> DeploymentsReadRepoPort's four list methods: read-only repo queries.
  ["deployment_list", "none"],
  // -> readDockerfileSource (dockerfile.ts): one existence check, one file read. No write.
  ["deployment_get_dockerfile", "none"],
  // -> writeDockerfileSource (dockerfile.ts): one file write to the repo-root Dockerfile.
  ["deployment_set_dockerfile", "mutates-durable-state"],
]);

export function buildDeploymentsRegistrations(routeDeps: DeploymentsToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    deployment_trigger_export: async (ctx) => {
      if (ctx.input !== undefined && !isRecord(ctx.input)) throw new Error("input must be an object");
      const input = isRecord(ctx.input) ? ctx.input : {};
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "system.export", entityType: "site-export" });

      // No `await` between this check and `startExportRun` below — matches `export-site.ts`'s own
      // "no await between check and set" atomicity comment exactly, so a tool call and a concurrent
      // HTTP trigger in this SAME process can never both observe "not running" (see `export-run.ts`'s
      // file header for the one case where this process is not the same one: the standalone daemon).
      if (getExportRunSnapshot().status === "running") {
        throw new Error("an export is already running — call deployment_get_export_status to see its progress, this will not resolve on retry");
      }

      const clean = optionalBoolean(input, "clean") ?? false;
      const basePath = optionalString(input, "basePath");
      return startExportRun(routeDeps, { clean, basePath });
    },

    deployment_get_export_status: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "system.read", entityType: "site-export" });
      return getExportRunSnapshot();
    },

    deployment_list: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "deployments.read", entityType: "deployment-target" });

      const workspaceId = routeDeps.workspaceId;
      const [environments, targets, releases, runs] = await Promise.all([
        routeDeps.deploymentsReadRepo.listEnvironments({ workspaceId }),
        routeDeps.deploymentsReadRepo.listTargets({ workspaceId }),
        routeDeps.deploymentsReadRepo.listReleases({ workspaceId }),
        routeDeps.deploymentsReadRepo.listRuns({ workspaceId }),
      ]);
      return { environments, targets, releases, runs };
    },

    deployment_get_dockerfile: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "system.read", entityType: "dockerfile-source" });
      return readDockerfileSource();
    },

    deployment_set_dockerfile: async (ctx) => {
      const contents = requireString(requireInputRecord(ctx.input), "contents");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "system.write", entityType: "dockerfile-source" });
      return writeDockerfileSource(contents);
    },
  };

  return buildDomainRegistrations({
    domain: "deployments",
    catalogModule: "features/deployments/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: deploymentsDerivedRisk,
  });
}
