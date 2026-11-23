export type { PublishContentToolDeps } from "./tool-deps.js";
import type { PublishContentToolDeps } from "./tool-deps.js";
import { toolMetadata } from '@jini-ai/cms/publish/content/tool-metadata';
import { nowIso, type Clock } from "@jini-ai/core/primitives";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import path from "node:path";

import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolExecutionContext, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
// `ToolInputError` specifically — the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a
// rejection 400 rather than redacting it into a message-stripped 500. Same import, same reason, as
// `features/site-evidence/tool-registrations.ts`.
import { ToolInputError } from "@jini-ai/core";

import type { ToolContributor } from "@jini-ai/core";

import { humanConfirmedToolHandler, refuseUnexpectedKeys } from "../../contracts/core/human-confirm.js";
import { plan as gatewayPlan, confirm as gatewayConfirm, execute as gatewayExecute, ForbiddenError, PlanStaleError, type GatewayDeps } from "../../contracts/core/gated-mutations/gateway.js";
import { loadActiveBundle } from "@jini-ai/cms/publish/transfer";
import { buildPublishContentImportHooks, PublishContentBundleNotFoundError, type BuildPublishContentImportHooksInput } from "./gated-hooks.js";
import { executePublishContentImport, RestorePointUnavailableError } from "@jini-ai/cms/publish/content/execute-import";
import { getPublishContentRunStatus, type PublishContentRunRepoPort } from "./run-repo.js";
import { entityKey, type PublishContentReport } from "./plan-rows.js";
import { pullAndStageFromPeer, type PublishContentPullDeps } from "./pull.js";
import { PublishContentPeerNotFoundError, PublishContentPeerCredentialMissingError, PublishContentPeerSecretStoreUnconfiguredError } from "./peers.js";
import { PublishContentPeerTransportError } from "./peer-transport.js";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { PluginHookFailedError, toModelFacingPluginHookError } from "../../contracts/core/plugin-hook-failed-error.js";
import {
  connectDestination,
  disconnectDestination,
  PublishTrustConnectError,
} from "../publish-trust/connect.js";
import { PublishTrustHandshakeError } from "../publish-trust/handshake-client.js";
import {
  COMMITTED_JSON_CODEC,
  createFileProvisioning,
  PUBLISH_TRUST_CONFIG_PATH,
  type PublishTrustProvisioningPort,
} from "../publish-trust/provisioning.js";
import { nodeProvisioningFileIo, resolveCommittedConfigRoot } from "../publish-trust/provisioning.node-io.js";

import { type AgentToolDefinition } from "@jini-ai/core";
import { publishContentAgentToolCatalog, PUBLISH_CONTENT_PUBLISH_TOOL_ID, PUBLISH_CONTENT_CONNECT_TOOL_ID, PUBLISH_CONTENT_PLAN_PULL_TOOL_ID, PUBLISH_CONTENT_EXECUTE_PULL_TOOL_ID, PUBLISH_CONTENT_STATUS_TOOL_ID, PUBLISH_BACKSTOP_GAPS_TOOL_ID } from "@jini-ai/cms/publish/content/agent-tools";
import { connectAndRecordDestination } from "./connect-destination.js";
// Both pulls and autonomous publishes resolve the same saved destination credential.
import { resolvePublishDestinationCredential } from "./destination-credential.js";
import { normalizePeerBaseUrl } from "@jini-ai/cms/publish/content/peer-url";
import { hasForbiddenRawUrlCharacter } from "@jini-ai/core/contracts/server/verified-origin";
import { selectConnectedDestination, type PublishContentPeerRecord, type PublishContentPeerRepoPort } from "./peers.js";
import { PUBLISH_CONTENT_APPLY_PERMISSION, PUBLISH_CONTENT_READ_PERMISSION } from "./permissions.js";
import { describePublishReadiness, siteLabelFor, type PublishReadiness } from "@jini-ai/cms/publish/content/publish-readiness";
import type { BeforeSaveHookPort } from "#src/features/post/index";
import type { OutboxPort } from "@jini-ai/core/contracts/events";

