/**
 * @file Assistant tools for updating this site from the site itself. `site_update_check` is
 * read-only. The platform side (desktop, self-hosted) is injected as `SiteUpdateRuntime`, so the
 * tools know nothing about HOW an update lands and are simply absent where no platform can update.
 */
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type AgentToolDefinition, type DerivedRiskByToolId, type ToolContributor, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import type { SiteUpdateStatusReply } from "@jini-ai/core/contracts/site/devops-deploy";
import { checkForUpdateFromFeed, type SiteUpdateCallOptions, type MigrationReadinessPort, type ReleaseFeedPort, type SiteBackupPort, type SiteUpdatePlan, type SiteUpdatePort } from "@jini-ai/devops/deploy";
import { approvalToolHandler } from "../../contracts/core/human-confirm.js";
import { refuseUnexpectedKeys } from "@jini-ai/core";
import type { IdGenerator } from "@jini-ai/core/primitives";
import { toolMetadata } from "@jini-ai/core/tool-metadata/site-update";
import { handOffApproved, type ApprovedHandoffPorts } from "./approved-handoff.js";

export const SITE_UPDATE_CHECK_TOOL_ID = "site_update_check";
export const SITE_UPDATE_APPLY_TOOL_ID = "site_update_apply";

/** What a host needs to CHECK for an update: usable on its own, with no apply port anywhere near it. */
export interface SiteUpdateCheckRuntime {
  feed: ReleaseFeedPort;
  ids: IdGenerator;
  /** The version the live site reports right now. */
  runningVersion(): Promise<string>;
  /** Read-only safe projection of the supervisor's last attempt. Absent: this host keeps no update journal. */
  readLastAttempt?: ((required: Record<string, never>, optional?: SiteUpdateCallOptions) => Promise<SiteUpdateStatusReply["lastAttempt"]>) | undefined;
}

/** Everything one platform supplies to check for and apply an update. */
export interface SiteUpdateRuntime extends SiteUpdateCheckRuntime {
  site: SiteUpdatePort;
  backup: SiteBackupPort;
  readiness: MigrationReadinessPort;
  /**
   * The managed supervisor's durable hand-off. Required for `site_update_apply` to be registered at all (FIX 16):
   * absent, the runtime is check-only, because an in-process replacement cannot survive the restart it causes.
   */
  handoff?: ApprovedHandoffPorts | undefined;
  /** Serialises whole updates (backup through verify); the host binds its own lock. Absent: no serialisation. */
  lock?: SiteUpdateLockPort;
}

/** Runs one update at a time; `run` is awaited inside the lock and its result returned. */
export interface SiteUpdateLockPort {
  withLock<T>(required: { run: () => Promise<T> }, optional?: { signal?: AbortSignal | undefined }): Promise<T>;
}

