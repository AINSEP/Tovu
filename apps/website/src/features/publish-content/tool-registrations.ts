import path from "node:path";

import { computeBlobStorageKey } from "@jini-ai/cms/media";
import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
// `ToolInputError` specifically — the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a
// rejection 400 rather than redacting it into a message-stripped 500. Same import, same reason, as
// `features/site-evidence/tool-registrations.ts`.
import { ToolInputError } from "@jini-ai/core";

import type { ToolContributor } from "#src/assistant/index";

import {
  resolveConfirmationDecision,
  type AssistantSurfaceDeps,
  type SurfaceExchange,
} from "../../contracts/core/tool-surface-exchanges.js";
import {
  connectDestination,
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

import {
  publishContentAgentToolCatalog,
  PUBLISH_CONTENT_CONNECT_TOOL_ID,
  PUBLISH_CONTENT_PUBLISH_TOOL_ID,
  PUBLISH_CONTENT_STATUS_TOOL_ID,
  type AgentToolDefinition,
} from "./agent-tools.js";
import { resolvePublishDestinationCredential } from "./destination-credential.js";
import { buildExportBundle } from "./export-bundle.js";
import {
  confirmPeerImport,
  executePeerImport,
  pushBundleToPeer,
  PublishContentPeerTransportError,
} from "./peer-transport.js";
import { normalizePeerBaseUrl } from "./peer-url.js";
import {
  saveConnectedDestination,
  selectConnectedDestination,
  PublishContentPeerCredentialMissingError,
  PublishContentPeerNotFoundError,
  PublishContentPeerSecretStoreUnconfiguredError,
  type PublishContentPeerRecord,
  type PublishContentPeerRepoPort,
} from "./peers.js";
import { PUBLISH_CONTENT_APPLY_PERMISSION, PUBLISH_CONTENT_READ_PERMISSION } from "./permissions.js";
import type { PublishContentOutcomeRow } from "./planner.js";
import {
  buildPublishConfirmationResource,
  countPublishChanges,
  describePublishChanges,
  publishWouldChangeNothing,
} from "./publish-confirmation-ui.js";
import { describePublishReadiness, siteLabelFor, type PublishReadiness } from "./publish-readiness.js";
import { listPublishContentContributors } from "./type-registry.js";
import type { PublishContentDeps } from "./type-registry.js";

/**
 * @file Wires publishing into the assistant's tool catalog: the three tools that make "is my site
 * set up to publish, and if not, fix it, and then publish it" answerable by an assistant instead of
 * by a person who has to learn what a key is.
 *
 * The catalog and the per-tool reasoning live in `agent-tools.ts`. This file is the wiring: the
 * permission each tool checks, the ports each handler reaches through, and the one place the
 * gated-mutation confirmation rule is honoured.
 *
 * ## The confirmation rule, stated once
 *
 * `contracts/core/gated-mutations/gateway.ts` refuses to mint a confirmation for an `agent`
 * principal (AC-12): confirming is a human act, and an agent may only redeem what a human already
 * confirmed. A push does not run that gateway HERE — the destination runs its own, and sees this
 * install as a publishing credential rather than as an agent, so nothing on the wire would stop an
 * assistant from confirming its own publish. That is exactly why `publish_content_publish` asks a
 * person itself, through a held-open MCP-UI exchange (`publish-confirmation-ui.ts`), and treats the
 * absence of that channel as a refusal rather than as permission to proceed. The model cannot
 * answer its own dialog: the only channel that resolves the exchange is a browser POST to
 * `assistant/mcp-ui-tool-calls-route.ts`, behind the daemon's bearer gate and an admin session.
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
  // -> connectDestination(): one round trip to the destination, then a write to committed config
  //    and one row in this workspace's destination list.
  [PUBLISH_CONTENT_CONNECT_TOOL_ID, "mutates-durable-state"],
  // -> executePeerImport(): the destination applies the bundle. The heaviest write in this domain.
  [PUBLISH_CONTENT_PUBLISH_TOOL_ID, "mutates-durable-state"],
]);

const CATALOG_BY_ID = indexCatalogById(publishContentAgentToolCatalog);

/** The fields these three tools need. Everything but the last two is already on `RouteDeps`. */
export interface PublishContentToolDeps {
  workspaceId: string;
  authorize: PublishContentToolAuthorize;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  postRepo: PublishContentDeps["postRepo"];
  pluginBeforeSaveHook: PublishContentDeps["beforeSaveHook"];
  outbox: PublishContentDeps["outbox"];
  mediaRepo: PublishContentDeps["mediaRepo"];
  assetBlobRepo: PublishContentDeps["assetBlobRepo"];
  blobStore: PublishContentDeps["blobStore"];
  workspaceRepo: { findById(id: string): Promise<{ name?: string } | null> };
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
function defaultProvisioning(): PublishTrustProvisioningPort {
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
function defaultFindCandidate(): Promise<string | null> {
  const repoRoot = resolveCommittedConfigRoot();
  return findCandidateDestination({ io: nodeProvisioningFileIo, resolvePath: (relative) => path.join(repoRoot, relative) });
}

/**
 * Projects the tool deps onto the shape every registered publish-content contributor reads.
 *
 * A structural copy of `routes/publish-content/deps.ts`'s `toPublishContentDeps`, which a feature
 * may not import. It cannot silently drift: the declared return type is `PublishContentDeps`, so a
 * field added there fails this function to compile.
 *
 * @complexity O(1).
 */
function toPublishContentDeps(deps: PublishContentToolDeps): PublishContentDeps {
  return {
    workspaceId: deps.workspaceId,
    postRepo: deps.postRepo,
    clock: deps.clock,
    idGen: deps.idGen,
    outbox: deps.outbox,
    beforeSaveHook: deps.pluginBeforeSaveHook,
    mediaRepo: deps.mediaRepo,
    assetBlobRepo: deps.assetBlobRepo,
    blobStore: deps.blobStore,
  } as PublishContentDeps;
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

/** Reads this install's publish readiness — the shared first step of all three handlers.
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

/** The destination's plan rows, or `null` when the peer's report was not the shape this instance
 *  understands. Narrowed rather than cast: `PushBundleResult.plan.details` is `unknown` by design
 *  (it crossed a network), and a plan we cannot count is not a plan we may ask a person to approve.
 *  @complexity O(1). */
function readPlanRows(details: unknown): { refused: boolean; rows: readonly PublishContentOutcomeRow[] } | null {
  if (typeof details !== "object" || details === null) return null;
  const record = details as Record<string, unknown>;
  if (typeof record.refused !== "boolean") return null;
  if (!Array.isArray(record.rows)) return null;
  return { refused: record.refused, rows: record.rows as readonly PublishContentOutcomeRow[] };
}

export function buildPublishContentRegistrations(
  routeDeps: PublishContentToolDeps,
  surfaces: AssistantSurfaceDeps
): ToolRegistration[] {
  const findCandidate = routeDeps.findPublishCandidate ?? defaultFindCandidate;
  const provisioning = routeDeps.publishTrustProvisioning ?? defaultProvisioning();

  const handlers: Record<string, ToolHandler> = {
    [PUBLISH_CONTENT_STATUS_TOOL_ID]: async (ctx) => {
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: PUBLISH_CONTENT_READ_PERMISSION,
      });
      const { readiness } = await readReadiness(routeDeps, findCandidate);
      return readiness;
    },

    [PUBLISH_CONTENT_CONNECT_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: PUBLISH_CONTENT_APPLY_PERMISSION,
      });

      const supplied = input.siteUrl;
      if (supplied !== undefined && typeof supplied !== "string") {
        throw new ToolInputError("'siteUrl' must be a website address as a string when provided");
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
        const connected = await connectDestination(
          {
            httpClient: routeDeps.publishContentPeerHttpClient,
            keyring: routeDeps.siteAssistantSecretKeyring,
            provisioning,
            clock: routeDeps.clock,
            workspaceId: routeDeps.workspaceId,
          },
          { baseUrl: normalized.baseUrl, entityTypes }
        );

        const site = await saveConnectedDestination(
          { repo: routeDeps.publishContentPeerRepo, clock: routeDeps.clock, idGen: routeDeps.idGen },
          {
            workspaceId: routeDeps.workspaceId,
            label: siteLabelFor(connected.baseUrl),
            baseUrl: connected.baseUrl,
            remoteWorkspaceId: connected.identity.workspaceId,
          }
        );

        return {
          connected: true,
          message: `This computer publishes to ${site.label}.`,
          nextStep: plainSentence(connected.nextStep, "Put this site online once more for the change to take effect."),
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

    [PUBLISH_CONTENT_PUBLISH_TOOL_ID]: async (ctx) => {
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: PUBLISH_CONTENT_APPLY_PERMISSION,
      });

      const { readiness, rows } = await readReadiness(routeDeps, findCandidate);
      if (!readiness.ready) {
        return { published: false, ...readiness };
      }

      const destination = chooseDestination(rows);
      if (destination === null) {
        return {
          published: false,
          message: `This computer can publish to more than one site: ${rows.map((row) => row.label).join(", ")}.`,
          nextStep: "Ask which one to publish to, then publish from that site's own page.",
        };
      }

      // Fail closed rather than degrade. Without a channel to a person there is nobody to approve
      // writing to a live site, and an unattended publish is the one outcome this tool must never
      // produce — the same posture `content_post_delete` takes for the same reason.
      if (!ctx.emitSurface) {
        throw new ToolInputError(
          "Publishing needs someone present to say yes before anything is written to the live site, " +
            "and this session has no way to ask them. Nothing was published."
        );
      }

      // Media bytes travel on the same push. A composition with no blob store could publish text
      // and silently drop every image, so it refuses instead — the fail-closed reading.
      const blobSource = routeDeps.blobStore;
      if (!blobSource) {
        throw new ToolInputError(
          "This site is not set up to send its images and files, so publishing would leave them behind. " +
            "Nothing was published."
        );
      }

      const peer = await openDestination(routeDeps, destination.id);
      const workspace = await routeDeps.workspaceRepo.findById(routeDeps.workspaceId);
      const bundle = await buildExportBundle({
        workspaceId: routeDeps.workspaceId,
        principalId: ctx.principal.id,
        authorize: routeDeps.authorize,
        publishContentDeps: toPublishContentDeps(routeDeps),
        sourceLabel: workspace?.name ?? routeDeps.workspaceId,
      });

      const pushed = await pushBundleToPeer(
        {
          ...peer,
          blobSource,
          computeStorageKey: (sha256) => computeBlobStorageKey({ workspaceId: routeDeps.workspaceId, sha256 }),
        },
        { bundle }
      );

      const planId = pushed.plan.planId;
      const planHash = pushed.plan.planHash;
      const plan = readPlanRows(pushed.plan.details);
      if (plan === null || typeof planId !== "string" || typeof planHash !== "string") {
        return {
          published: false,
          message: `${destination.label} answered in a way this could not read, so nothing was published.`,
          nextStep: "Try again in a moment.",
        };
      }
      if (plan.refused) {
        return {
          published: false,
          message: `${destination.label} would not accept this, so nothing was published.`,
          nextStep: "Try connecting this computer to the site again, then publish.",
        };
      }

      const counts = countPublishChanges(plan.rows);
      if (publishWouldChangeNothing(counts)) {
        // Nothing would be written, so there is nothing to ask about. Spending the one question
        // this design gets to ask on a no-op is how people learn to click through the real ones.
        return { published: false, message: describePublishChanges(counts, destination.label), nextStep: null, counts };
      }

      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: PUBLISH_CONTENT_PUBLISH_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface
      );
      const ui = buildPublishConfirmationResource({
        siteLabel: destination.label,
        counts,
        planId,
        exchangeId: exchange.id,
      });

      // A cancelled run must not leave a dialog holding a call nobody is listening to, nor hold
      // this handler open until the idle deadline.
      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        const outcome = await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
        if (!outcome.confirmed) {
          return {
            published: false,
            message:
              outcome.reason === "declined"
                ? `Nothing was published. ${destination.label} is unchanged.`
                : `Nobody answered, so nothing was published. ${destination.label} is unchanged.`,
            nextStep: outcome.reason === "declined" ? null : "Ask again when they are ready.",
            counts,
          };
        }

        // The human has just answered. Only now is there a confirmation to relay — and it is the
        // destination's own gateway that mints it, against this install's publishing credential.
        // Nothing here asserts a principal kind over the wire, so nothing here can weaken the rule
        // that an agent may not confirm on a person's behalf.
        const { confirmationToken } = await confirmPeerImport(peer, { planId, planHash });
        await executePeerImport(peer, { bundleId: pushed.bundleId, confirmationToken });

        return {
          published: true,
          message: `Published to ${destination.label}. ${describePublishChanges(counts, destination.label)}`,
          nextStep: null,
          counts,
        };
      } catch (err) {
        if (err instanceof PublishContentPeerTransportError) {
          return {
            published: false,
            message: `${destination.label} could not be reached, so nothing was published.`,
            nextStep: "Check that the site is online, then try publishing again.",
            counts,
          };
        }
        throw err;
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
        exchange.close();
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

/** Opens the per-request transport bag for one destination, through the SAME resolver the HTTP push
 *  route uses — so a connected destination and a hand-configured one arrive identically and this
 *  file cannot tell them apart.
 *  @complexity O(1) plus one repo read and either one AEAD open or one handshake. */
async function openDestination(
  deps: PublishContentToolDeps,
  destinationId: string
): Promise<{
  credential: Awaited<ReturnType<typeof resolvePublishDestinationCredential>>;
  httpClient: PublishContentToolDeps["publishContentPeerHttpClient"];
}> {
  try {
    const credential = await resolvePublishDestinationCredential(
      {
        repo: deps.publishContentPeerRepo,
        sealer: deps.siteAssistantSecretSealer,
        keyring: deps.siteAssistantSecretKeyring,
        httpClient: deps.publishContentPeerHttpClient,
      },
      { workspaceId: deps.workspaceId, id: destinationId }
    );
    return { credential, httpClient: deps.publishContentPeerHttpClient };
  } catch (err) {
    if (
      err instanceof PublishContentPeerNotFoundError ||
      err instanceof PublishContentPeerCredentialMissingError ||
      err instanceof PublishContentPeerSecretStoreUnconfiguredError
    ) {
      throw new ToolInputError(
        "This computer is no longer set up to publish to that site. Nothing was published. " +
          "Connect this computer to the site again, then publish."
      );
    }
    throw err;
  }
}

export { publishContentDerivedRisk };

/**
 * Contributes the three publishing tools to the assistant's catalog — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`.
 */
export function contributePublishContentTools(): ToolContributor {
  return { domain: "publish-content", build: buildPublishContentRegistrations, risk: publishContentDerivedRisk };
}