import { publishContentFromTool } from "./publish-tool.js";
import type { CompositeBlobStoreRead } from "./composite-blob-source.js";

import { listPublishContentContributors } from "./type-registry.js";
import type { PublishContentDeps } from "./type-registry.js";
import type { TovuPublishPorts, EntryPublishPorts, WidgetPublishPorts } from "./tovu-publish-ports.js";

/**
 * @file Wires readiness, connection, autonomous publishing and live-content pulls into the assistant catalog.
 * Pulls share the HTTP import hooks and the taxonomy tool's human confirmation transport.
 *
 * The catalog and the per-tool reasoning live in `agent-tools.ts`. This file is the wiring: the
 * permission each tool checks and the ports each handler reaches through.
 *
 * ## Autonomous publishing through the shared dialog path
 *
 * Owner decision 2026-10-05: the assistant must publish on its own. The 2026-09-24 removal avoided
 * a second safety implementation and an MCP-UI confirmation surface. The restored tool has no
 * card: shared feature-side push planning and re-plan checks feed the SAME destination gateway
 * as the Publish dialog. Explicit overwrite input replaces the human tick for this tool only;
 * HTTP overwrite requests keep their existing session gate. The dialog remains available.
 *
 * ## Why the provisioning port is built here
 *
 * The assistant's deps bag is a `RouteDeps` projection and carries no provisioning port — that port
 * is composed in `server/runtime/composition/modules/publish-content.ts` for the HTTP route. A
 * feature may not import `server/**` (`.dependency-cruiser.mjs`'s `feature-no-server-or-framework-
 * imports`), so the default is composed here from the SAME three exported constants that module
 * uses, which is what stops the two drifting on path or format. The field stays optional so a test
 * substitutes a fake — the identical shape `SiteEvidenceToolDeps.siteEvidenceBrowser` already uses.
 */

const publishContentDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // External write: uploads/stages on live and confirms/executes its gateway, applying durable
  // remote content. The registry's write classification is mutates-durable-state (no separate
  // external-write enum); this must never be marked read-only or token-only.
  [PUBLISH_CONTENT_PUBLISH_TOOL_ID, "mutates-durable-state"],
  // -> a read-only projection of source audit events; no bundle, confirmation or writes.
  [PUBLISH_BACKSTOP_GAPS_TOOL_ID, "none"],
  // -> one peer-table read, one repo-config read. Writes nothing, contacts nothing.
  [PUBLISH_CONTENT_STATUS_TOOL_ID, "none"],
  // -> pullAndStageFromPeer stores blobs and a 24-hour staged row; gateway.plan reads;
  //    the planned run row retains the source label. These are durable writes, even with a TTL.
  [PUBLISH_CONTENT_PLAN_PULL_TOOL_ID, "mutates-durable-state"],
  // -> human-confirmed gateway.confirm mints a token; gateway.execute captures a restore point
  //    and applies through the existing import hooks/apply port.
  [PUBLISH_CONTENT_EXECUTE_PULL_TOOL_ID, "mutates-durable-state"],
  // -> connectDestination(): one round trip to the destination, then a write to committed config
  //    and one row in this workspace's destination list.
  [PUBLISH_CONTENT_CONNECT_TOOL_ID, "mutates-durable-state"],
]);

const CATALOG_BY_ID = indexCatalogById({ catalog: publishContentAgentToolCatalog });

/** The real committed-config provisioning port — the same three constants
 *  `server/runtime/composition/modules/publish-content.ts` composes for the HTTP route, resolved
 *  against the same {@link resolveCommittedConfigRoot} so an assistant-tool connect and a dialog
 *  connect never disagree about which file they wrote.
 *  @complexity O(1). */
export function defaultProvisioning(): PublishTrustProvisioningPort {
  return createFileProvisioning({
    io: nodeProvisioningFileIo,
    codec: COMMITTED_JSON_CODEC,
    path: path.join(resolveCommittedConfigRoot(), PUBLISH_TRUST_CONFIG_PATH),
  });
}

