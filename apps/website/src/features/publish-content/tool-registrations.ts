import { nowIso, type Clock } from "@jini-ai/core/primitives";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import path from "node:path";

import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
// `ToolInputError` specifically — the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a
// rejection 400 rather than redacting it into a message-stripped 500. Same import, same reason, as
// `features/site-evidence/tool-registrations.ts`.
import { ToolInputError } from "@jini-ai/core";

import type { ToolContributor } from "#src/assistant/index";

import { humanConfirmedToolHandler, refuseUnexpectedKeys } from "../../contracts/core/human-confirm.js";
import { plan as gatewayPlan, confirm as gatewayConfirm, execute as gatewayExecute, ForbiddenError, PlanStaleError, type GatewayDeps } from "../../contracts/core/gated-mutations/gateway.js";
import { loadActiveBundle } from "./bundle-staging.js";
import { buildPublishContentImportHooks, PublishContentBundleNotFoundError, type BuildPublishContentImportHooksInput } from "./gated-hooks.js";
import { executePublishContentImport, RestorePointUnavailableError } from "./execute-import.js";
import { getPublishContentRunStatus, type PublishContentRunRepoPort } from "./run-repo.js";
import { entityKey, type PublishContentReport } from "./planner.js";
import { pullAndStageFromPeer, type PublishContentPullDeps } from "./pull.js";
import { PublishContentPeerNotFoundError, PublishContentPeerCredentialMissingError, PublishContentPeerSecretStoreUnconfiguredError } from "./peers.js";
import { PublishContentPeerTransportError } from "./peer-transport.js";
import type { AssistantSurfaceDeps } from "../../contracts/core/tool-surface-exchanges.js";
import {
  connectDestination,
  disconnectDestination,
  findCandidateDestination,
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
import { publishContentAgentToolCatalog, PUBLISH_CONTENT_CONNECT_TOOL_ID, PUBLISH_CONTENT_PLAN_PULL_TOOL_ID, PUBLISH_CONTENT_EXECUTE_PULL_TOOL_ID, PUBLISH_CONTENT_STATUS_TOOL_ID } from "./agent-tools.js";
import { connectAndRecordDestination } from "./connect-destination.js";
// Kept for its TYPE only — `PublishContentToolDeps.publishContentPeerHttpClient`/
// `siteAssistantSecretSealer`/`siteAssistantSecretKeyring` are still declared against
// `resolvePublishDestinationCredential`'s own parameter shape, even though S4 deleted the one runtime
// caller (`openDestination`, with `publish_content_publish`). Pruning the deps interface itself is out
// of this slice's scope.
import { resolvePublishDestinationCredential } from "./destination-credential.js";
import { normalizePeerBaseUrl } from "./peer-url.js";
import { selectConnectedDestination, type PublishContentPeerRecord, type PublishContentPeerRepoPort } from "./peers.js";
import { PUBLISH_CONTENT_APPLY_PERMISSION, PUBLISH_CONTENT_READ_PERMISSION } from "./permissions.js";
import { describePublishReadiness, siteLabelFor, type PublishReadiness } from "./publish-readiness.js";
import type { BeforeSaveHookPort } from "#src/features/post/index";
import type { OutboxPort } from "@jini-ai/cms/core";

import { listPublishContentContributors } from "./type-registry.js";
import type { PublishContentPorts, PublishContentDeps, EntryPublishPorts, WidgetPublishPorts } from "./type-registry.js";

/**
 * @file Wires publishing readiness, connection, and live-content pulls into the assistant catalog.
 * Pulls share the HTTP import hooks and the taxonomy tool's human confirmation transport.
 *
 * The catalog and the per-tool reasoning live in `agent-tools.ts`. This file is the wiring: the
 * permission each tool checks and the ports each handler reaches through.
 *
 * ## There is no `publish_content_publish` here
 *
 * `ADS-memory/.local-artifacts/publish-criteria-tool-webmcp-plan-2026-09-24.md` §0 deleted the chat
 * tool that used to hold its own call open for a human's Publish/Not now click through an MCP-UI
 * exchange. Publishing a bundle to a live site now happens exclusively through the admin **Publish
 * dialog** — the only surface that can also be reached by WebMCP, and the only one that already has
 * per-row selection, the re-plan consistency check and the session-only overwrite rule. The chat
 * assistant reaches that same dialog through the `admin.publish_content` capability
 * (`ui/criteria.ts`), which only opens it — it holds no reference to the dialog's confirm/execute
 * path, so nothing here (or in that capability) can cause a write without a person's own click.
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

/** Publish planning needs the complete contributor ports, including taxonomy import lookups.
 * Other tools' read-only repo slices cannot describe these capabilities; composition supplies the
 * same concrete ports it supplies to the HTTP importer. */
interface PublishContentToolSources {
  postRepo: PublishContentPorts["post"]["repo"];
  formDefinitionRepo: PublishContentPorts["form"]["repo"];
  contentTypeRepo: PublishContentPorts["content-type"]["repo"];
  contentTypeIndexProvisioner: PublishContentPorts["content-type"]["indexProvisioner"];
  taxonomyRepo: PublishContentPorts["taxonomy"]["taxonomies"];
  termRepo: PublishContentPorts["taxonomy"]["terms"];
  entryTermRepo: PublishContentPorts["taxonomy"]["entryTerms"];
  taxonomyRevisionRepo: PublishContentPorts["taxonomy"]["revisions"];
  stampWatermark: PublishContentPorts["taxonomy"]["stampWatermark"];
  entryRepo: EntryPublishPorts["entries"] & WidgetPublishPorts["entries"];
  entryRefsRepo: WidgetPublishPorts["entryRefs"];
  widgetBindingRepo: WidgetPublishPorts["bindings"];
  settingsRepo: PublishContentPorts["site-setting"]["settings"];
  principalRepo: PublishContentPorts["site-setting"]["principals"];
  presentationRepo: PublishContentPorts["active-theme"]["presentation"];
  themes: PublishContentPorts["active-theme"]["themes"];
}

export interface PublishContentToolDeps extends PublishContentPullDeps, PublishContentToolSources {
  gatedMutations: { gatewayDeps: GatewayDeps };
  publishContentBaselineRepo: BuildPublishContentImportHooksInput["baselineRepo"];
  publishContentRunRepo: PublishContentRunRepoPort;
  publishContentApplyPort: BuildPublishContentImportHooksInput["applyPort"];
  publishContentSeedHash?: BuildPublishContentImportHooksInput["getSeedHash"];
  restorePointsRepo: BuildPublishContentImportHooksInput["restorePointsRepo"];
  dbOps: BuildPublishContentImportHooksInput["dbOps"] & {
    getCapabilities(): Promise<{ restorePoint: { costClass: "cheap" | "expensive" | "unavailable" } }>;
  };
  /** Composition injects the SAME projection the HTTP importer uses, without a feature->server import. */
  makePublishContentDeps?: () => PublishContentDeps;
  workspaceId: string;
  authorize: PublishContentToolAuthorize;
  clock: Clock;
  idGen: { newId(): string };
  pluginBeforeSaveHook: BeforeSaveHookPort | undefined;
  outbox: OutboxPort | undefined;
  /** One-bag-per-type ports for callers supplying an explicit projection. Production uses
   *  makePublishContentDeps so pulls share the HTTP importer's complete projection. */
  publishContentPorts?: Partial<PublishContentPorts>;
  /** Needed by the shared production content projection for theme-file pulls. */
  fileBlobIndex: NonNullable<PublishContentPorts["theme-files"]["fileBlobIndex"]>;
  mediaRepo: PublishContentPorts["media"]["repo"];
  workspaceRepo: { findById(required: { id: string }): Promise<{ name?: string } | null> };
  publishContentPeerRepo: PublishContentPeerRepoPort;
  publishContentPeerHttpClient: Parameters<typeof resolvePublishDestinationCredential>[0]["httpClient"];
  siteAssistantSecretSealer: Parameters<typeof resolvePublishDestinationCredential>[0]["sealer"];
  siteAssistantSecretKeyring: Parameters<typeof resolvePublishDestinationCredential>[0]["keyring"];
  /** Test seam. Absent in production, where the committed-config port is composed below. */
  publishTrustProvisioning?: PublishTrustProvisioningPort;
  /** Test seam. Absent in production, where the repo's own deploy config is read. */
  findPublishCandidate?: () => Promise<string | null>;
}

type PublishContentToolAuthorize = Parameters<typeof requireToolPermission>[0]["authorize"];

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

/** The real deploy-config scan. Repo-relative, therefore resolved against
 *  {@link resolveCommittedConfigRoot} — the same resolution the HTTP route's own `findCandidate`
 *  uses, and NOT the bare process working directory (see that function's own doc for why: own-
 *  server mode's cwd is wherever opened Electron, not the repo root).
 *  @complexity O(1) plus up to four file reads. */
export function defaultFindCandidate(): Promise<string | null> {
  const repoRoot = resolveCommittedConfigRoot();
  return findCandidateDestination({ io: nodeProvisioningFileIo, resolvePath: (relative) => path.join(repoRoot, relative) });
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
export function plainSentence(text: string, fallback: string): string {
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
  const connected = selectConnectedDestination(rows);
  if (connected) return connected;
  return rows.length === 1 ? (rows[0] as PublishContentPeerRecord) : null;
}

/** Reads this install's publish readiness — the shared first step of both handlers.
 *  @complexity O(n) in the workspace's destination count. */
async function readReadiness(
  deps: PublishContentToolDeps,
  findCandidate: () => Promise<string | null>
): Promise<{ readiness: PublishReadiness; rows: readonly PublishContentPeerRecord[] }> {
  const rows = await deps.publishContentPeerRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  const connected = selectConnectedDestination(rows);
  const readiness = describePublishReadiness({
    connectedSiteLabel: connected ? connected.label : null,
    otherSiteLabels: rows.filter((row) => row.sealed !== null).map((row) => row.label),
    // Only consulted when nothing is connected, so the file read is skipped in the common case.
    candidateUrl: connected || rows.length > 0 ? null : await findCandidate(),
    publishableTypeCount: listPublishContentContributors().length,
  });
  return { readiness, rows };
}

/**
 * Wires readiness, connection and pull tools using explicit domain ports and human-bound surfaces.
 * Pull planning stores an expiring bundle; execution reaches the import gateway only after a click.
 * @returns Catalog registrations with independently derived write risk.
 * @example buildPublishContentRegistrations(deps, { surfaceExchanges });
 * @complexity O(t) for t catalog entries; handler I/O runs only when invoked.
 */
export function buildPublishContentRegistrations(
  routeDeps: PublishContentToolDeps,
  surfaces: AssistantSurfaceDeps
): ToolRegistration[] {
  const findCandidate = routeDeps.findPublishCandidate ?? defaultFindCandidate;
  const provisioning = routeDeps.publishTrustProvisioning ?? defaultProvisioning();

  const handlers: Record<string, ToolHandler> = {
    [PUBLISH_CONTENT_PLAN_PULL_TOOL_ID]: async ctx => pullToolBoundary(async () => {
      const input = requireInputRecord({ input: ctx.input });
      refuseUnexpectedKeys(input, ["peerId"]);
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: PUBLISH_CONTENT_APPLY_PERMISSION });
      const peerId = await selectPullPeer(routeDeps, input.peerId);
      const staged = await pullAndStageFromPeer(routeDeps, { peerId, principalId: ctx.principal.id });
      const planned = await gatewayPlan({ deps: routeDeps.gatedMutations.gatewayDeps, principalId: ctx.principal.id, principalKind: "agent", hooks: pullHooks(routeDeps, staged.bundleId, ctx.principal.id) });
      const report = acceptedPullReport(planned.details as PublishContentReport);
      // The bundle table has no source-label column. An existing audit row retains this display
      // metadata across tool calls/restarts; no cached plan is trusted at execute time.
      await routeDeps.publishContentRunRepo.save({
        id: staged.bundleId, workspaceId: routeDeps.workspaceId, direction: "import", phase: "planned",
        peerPrincipalId: ctx.principal.id, peerLabel: staged.peerLabel, actorId: ctx.principal.id,
        restorePointId: null, changeSetIdsJson: null, startedAt: nowIso({ clock: routeDeps.clock }), finishedAt: null,
        reportJson: JSON.stringify(report), itemsJson: null,
      });
      return { bundleId: staged.bundleId, expiresAt: staged.expiresAt, peerLabel: staged.peerLabel,
        counts: pullCounts(report), conflicts: report.rows.filter(row => row.canOverwrite).slice(0, 50).map(row => ({
          entityKey: entityKey(row.entityType, row.entityId), title: pullTitle(row), reason: row.reason,
        })), blobsUnavailable: staged.blobsUnavailable, blobsDeferred: staged.blobsDeferred };
    }),
    [PUBLISH_CONTENT_EXECUTE_PULL_TOOL_ID]: humanConfirmedToolHandler(surfaces, {
      flag: "executed",
      prepare: ctx => pullToolBoundary(async () => {
        const input = requireInputRecord({ input: ctx.input });
        refuseUnexpectedKeys(input, ["bundleId", "overwriteEntityKeys"]);
        const bundleId = requiredPullBundleId(input.bundleId);
        const overwriteKeys = pullOverwriteKeys(input.overwriteEntityKeys);
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: PUBLISH_CONTENT_APPLY_PERMISSION });
        const bundle = await loadActiveBundle({ repo: routeDeps.publishContentBundleRepo, workspaceId: routeDeps.workspaceId, id: bundleId, now: nowIso({ clock: routeDeps.clock }) });
        if (!bundle) throw new ToolInputError({ message: "This pull plan was not found or has expired. Run publish_content_plan_pull again." });
        if (bundle.sourcePrincipalId !== ctx.principal.id) throw new ToolInputError({ message: "This pull was planned by a different caller. Run publish_content_plan_pull for this conversation." });
        const audit = await routeDeps.publishContentRunRepo.findById({ workspaceId: routeDeps.workspaceId, id: bundleId });
        if (!audit || audit.phase !== "planned" || audit.actorId !== ctx.principal.id) throw new ToolInputError({ message: "This pull plan was not found or has expired. Run publish_content_plan_pull again." });
        const hooks = pullHooks(routeDeps, bundleId, ctx.principal.id, overwriteKeys);
        const planned = await gatewayPlan({ deps: routeDeps.gatedMutations.gatewayDeps, principalId: ctx.principal.id, principalKind: "agent", hooks });
        const report = acceptedPullReport(planned.details as PublishContentReport);
        const knownKeys = new Set(report.rows.map(row => entityKey(row.entityType, row.entityId)));
        for (const key of overwriteKeys) if (!knownKeys.has(key)) throw new ToolInputError({ message: `'${key}' is not in this pull plan. Use entity keys returned by publish_content_plan_pull.` });
        return { hooks, planned, report, peerLabel: audit.peerLabel ?? "Live site" };
      }),
      dialog: ({ report, peerLabel }) => ({
        toolId: PUBLISH_CONTENT_EXECUTE_PULL_TOOL_ID, errorCode: "PUBLISH_CONTENT", title: "Pull live content to this computer?",
        description: `Copy content from ${peerLabel} into this local site.`,
        details: [
          { label: "Live site", value: peerLabel },
          ...Object.entries(pullCounts(report)).map(([key, count]) => ({ label: key[0]!.toUpperCase() + key.slice(1), value: String(count) })),
          ...report.rows.filter(row => row.outcome === "applied" || row.outcome === "forced").map(row => ({ label: "Overwrite local item", value: pullTitle(row) })),
          ...report.rows.filter(row => row.retires !== null && row.writes).map(row => ({ label: "Move to Trash", value: row.retires!.entityLabel ?? row.retires!.entityId })),
        ],
        warning: "The listed local items will be overwritten. A restore point is captured before applying changes.",
        danger: true, confirmLabel: "Apply pull",
      }),
      run: (ctx, { hooks, planned }, confirmer) => pullToolBoundary(async () => {
        const token = await gatewayConfirm({ deps: routeDeps.gatedMutations.gatewayDeps, principalId: confirmer.id, principalKind: confirmer.kind, hooks, planId: planned.planId, planHash: planned.planHash });
        // As on /import/execute, check restore capability outside the shared gateway; it still
        // re-authorizes, checks the human-bound token and re-derives the plan before any write.
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: PUBLISH_CONTENT_APPLY_PERMISSION });
        const capabilities = await routeDeps.dbOps.getCapabilities();
        const applied = await executePublishContentImport({ workspaceId: routeDeps.workspaceId, costClass: capabilities.restorePoint.costClass,
          gatewayExecute: () => gatewayExecute({ deps: routeDeps.gatedMutations.gatewayDeps, principalId: ctx.principal.id, principalKind: "agent", hooks, confirmationToken: token.confirmationToken }),
        });
        const status = await getPublishContentRunStatus(routeDeps.publishContentRunRepo, { workspaceId: routeDeps.workspaceId, runId: applied.runId });
        if (!status?.report) throw new ToolInputError({ message: "The pull ran, but its report could not be loaded. Check import history before retrying." });
        // Use the persisted APPLY report, including any optimistic-concurrency downgrades.
        return { executed: true, counts: pullCounts(status.report), entities: status.report.rows.map(row => ({ entityKey: entityKey(row.entityType, row.entityId), title: pullTitle(row), outcome: row.outcome, reason: row.reason })) };
      }),
    }),
    [PUBLISH_CONTENT_STATUS_TOOL_ID]: async (ctx) => {
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: PUBLISH_CONTENT_READ_PERMISSION });
      const { readiness } = await readReadiness(routeDeps, findCandidate);
      return readiness;
    },

    [PUBLISH_CONTENT_CONNECT_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: PUBLISH_CONTENT_APPLY_PERMISSION });

      const supplied = input.siteUrl;
      if (supplied !== undefined && typeof supplied !== "string") {
        throw new ToolInputError({ message: "'siteUrl' must be a website address as a string when provided" });
      }
      const raw = typeof supplied === "string" && supplied.trim() !== "" ? supplied : await findCandidate();
      if (raw === null) {
        // The never-deployed install. An ordinary empty state, reported as a result rather than
        // thrown, so the model can relay the sentence instead of a failure.
        return {
          connected: false,
          message: "There is no live site to publish to yet.",
          nextStep: "Put this site online once, then come back and connect this computer to it.",
        };
      }

      const normalized = normalizePeerBaseUrl(raw);
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
            repo: routeDeps.publishContentPeerRepo,
            clock: routeDeps.clock,
            idGen: routeDeps.idGen,
            connectGrant: (connectInput) => connectDestination(trustDeps, connectInput),
            reverseGrant: () => disconnectDestination(trustDeps),
          },
          { workspaceId: routeDeps.workspaceId, baseUrl: normalized.baseUrl, entityTypes }
        );

        return {
          connected: true,
          message: `This computer publishes to ${site.label}.`,
          nextStep: plainSentence(grant.nextStep, "Put this site online once more for the change to take effect."),
        };
      } catch (err) {
        if (err instanceof PublishTrustHandshakeError) {
          return {
            connected: false,
            message: plainSentence(
              err.message,
              `${siteLabelFor(normalized.baseUrl)} could not be reached, or it is not a site this can publish to.`
            ),
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
    },
  };

  return buildDomainRegistrations({
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
export function contributePublishContentTools(options: {
  buildPublishContentDeps?: (deps: Parameters<ToolContributor["build"]>[0]) => PublishContentDeps;
} = {}): ToolContributor {
  return { domain: "publish-content", risk: publishContentDerivedRisk, build: (deps, surfaces) => {
    const buildDeps = options.buildPublishContentDeps;
    return buildPublishContentRegistrations(buildDeps ? { ...deps, makePublishContentDeps: () => buildDeps(deps) } : deps, surfaces);
  } };
}

/** Choose only saved peers; ambiguity is reported rather than guessed. O(p) in saved peers. */
async function selectPullPeer(deps: PublishContentToolDeps, supplied: unknown): Promise<string> {
  if (supplied !== undefined) {
    if (typeof supplied !== "string" || supplied.trim() === "") throw new ToolInputError({ message: "'peerId' must be a non-empty string when provided." });
    const saved = await deps.publishContentPeerRepo.findById({ workspaceId: deps.workspaceId, id: supplied });
    if (!saved) throw new ToolInputError({ message: `The saved destination '${supplied}' was not found. Choose a saved peerId or connect the live site again.` });
    return saved.id;
  }
  const rows = await deps.publishContentPeerRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  if (rows.length === 0) throw new ToolInputError({ message: "No live destination is connected. Connect this computer with publish_content_connect, then plan the pull again." });
  const connectedRows = rows.filter(row => row.sealed === null);
  if (connectedRows.length <= 1) {
    const connected = selectConnectedDestination(rows);
    if (connected) return connected.id;
    if (rows.length === 1) return rows[0]!.id;
  }
  throw new ToolInputError({ message: `Several destinations are saved. Choose a peerId: ${rows.map(row => `${row.id} (${row.label})`).join(", ")}.` });
}

/** Fresh hooks from the same factory /import/plan and /import/execute use. O(1) projection. */
function pullHooks(deps: PublishContentToolDeps, bundleId: string, actorId: string, forcedEntityKeys?: ReadonlySet<string>) {
  const contentDeps = deps.makePublishContentDeps?.() ?? {
    workspaceId: deps.workspaceId, clock: deps.clock, idGen: deps.idGen,
    ports: deps.publishContentPorts ?? {}, outbox: deps.outbox, beforeSaveHook: deps.pluginBeforeSaveHook,
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
  return row.entityLabel ?? entityKey(row.entityType, row.entityId);
}
/** Requires the staged bundle identifier; rejects malformed input with a model-readable error. */
function requiredPullBundleId(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw new ToolInputError({ message: "'bundleId' must be a non-empty string." });
  return value;
}
/** Snapshot a bounded selection before drawing the confirmation card. O(k), at most 1000 keys. */
function pullOverwriteKeys(value: unknown): ReadonlySet<string> {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.length > 1000 || !value.every(key => typeof key === "string" && key.trim() !== "")) {
    throw new ToolInputError({ message: "'overwriteEntityKeys' must be an array of at most 1000 non-empty strings." });
  }
  return new Set(value as string[]);
}

/** Translate known refusals for the model; unknown failures retain the normal executor redaction. */
async function pullToolBoundary<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (error) {
    if (error instanceof PlanStaleError) throw new ToolInputError({ message: "The local content changed after the dialog was shown. Run publish_content_execute_pull again to review a fresh plan." });
    if (error instanceof PublishContentBundleNotFoundError) throw new ToolInputError({ message: "This pull plan was not found or has expired. Run publish_content_plan_pull again." });
    if (error instanceof RestorePointUnavailableError) throw new ToolInputError({ message: "This computer cannot capture a restore point. Pulling content is refused until backups are available." });
    if (error instanceof PublishContentPeerNotFoundError) {
      throw new ToolInputError({ message: "The saved destination was removed. Choose a saved peerId or connect the live site again." });
    }
    if (error instanceof ForbiddenError || error instanceof PublishTrustHandshakeError || error instanceof PublishContentPeerTransportError || error instanceof PublishContentPeerCredentialMissingError || error instanceof PublishContentPeerSecretStoreUnconfiguredError) throw new ToolInputError({ message: error.message });
    throw error;
  }
}