export interface SiteUpdateToolDeps {
  authorize: (input: { ctx: ToolExecutionContext; permission: string }) => Promise<void>;
  /** The installation owner's principal id: only that principal's click may start an update. */
  readOwnerId(required: Record<string, never>, optional?: Record<string, never>): Promise<string>;
  /**
   * Null where this host cannot even check: the tools are then not registered at all. A check-only runtime (no apply
   * ports, e.g. self-hosted with no update driver) registers `site_update_check` alone.
   */
  runtime: SiteUpdateCheckRuntime | null;
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
async function checkTool({ deps, runtime, ctx }: { deps: SiteUpdateToolDeps; runtime: SiteUpdateCheckRuntime; ctx: ToolExecutionContext }, _optional = {}) {
  refuseInput({ input: ctx.input });
  await deps.authorize({ ctx, permission: "system.read" });
  const runningVersion = await runtime.runningVersion();
  try {
    const update = await checkForUpdateFromFeed({ runningVersion, feed: runtime.feed }, { signal: ctx.signal, ids: runtime.ids });
    if (!update) return { checked: true, available: false, runningVersion, message: `You are on the latest version (${runningVersion}).` };
    const notes = update.notes.trim();
    return { checked: true, available: true, runningVersion, latest: update.latest, notes, message: `Version ${update.latest} is available${notes ? `: ${notes}` : "."}` };
  } catch {
    return { checked: false, available: false, runningVersion, message: "Could not check for updates. Nothing was changed." };
  }
}

/** The plan frozen when the card is drawn; null when nothing newer is on offer. */
interface PreparedUpdate { runningVersion: string; plan: SiteUpdatePlan | null }

/** -> reads only (permission, running version, feed); the owner's card comes after this. */
async function prepareApply({ deps, runtime, ctx }: { deps: SiteUpdateToolDeps; runtime: SiteUpdateRuntime; ctx: ToolExecutionContext }, _optional = {}): Promise<PreparedUpdate> {
  const input = requireInputRecord({ input: ctx.input });
  refuseUnexpectedKeys({ input: input, allowed: ["toVersion"] });
  await deps.authorize({ ctx, permission: "system.write" });
  const runningVersion = await runtime.runningVersion();
  const update = await runtime.site.checkForUpdate({ runningVersion }, { signal: ctx.signal }).catch(() => {
    throw new ToolInputError({ message: "Could not check for updates. Nothing was changed." });
  });
  if (!update) return { runningVersion, plan: null };
  if (input.toVersion !== undefined && input.toVersion !== update.latest) {
    throw new ToolInputError({ message: `${String(input.toVersion)} is not the version on offer (${update.latest}). Nothing was changed.` });
  }
  return { runningVersion, plan: await runtime.site.planUpdate({ runningVersion, update }, { signal: ctx.signal }) };
}

/** A runtime that may apply: site ports plus the durable supervisor hand-off. */
type ApplyRuntime = SiteUpdateRuntime & { handoff: ApprovedHandoffPorts };

/** -> the durable hand-off with an approval minted from the plan the owner saw, so it can name no other version. */
async function runApproved({ deps, runtime, ctx, prepared, approvedBy }: { deps: SiteUpdateToolDeps; runtime: ApplyRuntime; ctx: ToolExecutionContext; prepared: PreparedUpdate; approvedBy: string }, _optional = {}) {
  const { plan, runningVersion } = prepared;
  if (!plan) return { applied: false, runningVersion, message: `You are on the latest version (${runningVersion}). Nothing was changed.` };
  await deps.authorize({ ctx, permission: "system.write" });
  // An authorized agent acting for a system writer is not, by itself, proof of installation-owner approval: the
  // click must be the owner's, checked here before any backup, staging or hand-off can start.
  if (approvedBy !== await deps.readOwnerId({}).catch(() => null)) {
    return { applied: false, outcome: "refused", runningVersion, message: "Only this site's installation owner can approve an update. Nothing was changed." };
  }
  const guarded = async () => {
    // The card approved moving FROM the version it showed: if the site moved since, that approval is void.
    const liveVersion = await runtime.runningVersion();
    if (liveVersion !== plan.fromVersion) {
      return { applied: false, outcome: "refused", runningVersion: liveVersion, message: `The site is now on ${liveVersion}, but you approved the update from ${plan.fromVersion}. Nothing was changed. Ask again to approve the update from ${liveVersion}.` };
    }
    return handOffApproved({ ports: { backup: runtime.backup, readiness: runtime.readiness, ids: runtime.ids }, handoff: runtime.handoff, plan, approvedBy }, { signal: ctx.signal });
  };
  return runtime.lock ? runtime.lock.withLock({ run: guarded }, { signal: ctx.signal }) : guarded();
}

function applyTool({ deps, runtime, surfaces }: { deps: SiteUpdateToolDeps; runtime: ApplyRuntime; surfaces: AssistantSurfaceDeps }, _optional = {}) {
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

/** True only when the runtime carries apply ports AND a durable hand-off (FIX 16); otherwise it is check-only. */
function canApply(runtime: SiteUpdateCheckRuntime): runtime is ApplyRuntime {
  return "site" in runtime && (runtime as SiteUpdateRuntime).handoff !== undefined;
}

export function buildSiteUpdateRegistrations(deps: SiteUpdateToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const { runtime } = deps;
  if (!runtime) return [];
  const check = { [SITE_UPDATE_CHECK_TOOL_ID]: (ctx: ToolExecutionContext) => checkTool({ deps, runtime, ctx }) };
  const spec = { metadata: toolMetadata, domain: "site-update", catalogModule: "features/site-update/tools.ts", catalog: indexCatalogById({ catalog: siteUpdateCatalog }), derivedRisk: siteUpdateDerivedRisk };
  if (canApply(runtime)) return buildDomainRegistrations({ ...spec, handlers: { ...check, [SITE_UPDATE_APPLY_TOOL_ID]: applyTool({ deps, runtime, surfaces }) } });
  // Declared unwired rather than merely omitted: the catalog assertion fails on a silently missing handler.
  return buildDomainRegistrations({ ...spec, handlers: check }, { unwiredToolIds: new Set([SITE_UPDATE_APPLY_TOOL_ID]) });
}

/** Contributes the update tools — registered once by `tool-catalog-manifest.ts` (WAIT-M19: not wired yet). */
export function contributeSiteUpdateTools(): ToolContributor<SiteUpdateToolDeps, AssistantSurfaceDeps> {
  return { domain: "site-update", build: buildSiteUpdateRegistrations, risk: siteUpdateDerivedRisk };
}