/** Matches a bare identifier-shaped token — `PEER_NOT_FOUND`, `publish_trust_export_not_wired`,
 *  `EGRESS_REFUSED`. Anchored on word boundaries so ordinary prose and a capitalised site name are
 *  untouched. */
const MACHINE_TOKEN = /\b(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[a-z0-9]+(?:_[a-z0-9]+)+)\b/;

/**
 * Returns `text` only if a person could read it, and `fallback` otherwise.
 *
 * Several errors these handlers catch carry messages that were written for a person — and several
 * carry, or interpolate, a machine code. Review cannot keep that straight for every future error
 * added upstream, so the sentence a person sees passes through one filter that can. The filter is
 * deliberately blunt: a message with an underscore-joined identifier anywhere in it is discarded
 * whole rather than patched, because a half-scrubbed sentence reads worse than the plain one.
 *
 * @complexity O(n) in the message length.
 */
export function plainSentence({ text, fallback }: { text: string; fallback: string }, _optional = {}): string {
  const trimmed = text.trim();
  if (trimmed.length === 0 || MACHINE_TOKEN.test(trimmed)) return fallback;
  return trimmed;
}

/** The live site this computer publishes to, if there is exactly one obvious answer.
 *
 *  A row with no stored secret is one this computer CONNECTED to; a row with one was configured by
 *  hand. The connected row wins when both exist, because it is the one the zero-setup flow made and
 *  the one a person will have meant.
 *  @complexity O(n) in the workspace's destination count. */
function chooseDestination(rows: readonly PublishContentPeerRecord[]): PublishContentPeerRecord | null {
  const connected = selectConnectedDestination({ rows });
  if (connected) return connected;
  return rows.length === 1 ? (rows[0] as PublishContentPeerRecord) : null;
}

/** Reads this install's publish readiness — the shared first step of both handlers.
 *  @complexity O(n) in the workspace's destination count. */
async function readReadiness({ deps, findCandidate }: { deps: PublishContentToolDeps; findCandidate: () => Promise<string | null> }, _optional = {}): Promise<{ readiness: PublishReadiness; rows: readonly PublishContentPeerRecord[] }> {
  const rows = await deps.publishContentPeerRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  const connected = selectConnectedDestination({ rows });
  const readiness = describePublishReadiness({
    connectedSiteLabel: connected ? connected.label : null,
    otherSiteLabels: rows.filter((row) => row.sealed !== null).map((row) => row.label),
    // Only consulted when nothing is connected, so the file read is skipped in the common case.
    candidateUrl: connected || rows.length > 0 ? null : await findCandidate(),
    publishableTypeCount: listPublishContentContributors().length,
  });
  return { readiness, rows };
}

type PublishContentToolRoute = { routeDeps: PublishContentToolDeps; provisioning: PublishTrustProvisioningPort };

async function connectPublishContentTool(
  required: PublishContentToolRoute & { ctx: ToolExecutionContext; findCandidate: () => Promise<string | null> },
  _optional = {},
): Promise<unknown> {
  const { routeDeps, provisioning, ctx, findCandidate } = required;
  const input = requireInputRecord({ input: ctx.input });
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: PUBLISH_CONTENT_APPLY_PERMISSION });

  const raw = await connectSiteUrl({ input, findCandidate });
  if (raw === null) {
    // The never-deployed install. An ordinary empty state, reported as a result rather than
    // thrown, so the model can relay the sentence instead of a failure.
    return {
      connected: false,
      message: "There is no live site to publish to yet.",
      nextStep: "Put this site online once, then come back and connect this computer to it.",
    };
  }

  const normalized = normalizePeerBaseUrl({ raw, hasForbiddenRawUrlCharacter });
  if ("error" in normalized) {
    return { connected: false, message: "That does not look like a website address.", nextStep: null };
  }

  // What this computer may publish is its OWN registered types, never a list anyone chooses.
  // An empty grant can do nothing, so an install with nothing publishable is refused here
  // rather than connected into something that would silently publish nothing.
  const entityTypes = listPublishContentContributors().map((contributor) => contributor.entityType);
  if (entityTypes.length === 0) {
    return {
      connected: false,
      message: "There is nothing on this site that can be copied to a live site yet.",
      nextStep: "Add something to this site first, then come back.",
    };
  }
  return connectWithTrust({ routeDeps, provisioning, baseUrl: normalized.baseUrl, entityTypes });
}

