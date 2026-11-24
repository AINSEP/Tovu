/**
 * @file Assistant tools for updating this site from the site itself. `site_update_check` is
 * read-only. The platform side (desktop, self-hosted) is injected as `SiteUpdateRuntime`, so the
 * tools know nothing about HOW an update lands and are simply absent where no platform can update.
 */
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type AgentToolDefinition, type DerivedRiskByToolId, type ToolContributor, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { checkForUpdateFromFeed, type MigrationReadinessPort, type ReleaseFeedPort, type SiteBackupPort, type SiteUpdatePort } from "@jini-ai/devops/deploy";
import type { IdGenerator } from "@jini-ai/core/primitives";
import { toolMetadata } from "../../contracts/core/tool-metadata/site-update.js";

export const SITE_UPDATE_CHECK_TOOL_ID = "site_update_check";

/** Everything one platform supplies to check for and apply an update. */
export interface SiteUpdateRuntime {
  feed: ReleaseFeedPort;
  site: SiteUpdatePort;
  backup: SiteBackupPort;
  readiness: MigrationReadinessPort;
  ids: IdGenerator;
  /** The version the live site reports right now. */
  runningVersion(): Promise<string>;
}

export interface SiteUpdateToolDeps {
  authorize: (input: { ctx: ToolExecutionContext; permission: string }) => Promise<void>;
  /** Null where this host cannot update itself: the tools are then not registered at all. */
  runtime: SiteUpdateRuntime | null;
}

const NO_INPUT = { type: "object", additionalProperties: false, properties: {} } as const;

export const siteUpdateCatalog: AgentToolDefinition[] = [
  {
    name: SITE_UPDATE_CHECK_TOOL_ID,
    description: "Check whether a newer version of this site's software is available. Read-only: it never downloads or installs anything.",
    sideEffects: "none", authorization: { permission: "system.read" }, inputSchema: NO_INPUT,
  },
];

export const siteUpdateDerivedRisk: DerivedRiskByToolId = new Map([[SITE_UPDATE_CHECK_TOOL_ID, "none"]]);

function refuseInput({ input }: { input: unknown }, _optional = {}): void {
  const record = input === undefined ? {} : requireInputRecord({ input });
  if (Object.keys(record).length > 0) throw new ToolInputError({ message: "This tool takes no arguments." });
}

/** -> one feed call plus a version compare; writes nothing. */
async function checkTool({ deps, runtime, ctx }: { deps: SiteUpdateToolDeps; runtime: SiteUpdateRuntime; ctx: ToolExecutionContext }, _optional = {}) {
  refuseInput({ input: ctx.input });
  await deps.authorize({ ctx, permission: "system.read" });
  const runningVersion = await runtime.runningVersion();
  try {
    const update = await checkForUpdateFromFeed({ runningVersion, feed: runtime.feed }, { signal: ctx.signal, ids: runtime.ids });
    if (!update) return { checked: true, available: false, runningVersion, message: `You are on the latest version (${runningVersion}).` };
    const notes = update.notes.trim();
    return { checked: true, available: true, runningVersion, latest: update.latest, notes, message: `Version ${update.latest} is available${notes ? `: ${notes}` : "."}` };
  } catch (error) {
    return { checked: false, available: false, runningVersion, message: `Could not check for updates: ${error instanceof Error ? error.message : String(error)} Nothing was changed.` };
  }
}

export function buildSiteUpdateRegistrations(deps: SiteUpdateToolDeps, _surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const { runtime } = deps;
  if (!runtime) return [];
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "site-update", catalogModule: "features/site-update/tools.ts",
    catalog: indexCatalogById({ catalog: siteUpdateCatalog }), derivedRisk: siteUpdateDerivedRisk,
    handlers: { [SITE_UPDATE_CHECK_TOOL_ID]: (ctx) => checkTool({ deps, runtime, ctx }) } });
}

/** Contributes the update tools — registered once by `tool-catalog-manifest.ts` (WAIT-M19: not wired yet). */
export function contributeSiteUpdateTools(): ToolContributor<SiteUpdateToolDeps, AssistantSurfaceDeps> {
  return { domain: "site-update", build: buildSiteUpdateRegistrations, risk: siteUpdateDerivedRisk };
}
