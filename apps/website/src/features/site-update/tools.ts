/**
 * @file Assistant tools for updating this site from the site itself. `site_update_check` is
 * read-only. The platform side (desktop, self-hosted) is injected as `SiteUpdateRuntime`, so the
 * tools know nothing about HOW an update lands and are simply absent where no platform can update.
 */
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type AgentToolDefinition, type DerivedRiskByToolId, type ToolContributor, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { checkForUpdateFromFeed, runSiteUpdate, type MigrationReadinessPort, type ReleaseFeedPort, type SiteBackupPort, type SiteUpdatePlan, type SiteUpdatePort } from "@jini-ai/devops/deploy";
import { approvalToolHandler, refuseUnexpectedKeys } from "../../contracts/core/human-confirm.js";
import type { IdGenerator } from "@jini-ai/core/primitives";
import { toolMetadata } from "@jini-ai/core/tool-metadata/site-update";

export const SITE_UPDATE_CHECK_TOOL_ID = "site_update_check";
export const SITE_UPDATE_APPLY_TOOL_ID = "site_update_apply";

/** Everything one platform supplies to check for and apply an update. */
export interface SiteUpdateRuntime {
  feed: ReleaseFeedPort;
  site: SiteUpdatePort;
  backup: SiteBackupPort;
  readiness: MigrationReadinessPort;
  ids: IdGenerator;
  /** The version the live site reports right now. */
  runningVersion(): Promise<string>;
  /** Serialises whole updates (backup through verify); the host binds its own lock. Absent: no serialisation. */
  lock?: SiteUpdateLockPort;
}

/** Runs one update at a time; `run` is awaited inside the lock and its result returned. */
export interface SiteUpdateLockPort {
  withLock<T>(required: { run: () => Promise<T> }, optional?: { signal?: AbortSignal | undefined }): Promise<T>;
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
  {
    name: SITE_UPDATE_APPLY_TOOL_ID,
    description: "Update this site to the newer version on offer. The owner always sees a card with the from and to versions and what changed, and nothing happens unless they click Update. The site is backed up first and put back if the new version does not work. Never call this on your own: only when the owner asks to update. Optional toVersion must equal the version site_update_check reported.",
    sideEffects: "mutates-durable-state", authorization: { permission: "system.write" },
    inputSchema: { type: "object", additionalProperties: false, properties: { toVersion: { type: "string", minLength: 1 } } },
  },
];

export const siteUpdateDerivedRisk: DerivedRiskByToolId = new Map([[SITE_UPDATE_CHECK_TOOL_ID, "none"], [SITE_UPDATE_APPLY_TOOL_ID, "mutates-durable-state"]]);

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

/** The plan frozen when the card is drawn; null when nothing newer is on offer. */
interface PreparedUpdate { runningVersion: string; plan: SiteUpdatePlan | null }

/** -> reads only (permission, running version, feed); the owner's card comes after this. */
async function prepareApply({ deps, runtime, ctx }: { deps: SiteUpdateToolDeps; runtime: SiteUpdateRuntime; ctx: ToolExecutionContext }, _optional = {}): Promise<PreparedUpdate> {
  const input = requireInputRecord({ input: ctx.input });
  refuseUnexpectedKeys(input, ["toVersion"]);
  await deps.authorize({ ctx, permission: "system.write" });
  const runningVersion = await runtime.runningVersion();
  const update = await runtime.site.checkForUpdate({ runningVersion }, { signal: ctx.signal }).catch((error: unknown) => {
    throw new ToolInputError({ message: `Could not check for updates: ${error instanceof Error ? error.message : String(error)} Nothing was changed.` });
  });
  if (!update) return { runningVersion, plan: null };
  if (input.toVersion !== undefined && input.toVersion !== update.latest) {
    throw new ToolInputError({ message: `${String(input.toVersion)} is not the version on offer (${update.latest}). Nothing was changed.` });
  }
  return { runningVersion, plan: await runtime.site.planUpdate({ runningVersion, update }, { signal: ctx.signal }) };
}

const STEP_LABELS = { approval: "Approval", backup: "Backup", readiness: "Readiness", apply: "Apply", verify: "Verify", rollback: "Rollback" } as const;