/** Records the destination and its grant; a handshake or write failure becomes a plain result the model can relay. */
async function connectWithTrust(
  required: PublishContentToolRoute & { baseUrl: string; entityTypes: string[] },
  _optional = {},
): Promise<unknown> {
  const { routeDeps, provisioning, baseUrl, entityTypes } = required;
  try {
    const trustDeps = {
      httpClient: routeDeps.publishContentPeerHttpClient,
      keyring: routeDeps.siteAssistantSecretKeyring,
      provisioning,
      clock: routeDeps.clock,
      workspaceId: routeDeps.workspaceId,
    };
    const { site, grant } = await connectAndRecordDestination(
      {
        deps: {
          repo: routeDeps.publishContentPeerRepo,
          clock: routeDeps.clock,
          idGen: routeDeps.idGen,
          connectGrant: (connectInput, _options: Record<string, never> = {}) => connectDestination({ deps: trustDeps, input: connectInput }),
          reverseGrant: () => disconnectDestination({ deps: trustDeps }),
        },
        input: { workspaceId: routeDeps.workspaceId, baseUrl: baseUrl, entityTypes }
      }
    );

    return {
      connected: true,
      message: `This computer publishes to ${site.label}.`,
      nextStep: plainSentence({ text: grant.nextStep, fallback: "Put this site online once more for the change to take effect." }),
    };
  } catch (err) {
    if (err instanceof PublishTrustHandshakeError) {
      return {
        connected: false,
        message: plainSentence({ text: err.message, fallback: `${siteLabelFor({ baseUrl: baseUrl })} could not be reached, or it is not a site this can publish to.` }),
        nextStep: "Check the address and that the site is online, then try connecting again.",
      };
    }
    if (err instanceof PublishTrustConnectError) {
      return {
        connected: false,
        message: "This site's publishing settings could not be saved on this computer.",
        nextStep: "Check that this project's files can be written to, then try connecting again.",
      };
    }
    throw err;
  }
}

    async function planPublishContentPull(routeDeps: PublishContentToolDeps, ctx: Parameters<ToolHandler>[0]) {
  return pullToolBoundary({ run: async () => {
      const input = requireInputRecord({ input: ctx.input });
      refuseUnexpectedKeys(input, ["peerId"]);
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: PUBLISH_CONTENT_APPLY_PERMISSION });
      const peerId = await selectPullPeer({ deps: routeDeps, supplied: input.peerId });
      const staged = await pullAndStageFromPeer({ deps: routeDeps, input: { peerId, principalId: ctx.principal.id } });
      const planned = await gatewayPlan({ deps: routeDeps.gatedMutations.gatewayDeps, principalId: ctx.principal.id, principalKind: "agent", hooks: pullHooks({ deps: routeDeps, bundleId: staged.bundleId, actorId: ctx.principal.id }) });
      const report = acceptedPullReport(planned.details as PublishContentReport);
      // The bundle table has no source-label column. An existing audit row retains this display
      // metadata across tool calls/restarts; no cached plan is trusted at execute time.
      await routeDeps.publishContentRunRepo.save({ record: {
        id: staged.bundleId, workspaceId: routeDeps.workspaceId, direction: "import", phase: "planned",
        peerPrincipalId: ctx.principal.id, peerLabel: staged.peerLabel, actorId: ctx.principal.id,
        restorePointId: null, changeSetIdsJson: null, startedAt: nowIso({ clock: routeDeps.clock }), finishedAt: null,
        reportJson: JSON.stringify(report), itemsJson: null,
      } });
      return { bundleId: staged.bundleId, expiresAt: staged.expiresAt, peerLabel: staged.peerLabel,
        counts: pullCounts(report), conflicts: report.rows.filter(row => row.canOverwrite).slice(0, 50).map(row => ({
          entityKey: entityKey({ entityType: row.entityType, entityId: row.entityId }), title: pullTitle(row), reason: row.reason,
        })), blobsUnavailable: staged.blobsUnavailable, blobsDeferred: staged.blobsDeferred };
    } });
}

    function createExecutePullHandler(routeDeps: PublishContentToolDeps, surfaces: AssistantSurfaceDeps): ToolHandler {
  return humanConfirmedToolHandler(surfaces, {
      flag: "executed",
      prepare: ({ ctx }) => pullToolBoundary({ run: async () => {
        const input = requireInputRecord({ input: ctx.input });
        refuseUnexpectedKeys(input, ["bundleId", "overwriteEntityKeys"]);
        const bundleId = requiredPullBundleId({ value: input.bundleId });
        const overwriteKeys = pullOverwriteKeys({ value: input.overwriteEntityKeys });
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: PUBLISH_CONTENT_APPLY_PERMISSION });
        const bundle = await loadActiveBundle({ repo: routeDeps.publishContentBundleRepo, workspaceId: routeDeps.workspaceId, id: bundleId, now: nowIso({ clock: routeDeps.clock }) });
        if (!bundle) throw new ToolInputError({ message: "This pull plan was not found or has expired. Run publish_content_plan_pull again." });
        if (bundle.sourcePrincipalId !== ctx.principal.id) throw new ToolInputError({ message: "This pull was planned by a different caller. Run publish_content_plan_pull for this conversation." });
        const audit = await routeDeps.publishContentRunRepo.findById({ workspaceId: routeDeps.workspaceId, id: bundleId });
        if (!audit || audit.phase !== "planned" || audit.actorId !== ctx.principal.id) throw new ToolInputError({ message: "This pull plan was not found or has expired. Run publish_content_plan_pull again." });
        const hooks = pullHooks({ deps: routeDeps, bundleId, actorId: ctx.principal.id }, { forcedEntityKeys: overwriteKeys });
        const planned = await gatewayPlan({ deps: routeDeps.gatedMutations.gatewayDeps, principalId: ctx.principal.id, principalKind: "agent", hooks });
        const report = acceptedPullReport(planned.details as PublishContentReport);
        const knownKeys = new Set(report.rows.map(row => entityKey({ entityType: row.entityType, entityId: row.entityId })));
        for (const key of overwriteKeys) if (!knownKeys.has(key)) throw new ToolInputError({ message: `'${key}' is not in this pull plan. Use entity keys returned by publish_content_plan_pull.` });
        return { hooks, planned, report, peerLabel: audit.peerLabel ?? "Live site" };
      } }),
      dialog: ({ report, peerLabel }) => ({
        toolId: PUBLISH_CONTENT_EXECUTE_PULL_TOOL_ID, errorCode: "PUBLISH_CONTENT", title: "Pull live content to this computer?",
        description: `Copy content from ${peerLabel} into this local site.`,
        details: [
          { label: "Live site", value: peerLabel },
          ...Object.entries(pullCounts(report)).map(([key, count]) => ({ label: key.charAt(0).toUpperCase() + key.slice(1), value: String(count) })),
          ...report.rows.filter(row => row.outcome === "applied" || row.outcome === "forced").map(row => ({ label: "Overwrite local item", value: pullTitle(row) })),
          ...report.rows.flatMap(row => row.retires !== null && row.writes ? [{ label: "Move to Trash", value: row.retires.entityLabel ?? row.retires.entityId }] : []),
        ],
        warning: "The listed local items will be overwritten. A restore point is captured before applying changes.",
        danger: true, confirmLabel: "Apply pull",
      }),
      run: ({ ctx, prepared: { hooks, planned }, confirmer }) => pullToolBoundary({ run: async () => {
        const token = await gatewayConfirm({ deps: routeDeps.gatedMutations.gatewayDeps, principalId: confirmer.id, principalKind: confirmer.kind, hooks, planId: planned.planId, planHash: planned.planHash, signal: ctx.signal });
        // As on /import/execute, check restore capability outside the shared gateway; it still
        // re-authorizes, checks the human-bound token and re-derives the plan before any write.
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: PUBLISH_CONTENT_APPLY_PERMISSION });
        const capabilities = await routeDeps.dbOps.getCapabilities();
        const applied = await executePublishContentImport({ workspaceId: routeDeps.workspaceId, costClass: capabilities.restorePoint.costClass,
          gatewayExecute: () => gatewayExecute({ deps: routeDeps.gatedMutations.gatewayDeps, principalId: ctx.principal.id, principalKind: "agent", hooks, confirmationToken: token.confirmationToken, signal: ctx.signal }),
        });
        const status = await getPublishContentRunStatus({ repo: routeDeps.publishContentRunRepo, input: { workspaceId: routeDeps.workspaceId, runId: applied.runId } });
        if (!status?.report) throw new ToolInputError({ message: "The pull ran, but its report could not be loaded. Check import history before retrying." });
        // Use the persisted APPLY report, including any optimistic-concurrency downgrades.
        return { executed: true, counts: pullCounts(status.report), entities: status.report.rows.map(row => ({ entityKey: entityKey({ entityType: row.entityType, entityId: row.entityId }), title: pullTitle(row), outcome: row.outcome, reason: row.reason })) };
      } }),
    });
}



/**
 * Wires publish/readiness/connection tools using explicit ports; pulls retain human-bound surfaces.
 * Pull planning stores an expiring bundle; execution reaches the import gateway only after a click.
 * @returns Catalog registrations with independently derived write risk.
 * @example buildPublishContentRegistrations(deps, { surfaceExchanges });
 * @complexity O(t) for t catalog entries; handler I/O runs only when invoked.
 */
export function buildPublishContentRegistrations(
  { routeDeps, surfaces }: { routeDeps: PublishContentToolDeps; surfaces: AssistantSurfaceDeps },
  _optional = {}
): ToolRegistration[] {
  const findCandidate = routeDeps.findPublishCandidate ?? (async () => null);
  const provisioning = routeDeps.publishTrustProvisioning ?? defaultProvisioning();

  const handlers: Record<string, ToolHandler> = {
    [PUBLISH_CONTENT_PUBLISH_TOOL_ID]: ctx => pullToolBoundary({ run: async () => {
      const input = requireInputRecord({ input: ctx.input ?? {} });
      refuseUnexpectedKeys(input, ["peerId", "types", "items", "excludeItems", "overwrite"]);
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }),
        workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: PUBLISH_CONTENT_APPLY_PERMISSION });
      ctx.signal.throwIfAborted();
      return publishContentFromTool({ deps: routeDeps, principalId: ctx.principal.id }, input);
    } }),
    [PUBLISH_BACKSTOP_GAPS_TOOL_ID]: async (ctx) => {
      refuseUnexpectedKeys(requireInputRecord({ input: ctx.input ?? {} }), []);
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }),
        workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: "publish_content.read" });
      const audit = routeDeps.makePublishContentDeps?.().backstop?.audit;
      return { gaps: audit && await audit.ready() ? await audit.gaps({ workspaceId: routeDeps.workspaceId }) : [] };
    },
    [PUBLISH_CONTENT_PLAN_PULL_TOOL_ID]: (ctx) => planPublishContentPull(routeDeps, ctx),
    [PUBLISH_CONTENT_EXECUTE_PULL_TOOL_ID]: createExecutePullHandler(routeDeps, surfaces),
    [PUBLISH_CONTENT_STATUS_TOOL_ID]: async (ctx) => {
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: PUBLISH_CONTENT_READ_PERMISSION });
      const { readiness } = await readReadiness({ deps: routeDeps, findCandidate });
      return readiness;
    },

    [PUBLISH_CONTENT_CONNECT_TOOL_ID]: (ctx) => connectPublishContentTool({ routeDeps, provisioning, ctx, findCandidate }),
  };

  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "publish-content",
    catalogModule: "features/publish-content/agent-tools.ts",
    catalog: CATALOG_BY_ID as ReadonlyMap<string, AgentToolDefinition>,
    handlers,
    derivedRisk: publishContentDerivedRisk,
  });
}