/** -> runSiteUpdate with an approval minted from the plan the owner saw, so it can name no other version. */
async function runApproved({ deps, runtime, ctx, prepared, approvedBy }: { deps: SiteUpdateToolDeps; runtime: SiteUpdateRuntime; ctx: ToolExecutionContext; prepared: PreparedUpdate; approvedBy: string }, _optional = {}) {
  const { plan, runningVersion } = prepared;
  if (!plan) return { applied: false, runningVersion, message: `You are on the latest version (${runningVersion}). Nothing was changed.` };
  await deps.authorize({ ctx, permission: "system.write" });
  const guarded = async () => {
    // The card approved moving FROM the version it showed: if the site moved since, that approval is void.
    const liveVersion = await runtime.runningVersion();
    if (liveVersion !== plan.fromVersion) {
      return { applied: false, outcome: "refused", runningVersion: liveVersion, message: `The site is now on ${liveVersion}, but you approved the update from ${plan.fromVersion}. Nothing was changed. Ask again to approve the update from ${liveVersion}.` };
    }
    return applyApproved({ runtime, ctx, plan, approvedBy });
  };
  return runtime.lock ? runtime.lock.withLock({ run: guarded }, { signal: ctx.signal }) : guarded();
}

async function applyApproved({ runtime, ctx, plan, approvedBy }: { runtime: SiteUpdateRuntime; ctx: ToolExecutionContext; plan: SiteUpdatePlan; approvedBy: string }, _optional = {}) {
  const result = await runSiteUpdate(
    { ports: { site: runtime.site, backup: runtime.backup, readiness: runtime.readiness, ids: runtime.ids }, plan, approval: { kind: "owner-approval", approvedBy, toVersion: plan.toVersion } },
    { signal: ctx.signal },
  );
  return { applied: result.outcome === "updated", outcome: result.outcome, message: result.summary, steps: result.steps.map((step) => `${STEP_LABELS[step.step]}: ${step.detail}`), ...(result.backupId ? { backupId: result.backupId } : {}), ...(result.errorId ? { errorId: result.errorId } : {}) };
}

function applyTool({ deps, runtime, surfaces }: { deps: SiteUpdateToolDeps; runtime: SiteUpdateRuntime; surfaces: AssistantSurfaceDeps }, _optional = {}) {
  return approvalToolHandler<PreparedUpdate>({ surfaces,
    prepare: ({ ctx }) => prepareApply({ deps, runtime, ctx }),
    describe: ({ prepared }) => {
      const { plan } = prepared;
      const to = plan?.toVersion ?? "";
      return { toolId: SITE_UPDATE_APPLY_TOOL_ID, errorCode: "SITE_UPDATE", title: `Update this site to ${to}?`,
        details: [{ label: "From version", value: plan?.fromVersion ?? "" }, { label: "To version", value: to }, { label: "What changed", value: plan?.notes.trim() || "No notes were published." }],
        notice: `The site is backed up first and put back on ${plan?.fromVersion ?? "the current version"} if the new version does not work.`,
        confirmLabel: `Update to ${to}` };
    },
    run: ({ ctx, prepared, confirmer }) => runApproved({ deps, runtime, ctx, prepared, approvedBy: confirmer.id }),
  }, { flag: "applied", ask: ({ prepared }) => prepared.plan !== null });
}

export function buildSiteUpdateRegistrations(deps: SiteUpdateToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const { runtime } = deps;
  if (!runtime) return [];
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "site-update", catalogModule: "features/site-update/tools.ts",
    catalog: indexCatalogById({ catalog: siteUpdateCatalog }), derivedRisk: siteUpdateDerivedRisk,
    handlers: { [SITE_UPDATE_CHECK_TOOL_ID]: (ctx) => checkTool({ deps, runtime, ctx }), [SITE_UPDATE_APPLY_TOOL_ID]: applyTool({ deps, runtime, surfaces }) } });
}

/** Contributes the update tools — registered once by `tool-catalog-manifest.ts` (WAIT-M19: not wired yet). */
export function contributeSiteUpdateTools(): ToolContributor<SiteUpdateToolDeps, AssistantSurfaceDeps> {
  return { domain: "site-update", build: buildSiteUpdateRegistrations, risk: siteUpdateDerivedRisk };
}