export { publishContentDerivedRisk };

/**
 * Contributes the publishing tools to the assistant's catalog — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`.
 * @param options.buildPublishContentDeps - The HTTP importer's content-port projection, injected
 *   by server composition so this feature needs no server import. Explicit test ports also work.
 * @returns The existing publish-content domain, including its pull tools and risk map.
 * @example contributePublishContentTools({ buildPublishContentDeps: toPublishContentDeps });
 * @complexity O(1); registrations are built lazily by the contributor's build callback.
 */
export function contributePublishContentTools<TDeps extends PublishContentToolDeps = PublishContentToolDeps>(options: {
  buildPublishContentDeps?: (deps: TDeps) => PublishContentDeps;
} = {}): ToolContributor<TDeps, AssistantSurfaceDeps> {
  return { domain: "publish-content", risk: publishContentDerivedRisk, build: (deps, surfaces) => {
    const buildDeps = options.buildPublishContentDeps;
    return buildPublishContentRegistrations({ routeDeps: buildDeps ? { ...deps, makePublishContentDeps: () => buildDeps(deps) } : deps, surfaces });
  } };
}

/** A blank address uses the discovered site; other supplied types are input errors. */
async function connectSiteUrl(
  { input, findCandidate }: { input: Record<string, unknown>; findCandidate: () => Promise<string | null> },
  _options: Record<string, never> = {}
): Promise<string | null> {
  const supplied = input.siteUrl;
  if (supplied !== undefined && typeof supplied !== "string") {
    throw new ToolInputError({ message: "'siteUrl' must be a website address as a string when provided" });
  }
  return typeof supplied === "string" && supplied.trim() !== "" ? supplied : await findCandidate();
}

async function suppliedPullPeer(
  { deps, supplied }: { deps: PublishContentToolDeps; supplied: unknown },
  _options: Record<string, never> = {}
): Promise<string> {
  if (typeof supplied !== "string" || supplied.trim() === "") throw new ToolInputError({ message: "'peerId' must be a non-empty string when provided." });
  const saved = await deps.publishContentPeerRepo.findById({ workspaceId: deps.workspaceId, id: supplied });
  if (!saved) throw new ToolInputError({ message: `The saved destination '${supplied}' was not found. Choose a saved peerId or connect the live site again.` });
  return saved.id;
}

/** Choose only saved peers; ambiguity is reported rather than guessed. O(p) in saved peers. */
async function selectPullPeer({ deps, supplied }: { deps: PublishContentToolDeps; supplied: unknown }, _optional = {}): Promise<string> {
  if (supplied !== undefined) return suppliedPullPeer({ deps, supplied });
  const rows = await deps.publishContentPeerRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  if (rows.length === 0) throw new ToolInputError({ message: "No live destination is connected. Connect this computer with publish_content_connect, then plan the pull again." });
  const connectedRows = rows.filter(row => row.sealed === null);
  if (connectedRows.length <= 1) {
    const connected = selectConnectedDestination({ rows });
    if (connected) return connected.id;
    if (rows.length === 1) {
      const only = rows[0];
      if (only === undefined) throw new Error("Pull destination inventory has no sole row");
      return only.id;
    }
  }
  const choices = rows.map(row => `${row.id} (${row.label})`).join(", ");
  throw new ToolInputError({ message: `Several destinations are saved. Choose a peerId: ${choices}.` });
}

/** Fresh hooks from the same factory /import/plan and /import/execute use. O(1) projection. */
function pullHooks({ deps, bundleId, actorId }: { deps: PublishContentToolDeps; bundleId: string; actorId: string }, { forcedEntityKeys }: { forcedEntityKeys?: ReadonlySet<string> } = {}) {
  const contentDeps = deps.makePublishContentDeps?.() ?? {
    workspaceId: deps.workspaceId, clock: deps.clock, idGen: deps.idGen,
    ports: { ...(deps.publishContentPorts ?? {}), hooks: { beforeSave: deps.pluginBeforeSaveHook } }, outbox: deps.outbox,
  };
  return buildPublishContentImportHooks({
    workspaceId: deps.workspaceId, bundleId, actorId, clock: deps.clock, idGen: deps.idGen,
    publishContentDeps: { ...contentDeps, authorize: deps.authorize }, bundleRepo: deps.publishContentBundleRepo,
    baselineRepo: deps.publishContentBaselineRepo, blobStore: deps.blobStore, dbOps: deps.dbOps,
    restorePointsRepo: deps.restorePointsRepo, applyPort: deps.publishContentApplyPort,
    getSeedHash: deps.publishContentSeedHash, forcedEntityKeys,
  });
}

/** A refused planner result is a failure, never an empty successful plan. O(1). */
function acceptedPullReport(report: PublishContentReport): PublishContentReport {
  if (report.refused) throw new ToolInputError({ message: report.refusalReason ?? "The live content cannot be imported here." });
  return report;
}

/** Stable counts for plan, dialog and apply. Conflicts are returned separately for selection.
 * @complexity O(e) time and space for e report rows, including the temporary filtered arrays. */
function pullCounts(report: PublishContentReport): { create: number; update: number; unchanged: number; blocked: number } {
  return {
    create: report.rows.filter(row => row.outcome === "created").length,
    update: report.rows.filter(row => row.outcome === "applied" || row.outcome === "forced").length,
    unchanged: report.rows.filter(row => row.outcome === "unchanged").length,
    blocked: report.rows.filter(row => row.outcome === "blocked").length,
  };
}
/** Display label, falling back to the stable entity key when the imported entity has no title. */
function pullTitle(row: PublishContentReport["rows"][number]): string {
  return row.entityLabel ?? entityKey({ entityType: row.entityType, entityId: row.entityId });
}
/** Requires the staged bundle identifier; rejects malformed input with a model-readable error. */
function requiredPullBundleId({ value }: { value: unknown }, _optional = {}): string {
  if (typeof value !== "string" || value.trim() === "") throw new ToolInputError({ message: "'bundleId' must be a non-empty string." });
  return value;
}
/** Snapshot a bounded selection before drawing the confirmation card. O(k), at most 1000 keys. */
function pullOverwriteKeys({ value }: { value: unknown }, _optional = {}): ReadonlySet<string> {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.length > 1000 || !value.every(key => typeof key === "string" && key.trim() !== "")) {
    throw new ToolInputError({ message: "'overwriteEntityKeys' must be an array of at most 1000 non-empty strings." });
  }
  return new Set(value as string[]);
}

/** Translate known refusals for the model; unknown failures retain the normal executor redaction. */
async function pullToolBoundary<T>({ run }: { run: () => Promise<T> }, _optional = {}): Promise<T> {
  try { return await run(); } catch (error) {
    throw modelFacingPullError({ error });
  }
}

function modelFacingPullError({ error }: { error: unknown }, _options: Record<string, never> = {}): unknown {
  if (error instanceof PlanStaleError) return new ToolInputError({ message: "The local content changed after the dialog was shown. Run publish_content_execute_pull again to review a fresh plan." });
  if (error instanceof PublishContentBundleNotFoundError) return new ToolInputError({ message: "This pull plan was not found or has expired. Run publish_content_plan_pull again." });
  // The apply writes row by row, so the refusal names the item and says earlier items stay saved.
  if (error instanceof PluginHookFailedError) return toModelFacingPluginHookError({ err: error });
  if (error instanceof RestorePointUnavailableError) return new ToolInputError({ message: "This computer cannot capture a restore point. Pulling content is refused until backups are available." });
  if (error instanceof PublishContentPeerNotFoundError) {
    return new ToolInputError({ message: "The saved destination was removed. Choose a saved peerId or connect the live site again." });
  }
  if (error instanceof Error && [ForbiddenError, PublishTrustHandshakeError, PublishContentPeerTransportError, PublishContentPeerCredentialMissingError, PublishContentPeerSecretStoreUnconfiguredError].some((ErrorType) => error instanceof ErrorType)) return new ToolInputError({ message: error.message });
  return error;
}
