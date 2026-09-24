import { bytesMatchSha256 } from "./blob-staging.js";
import { peerHostname, peerUrl } from "./peer-url.js";
import type { PublishContentExportEnvelope } from "./export-bundle.js";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "./artifact-format.js";
import { EgressRefusedError, type HttpClientPort } from "#src/platform/http/index";
import type { ResolvedPeerCredential } from "./peers.js";
import type { PackedEntity } from "./type-registry.js";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.6/§4 task 10.
 *
 * The outbound leg: this instance dialling ANOTHER Tovu's publish-content routes over the guarded
 * ADR-038 `HttpClientPort`. Two directions, one importer:
 *
 * - PUSH ({@link pushBundleToPeer} -> {@link confirmPeerImport} -> {@link executePeerImport}):
 *   builds a bundle here, uploads the blobs the peer is missing, stages it there, then drives the
 *   peer's OWN gated `plan`/`confirm`/`execute` ceremony. Every safety property (PLAN_STALE,
 *   single-redemption tokens, "an agent may never confirm", the restore point) is enforced on the
 *   DESTINATION, by the code that owns the destination's data — this driver only relays.
 * - PULL ({@link pullBundleFromPeer}): fetches the peer's export envelope and stages it HERE, so
 *   this instance's own already-built `/import/plan|confirm|execute` runs `planImport` against it.
 *   One importer, two directions — a pull adds no second classification path.
 *
 * ## Vendor neutrality (plan §0b — this file is the one place Task 10 could regress it)
 *
 * A peer is a URL plus a sealed key. Nothing here knows or asks what runs underneath: no app name,
 * no project id, no region, no platform API, and no reference to any single host's CLI or config
 * file. (Stated in the abstract deliberately: plan §0b's own guard is a grep for those literal
 * platform tokens across this directory, and a comment naming them to disclaim them would trip it.)
 * The private-network question is not answered with a Fly-shaped assumption either — it is
 * delegated whole to ADR-038's `EgressPolicy.denyPrivateAddresses` + `devHostAllowlist`, which
 * classify the RESOLVED address, so Railway's and Render's internal DNS names and an AWS VPC
 * address are handled by exactly the same code path with no per-platform branch.
 *
 * ## The credential
 *
 * The opened key exists only as the `Authorization` header of one in-flight request. It is never
 * logged, never placed in a URL (`HttpClientPort` rejects credentials-in-URL outright), never
 * returned in a result, and never interpolated into an error message — {@link toTransportError} is
 * the single funnel every failure here passes through, and it is built from the RESPONSE, never
 * from the request. `client.ts` additionally strips `Authorization` on any cross-origin redirect,
 * and this feature's policy sets `maxRedirects: 0` so there is no redirect hop at all.
 */

/** Machine-readable failure classes a peer call can produce. Distinct codes, because a route maps
 *  each to a different HTTP status and an operator acts on each differently. */
export type PeerTransportErrorCode =
  | "EGRESS_REFUSED"
  | "PEER_UNREACHABLE"
  | "PEER_REJECTED"
  | "PEER_RESPONSE_INVALID"
  /** The operator ticked "Overwrite on live" but the peer doesn't advertise `"overwrite-live"`. */
  | "PEER_CANNOT_OVERWRITE";

/** The single error type every failure in this module surfaces as. `message` is operator-facing and
 *  is built from the peer's RESPONSE plus this instance's own diagnosis — never from the request,
 *  so a credential has no path into it. */
export class PublishContentPeerTransportError extends Error {
  readonly code: PeerTransportErrorCode;
  /** The peer's HTTP status, when there was one. Absent for a refusal or an unreachable host. */
  readonly peerStatus?: number;

  constructor(message: string, code: PeerTransportErrorCode, options: { peerStatus?: number } = {}) {
    super(message);
    this.name = "PublishContentPeerTransportError";
    this.code = code;
    if (options.peerStatus !== undefined) this.peerStatus = options.peerStatus;
  }
}

/** How much of a peer's error body is quoted back to the operator. A peer's own error text is
 *  genuinely useful ("workspace was not found" tells you `remoteWorkspaceId` is wrong), but it is
 *  another process's output, so it is bounded rather than trusted to be small. */
const MAX_QUOTED_PEER_BODY = 400;

/**
 * Turns an `EgressRefusedError` into the operator diagnosis this task's brief requires: a message
 * that NAMES `devHostAllowlist` and the exact hostname to add, rather than reading as a generic
 * network error.
 *
 * Why every refusal reaching here is a private-address refusal, by construction — this is the
 * reasoning that lets this function state the cause instead of pattern-matching the message text
 * (which would be fragile and would silently degrade if the wording changed):
 * `client.ts`'s `assertAllowedTarget` refuses exactly three things — a scheme outside
 * `allowedSchemes`, credentials embedded in the URL, and (via `assertNoPrivateAddress`) a
 * non-public resolved address. `normalizePeerBaseUrl` has already refused a non-https URL and a
 * URL carrying userinfo before any peer row could be written, and the peer policy sets
 * `maxRedirects: 0`, so no redirect hop can introduce either. Only the third refusal is reachable.
 *
 * The underlying error's own `callerSafeMessage` is used, never `message`: `message` names the
 * resolved ADDRESS, and echoing that to an operator-facing surface lets a caller who can name any
 * host map internal DNS one request at a time (`errors.ts`'s own reasoning).
 *
 * @complexity O(n) in the base URL length.
 */
export function describePeerEgressRefusal(err: EgressRefusedError, baseUrl: string): PublishContentPeerTransportError {
  const hostname = peerHostname(baseUrl);
  return new PublishContentPeerTransportError(
    `${err.callerSafeMessage}. '${hostname}' resolves to a private address, so this peer is unreachable ` +
      `until it is added to this deployment's EgressPolicy devHostAllowlist ` +
      `(TOVU_PUBLISH_CONTENT_DEV_HOSTS, a comma-separated list of hostnames — add '${hostname}'). ` +
      `This is a deliberate SSRF guard, not a network fault.`,
    "EGRESS_REFUSED"
  );
}

/**
 * The single funnel every peer-call failure passes through.
 *
 * @complexity O(1).
 */
function toTransportError(err: unknown, baseUrl: string): PublishContentPeerTransportError {
  if (err instanceof PublishContentPeerTransportError) return err;
  if (err instanceof EgressRefusedError) return describePeerEgressRefusal(err, baseUrl);
  return new PublishContentPeerTransportError(
    `the peer at '${peerHostname(baseUrl)}' could not be reached: ${err instanceof Error ? err.message : String(err)}`,
    "PEER_UNREACHABLE"
  );
}

/** Per-request timeout for a peer call. A bundle POST is the slow one; 60 s is generous for an API
 *  call and still bounded, so a wedged peer cannot hold an admin request open indefinitely. */
export const PEER_REQUEST_TIMEOUT_MS = 60_000;

/** The narrow blob-read seam the push driver needs — `BlobStorePort`'s read half only, so this
 *  module can never write a blob. */
export interface PeerBlobSource {
  exists(input: { storageKey: string }): Promise<boolean>;
  get(input: { storageKey: string }): Promise<Uint8Array>;
}

export interface PeerCallDeps {
  readonly httpClient: HttpClientPort;
  readonly credential: ResolvedPeerCredential;
}

/**
 * One authenticated JSON call to a peer route.
 *
 * @param path - An absolute route path on the peer, already carrying the peer's OWN workspace id.
 * @returns The parsed JSON body.
 * @throws {PublishContentPeerTransportError} for every failure class — see {@link toTransportError}.
 * @complexity O(1) plus one network round trip and one JSON parse of the response.
 */
async function callPeer(
  deps: PeerCallDeps,
  request: { method: "GET" | "POST" | "PUT"; path: string; body?: unknown }
): Promise<unknown> {
  const { baseUrl, apiKey } = deps.credential;
  let response;
  try {
    response = await deps.httpClient.send({
      method: request.method,
      url: peerUrl(baseUrl, request.path),
      headers: {
        // The ONE place the resolved credential is used, and it is deliberately incurious about
        // which kind it got. Two reach here (`features/publish-content/destination-credential.ts`):
        // an explicitly-configured peer's API key, which `dev-auth.ts`'s
        // `API_KEY_AUTHORIZATION_PATTERN` accepts as `Bearer <raw-key>` and whose grants come from
        // its own issuance snapshot (plan §1.2); and a connected destination's short-lived
        // publishing session token, which the destination's `requirePublishTrust` gate recognises
        // ahead of the admin session gate. Both are `Bearer <opaque>` on the wire, so there is
        // still no transport-specific auth mechanism here to get wrong.
        authorization: `Bearer ${apiKey}`,
        ...(request.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      timeoutMs: PEER_REQUEST_TIMEOUT_MS,
    });
  } catch (err) {
    throw toTransportError(err, baseUrl);
  }

  if (response.status < 200 || response.status >= 300) {
    throw new PublishContentPeerTransportError(
      `the peer refused ${request.method} ${request.path} with HTTP ${response.status}: ` +
        `${response.bodyText.slice(0, MAX_QUOTED_PEER_BODY)}`,
      "PEER_REJECTED",
      { peerStatus: response.status }
    );
  }

  try {
    return JSON.parse(response.bodyText);
  } catch {
    throw new PublishContentPeerTransportError(
      `the peer's response to ${request.method} ${request.path} was not JSON — is '${peerHostname(baseUrl)}' a Tovu instance?`,
      "PEER_RESPONSE_INVALID"
    );
  }
}

/** Builds a peer route path under the peer's OWN workspace id. Never this instance's — a peer's
 *  workspace id is stored on the row precisely because the two are unrelated identifiers.
 *  @complexity O(1). */
function peerRoute(credential: ResolvedPeerCredential, suffix: string): string {
  return `/api/admin/v1/workspaces/${encodeURIComponent(credential.remoteWorkspaceId)}/publish-content${suffix}`;
}

/** @complexity O(1). */
function requireObject(value: unknown, what: string, baseUrl: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PublishContentPeerTransportError(
      `the peer's ${what} response was not an object — is '${peerHostname(baseUrl)}' a Tovu instance?`,
      "PEER_RESPONSE_INVALID"
    );
  }
  return value as Record<string, unknown>;
}

/** One entity type this bundle held that the peer's own S-F1 capability probe said it cannot
 *  accept — see {@link PushBundleResult.notSupportedByLive}. */
export interface NotSupportedByLiveEntry {
  readonly entityType: string;
  readonly count: number;
}

export interface PushBundleResult {
  /** The bundle id the PEER minted for the staged bundle — required again at execute. */
  readonly bundleId: string;
  /** Blob sha256s actually uploaded on this push (the peer already had the rest). */
  readonly blobsUploaded: readonly string[];
  /** Blob sha256s the peer was missing and this instance does not hold either — every entity that
   *  requires one will be `blocked` by the peer's own planner, which is the fail-closed outcome. */
  readonly blobsUnavailable: readonly string[];
  /** The peer's gated plan, verbatim — `{domain, planId, planHash, details}`. `details` is the
   *  `PublishContentReport` the operator's confirm decision is made against. */
  readonly plan: Record<string, unknown>;
  /** Entity types this bundle held that {@link pushBundleToPeer}'s own capability probe found the
   *  peer cannot accept (an older Tovu, or a grant that has not opted into that type yet), grouped
   *  with a count. Their entities were removed from the bundle BEFORE anything was staged or
   *  uploaded — never sent, never counted in {@link blobsUploaded}/{@link blobsUnavailable}, and
   *  never appearing as a row in `plan`. Empty when the peer accepted every type, or when the
   *  bundle carried no entities at all (the probe is skipped entirely in that case — see
   *  {@link pushBundleToPeer}). */
  readonly notSupportedByLive: readonly NotSupportedByLiveEntry[];
  /** publish-overwrite-live-plan §4/S7 — whether the peer's own capabilities probe reported the
   *  `"overwrite-live"` feature (`capabilities.ts`'s S6 addition). `false` for an older peer whose
   *  `/capabilities` response carries no `features` array, and `false` also when the probe was
   *  skipped because the bundle carried no entities (see {@link notSupportedByLive}) — there is
   *  nothing to overwrite in that case anyway. The admin dialog and the chat tool (S8/S9) read this
   *  to decide whether to offer any "Overwrite on live" tick at all. Non-empty
   *  `overwriteEntityKeys` sent to a peer without the feature are refused with
   *  `PEER_CANNOT_OVERWRITE` before anything is staged: that peer would silently ignore them. */
  readonly liveCanOverwrite: boolean;
}

/** The fixed set every peer predating S-F1's `/capabilities` route accepts — `bundle-create.ts`'s
 *  original `deploy/publish-trust.json` grant, before `theme-files`/`redirect`/anything newer ever
 *  existed. Used only when the probe below reads an ordinary 404: a peer that old never claimed to
 *  support more, so the absence of the route is read as this fixed answer, not as a failure. */
const LEGACY_PEER_ENTITY_TYPES: readonly string[] = ["post", "page", "media"];

/** The probe answers an older peer gives: 404 to an API key (no such route), 401 to a publishing
 *  credential (route not on its allowlist). See {@link probePeerCapabilities}. */
const LEGACY_PROBE_STATUSES: ReadonlySet<number> = new Set([401, 404]);

/**
 * Probes the peer's own `GET .../capabilities` route (`routes/publish-content/capabilities.ts`) for
 * what it currently accepts.
 *
 * A 404 — the shape Express gives an unmatched route, which is exactly what a peer built before
 * this route existed returns to an API key — is read as {@link LEGACY_PEER_ENTITY_TYPES}, not as an
 * error: that peer never claimed to accept anything else. A 401 is read the same way: an older
 * peer's publishing-credential middleware (`publish-trust-auth.ts`) answers 401 for any route its
 * own `PUBLISH_TRUST_ROUTES` predates, and this route is one. That fallback cannot hide a genuinely
 * refused credential — the very next leg of the push is on that peer's allowlist and fails with
 * its own 401. Every OTHER failure (egress refusal, an unreachable host, any other non-2xx status,
 * a malformed body) propagates unchanged, the same fail-closed posture every other call in this
 * module already takes.
 *
 * @complexity O(1) plus one network round trip.
 */
/** What {@link probePeerCapabilities} learned about a peer: the entity types it currently accepts,
 *  plus the feature flags it advertises (publish-overwrite-live-plan §4/S7's `"overwrite-live"` is
 *  the first one). A peer that predates `features` entirely — the {@link LEGACY_PROBE_STATUSES}
 *  case, or an S-F1-only peer whose response has `entityTypes` but no `features` array — reports an
 *  empty features list: fail-closed, the same posture `entityTypes` itself already takes for that
 *  peer. */
interface PeerCapabilities {
  readonly entityTypes: readonly string[];
  readonly features: readonly string[];
}

/**
 * Refuses a non-empty set of "Overwrite on live" ticks for a peer that doesn't advertise
 * `"overwrite-live"`. Such a peer ignores the body field it doesn't know, so forwarding the ticks
 * would plan and execute WITHOUT the overwrite the operator asked for, and say nothing.
 *
 * @complexity O(1).
 */
function refuseOverwriteOnOlderPeer(credential: ResolvedPeerCredential, capabilities: PeerCapabilities): void {
  if (capabilities.features.includes("overwrite-live")) return;
  throw new PublishContentPeerTransportError(
    `${credential.baseUrl} is on an older Tovu, so it can't overwrite these yet. Update ${credential.baseUrl}, then publish again.`,
    "PEER_CANNOT_OVERWRITE"
  );
}

async function probePeerCapabilities(deps: PeerCallDeps): Promise<PeerCapabilities> {
  const { credential } = deps;
  let probed: Record<string, unknown>;
  try {
    probed = requireObject(
      await callPeer(deps, { method: "GET", path: peerRoute(credential, "/capabilities") }),
      "capabilities",
      credential.baseUrl
    );
  } catch (err) {
    if (err instanceof PublishContentPeerTransportError && LEGACY_PROBE_STATUSES.has(err.peerStatus ?? 0)) {
      return { entityTypes: LEGACY_PEER_ENTITY_TYPES, features: [] };
    }
    throw err;
  }

  if (!Array.isArray(probed.entityTypes) || !probed.entityTypes.every((entityType) => typeof entityType === "string")) {
    throw new PublishContentPeerTransportError(
      `the peer's capabilities response carried no 'entityTypes' array — is '${peerHostname(credential.baseUrl)}' a Tovu instance?`,
      "PEER_RESPONSE_INVALID"
    );
  }
  const features =
    Array.isArray(probed.features) && probed.features.every((feature) => typeof feature === "string")
      ? (probed.features as string[])
      : [];
  return { entityTypes: probed.entityTypes as string[], features };
}

/**
 * Narrows a bundle to the entity types a peer just reported it accepts, so the whole-bundle refusal
 * `bundle-create.ts`'s own grant check produces for ONE unsupported type never happens at all.
 *
 * The excluded entities are counted and grouped by type rather than silently dropped — that grouping
 * is exactly {@link PushBundleResult.notSupportedByLive}, which the caller surfaces to a person
 * (`publish-confirmation-ui.ts`'s `describeNotSupportedByLive`). `blobManifest` is recomputed from
 * the SURVIVING entities only, mirroring `export-bundle.ts`'s `selectBundleEntities`: a push must
 * never upload bytes that belong solely to an entity it is about to leave behind.
 *
 * @complexity O(e) time and space in the bundle's entity count.
 */
function trimBundleToCapabilities(
  bundle: PublishContentExportEnvelope,
  acceptedEntityTypes: readonly string[]
): { bundle: PublishContentExportEnvelope; notSupportedByLive: readonly NotSupportedByLiveEntry[] } {
  const accepted = new Set(acceptedEntityTypes);
  const kept: PackedEntity[] = [];
  const excludedCounts = new Map<string, number>();
  for (const entity of bundle.entities) {
    if (accepted.has(entity.entityType)) kept.push(entity);
    else excludedCounts.set(entity.entityType, (excludedCounts.get(entity.entityType) ?? 0) + 1);
  }
  if (excludedCounts.size === 0) return { bundle, notSupportedByLive: [] };

  const requiredBlobs = new Set<string>();
  for (const entity of kept) for (const sha of entity.requiredBlobs) requiredBlobs.add(sha);

  return {
    bundle: { ...bundle, entities: kept, blobManifest: Array.from(requiredBlobs) },
    notSupportedByLive: Array.from(excludedCounts, ([entityType, count]) => ({ entityType, count })),
  };
}

/**
 * Push step 1: stage a bundle on the peer and obtain its gated plan.
 *
 * Order is load-bearing: blobs FIRST, then the bundle, then the plan. The peer's `planImport` marks
 * an entity `blocked` when a required blob is absent there, so uploading after planning would
 * produce a plan that is wrong the moment it is acted on.
 *
 * @param required.bundle - Built by `buildExportBundle` from THIS instance's registered types.
 * @param required.overwriteEntityKeys - publish-overwrite-live-plan §4/S7 — the operator's
 * "Overwrite on live" ticks, forwarded verbatim to the peer's `/import/plan` (undefined stays
 * undefined on the wire, never becomes `[]` or `null`; see the peer's own `readOverwriteEntityKeys`
 * doc on why absent must mean "force nothing" rather than an empty, real answer).
 * @param required.blobSource - Read-only access to this instance's blob store.
 * @throws {PublishContentPeerTransportError} on any peer failure.
 * @complexity O(b + 1) network round trips for `b` missing blobs, plus one probe, one stage and one
 * plan. Memory is O(size of the largest single blob) — blobs are uploaded one at a time, never
 * collected.
 */
export async function pushBundleToPeer(
  deps: PeerCallDeps & { blobSource: PeerBlobSource; computeStorageKey: (sha256: string) => string },
  required: { bundle: PublishContentExportEnvelope; overwriteEntityKeys?: readonly string[] }
): Promise<PushBundleResult> {
  const { credential } = deps;

  // S-F1: probe, then trim, BEFORE any blob is probed or uploaded — an excluded entity's blobs must
  // never be sent either. Skipped for an empty bundle: trimming nothing needs no round trip, the
  // same short-circuit the blob probe below already takes for an empty `blobManifest`. An empty
  // bundle also leaves `liveCanOverwrite` at its fail-closed `false` default (S7) — there is nothing
  // in it to overwrite.
  let bundle = required.bundle;
  let notSupportedByLive: readonly NotSupportedByLiveEntry[] = [];
  let liveCanOverwrite = false;
  const wantsOverwrite = (required.overwriteEntityKeys?.length ?? 0) > 0;
  if (bundle.entities.length > 0 || wantsOverwrite) {
    const capabilities = await probePeerCapabilities(deps);
    liveCanOverwrite = capabilities.features.includes("overwrite-live");
    if (wantsOverwrite) refuseOverwriteOnOlderPeer(credential, capabilities);
    const trimmed = trimBundleToCapabilities(bundle, capabilities.entityTypes);
    bundle = trimmed.bundle;
    notSupportedByLive = trimmed.notSupportedByLive;
  }

  const blobsUploaded: string[] = [];
  const blobsUnavailable: string[] = [];
  if (bundle.blobManifest.length > 0) {
    const probed = requireObject(
      await callPeer(deps, {
        method: "POST",
        path: peerRoute(credential, "/blobs/probe"),
        body: { shas: bundle.blobManifest },
      }),
      "blob probe",
      credential.baseUrl
    );
    const missing = Array.isArray(probed.missing) ? (probed.missing as unknown[]).filter((s): s is string => typeof s === "string") : [];

    for (const sha256 of missing) {
      const storageKey = deps.computeStorageKey(sha256);
      if (!(await deps.blobSource.exists({ storageKey }))) {
        // Not an error: the bundle names a blob this instance no longer holds. Reported, and the
        // peer's own planner blocks whatever needed it rather than applying half an entity.
        blobsUnavailable.push(sha256);
        continue;
      }
      const bytes = await deps.blobSource.get({ storageKey });
      await callPeer(deps, {
        method: "PUT",
        path: peerRoute(credential, `/blobs/${encodeURIComponent(sha256)}`),
        body: { dataBase64: Buffer.from(bytes).toString("base64") },
      });
      blobsUploaded.push(sha256);
    }
  }

  const staged = requireObject(
    await callPeer(deps, {
      method: "POST",
      path: peerRoute(credential, "/bundles"),
      body: {
        artifactFormatVersion: bundle.artifactFormatVersion,
        hashVersion: bundle.hashVersion,
        sourceLabel: bundle.sourceLabel,
        entities: bundle.entities,
        blobManifest: bundle.blobManifest,
      },
    }),
    "bundle staging",
    credential.baseUrl
  );
  const bundleId = staged.bundleId;
  if (typeof bundleId !== "string") {
    throw new PublishContentPeerTransportError(
      `the peer staged the bundle but returned no 'bundleId'`,
      "PEER_RESPONSE_INVALID"
    );
  }

  const plan = requireObject(
    await callPeer(deps, {
      method: "POST",
      path: peerRoute(credential, "/import/plan"),
      // publish-overwrite-live-plan §4/S7 — `undefined` here reaches the peer's `/import/plan` as an
      // absent field, which its `readOverwriteEntityKeys` reads as "force nothing", the same
      // absent-means-unforced reading `selectedEntityKeys` already relies on for this same call.
      body:
        required.overwriteEntityKeys === undefined
          ? { bundleId }
          : { bundleId, overwriteEntityKeys: required.overwriteEntityKeys },
    }),
    "import plan",
    credential.baseUrl
  );

  return { bundleId, blobsUploaded, blobsUnavailable, plan, notSupportedByLive, liveCanOverwrite };
}

/**
 * Push step 2: confirm the peer's plan and obtain its single-use confirmation token.
 *
 * The "an agent principal may never confirm" guard lives in `gated-mutations/gateway.ts`'s
 * `confirm()` (`AGENT_CANNOT_CONFIRM`) and is enforced on the PEER, against the peer's own view of
 * the calling principal. This driver cannot weaken it: it has no way to assert a principal kind
 * over the wire — the peer derives that itself from the API key it authenticated.
 *
 * @complexity O(1) plus one network round trip.
 */
export async function confirmPeerImport(
  deps: PeerCallDeps,
  required: { planId: string; planHash: string }
): Promise<{ confirmationToken: string }> {
  const confirmed = requireObject(
    await callPeer(deps, {
      method: "POST",
      path: peerRoute(deps.credential, "/import/confirm"),
      body: { planId: required.planId, planHash: required.planHash },
    }),
    "import confirm",
    deps.credential.baseUrl
  );
  const confirmationToken = confirmed.confirmationToken;
  if (typeof confirmationToken !== "string") {
    throw new PublishContentPeerTransportError(
      `the peer confirmed the plan but returned no 'confirmationToken'`,
      "PEER_RESPONSE_INVALID"
    );
  }
  return { confirmationToken };
}

/**
 * Push step 3: redeem the token and run the peer's apply.
 *
 * @returns The peer's execute body verbatim (`{restorePointId, runId, changeSetIds, ...}`) — this driver
 * never reshapes a destination's own report.
 * @complexity O(1) plus one network round trip (the peer's apply loop dominates wall time).
 */
export async function executePeerImport(
  deps: PeerCallDeps,
  required: { bundleId: string; confirmationToken: string; overwriteEntityKeys?: readonly string[] }
): Promise<Record<string, unknown>> {
  // Re-probed rather than trusted from the plan step: execute is a separate request, and the peer
  // may have been redeployed in between.
  if ((required.overwriteEntityKeys?.length ?? 0) > 0) {
    refuseOverwriteOnOlderPeer(deps.credential, await probePeerCapabilities(deps));
  }
  return requireObject(
    await callPeer(deps, {
      method: "POST",
      path: peerRoute(deps.credential, "/import/execute"),
      // publish-overwrite-live-plan §4/S7 — the same forced set confirmed at plan time. A DIFFERENT
      // set here re-derives a different report hash on the peer, and its own PLAN_STALE check
      // refuses it (§4) — no staleness code is needed on this side of the wire either.
      body:
        required.overwriteEntityKeys === undefined
          ? { bundleId: required.bundleId, confirmationToken: required.confirmationToken }
          : {
              bundleId: required.bundleId,
              confirmationToken: required.confirmationToken,
              overwriteEntityKeys: required.overwriteEntityKeys,
            },
    }),
    "import execute",
    deps.credential.baseUrl
  );
}

/**
 * PULL: fetch the peer's export envelope so THIS instance can stage and plan it locally.
 *
 * Deliberately stops at the envelope. Staging and planning are the caller's job, and the caller
 * uses this instance's already-built `stageBundle` + gated `/import/plan` — the same importer a
 * pushed bundle goes through. Nothing in the pull path re-implements classification.
 *
 * This function transfers no blob BYTES — deliberately, and it is no longer a gap: the bytes are
 * {@link pullBlobsFromPeer}'s job, called by the pull route with the `blobManifest` this envelope
 * carries. The split is the same one the push side uses (blobs are their own leg, not a field of
 * the bundle call), and it keeps the envelope fetch a single bounded response.
 *
 * Until 2026-09-19 there was no such function, because the peer exposed `PUT .../blobs/:sha` but no
 * GET — a pulled media entity therefore always ended `blocked` by `planImport`. `media` IS a
 * registered publish-content type (`publish-content-manifest.ts` registers
 * `contributeMediaPublish()`; commits `72e4992c7`/`a9b265ce1`), so that was live, not theoretical:
 * the difference between an empty `blobManifest` and a pull that blocks every image. `blob-get.ts`
 * is the route that closed it.
 *
 * @complexity O(1) network round trip; O(e) memory in the peer's corpus size.
 */
export async function pullBundleFromPeer(deps: PeerCallDeps): Promise<PublishContentExportEnvelope> {
  const body = requireObject(
    await callPeer(deps, { method: "GET", path: peerRoute(deps.credential, "/export") }),
    "export",
    deps.credential.baseUrl
  );

  if (
    typeof body.artifactFormatVersion !== "number" ||
    typeof body.hashVersion !== "number" ||
    !Array.isArray(body.entities) ||
    !Array.isArray(body.blobManifest)
  ) {
    throw new PublishContentPeerTransportError(
      `the peer's export was not a publish-content bundle (expected artifactFormatVersion, hashVersion, entities and blobManifest)`,
      "PEER_RESPONSE_INVALID"
    );
  }
  if (body.artifactFormatVersion !== PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION) {
    throw new PublishContentPeerTransportError(
      `the peer exported artifact format version ${String(body.artifactFormatVersion)}, but this instance supports ` +
        `${PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION}`,
      "PEER_RESPONSE_INVALID"
    );
  }

  return {
    artifactFormatVersion: body.artifactFormatVersion,
    hashVersion: body.hashVersion,
    sourceLabel: typeof body.sourceLabel === "string" ? body.sourceLabel : deps.credential.label,
    entities: body.entities as PublishContentExportEnvelope["entities"],
    blobManifest: (body.blobManifest as unknown[]).filter((sha): sha is string => typeof sha === "string"),
  };
}

/** The narrow blob-WRITE seam the pull driver needs — `BlobStorePort`'s presence check plus its
 *  create-only write, and nothing else. No `put`, no `remove`: this module can never overwrite or
 *  delete a blob, only add one that is absent. */
export interface PeerBlobSink {
  exists(input: { storageKey: string }): Promise<boolean>;
  putIfAbsent(input: {
    workspaceId: string;
    sha256: string;
    bytes: Uint8Array;
  }): Promise<{ storageKey: string; written: boolean }>;
}

/**
 * How many blobs ONE pull will fetch from a peer. A resource bound, not a product limit: the
 * manifest is peer-controlled, and without a ceiling a single pull could hold an admin request open
 * for an unbounded number of round trips. Set to the same value as
 * `PUBLISH_CONTENT_BLOB_PROBE_MAX_SHAS` (the push direction's own cap on the same quantity) so the
 * two directions bound the same thing identically.
 *
 * Exceeding it is not an error and loses nothing: the remainder is reported as
 * `deferredOverCap`, whatever entity needed those blobs is `blocked` by this instance's own
 * `planImport` (the established fail-closed outcome), and a SECOND pull picks them up — the blobs
 * already fetched are skipped by the `exists()` short-circuit, so progress is monotonic.
 */
export const PUBLISH_CONTENT_PULL_MAX_BLOBS = 2000;

/** What one pull's blob leg did, per sha. Four disjoint lists rather than a count, because an
 *  operator acts differently on each: nothing to do for `alreadyPresent`, "the source no longer has
 *  these" for `unavailable`, and "pull again" for `deferredOverCap`. */
export interface PullBlobsResult {
  /** Fetched from the peer, verified against the requested sha, and written to this instance. */
  readonly downloaded: readonly string[];
  /** Already in this instance's blob store — no network call was made for these. */
  readonly alreadyPresent: readonly string[];
  /** The peer answered 404: it no longer holds those bytes. Reported, never thrown — the entity
   *  that requires one is `blocked` by `planImport`, which is a fail-closed plan, not a partial
   *  write. Mirrors `PushBundleResult.blobsUnavailable` on the other direction. */
  readonly unavailable: readonly string[];
  /** Beyond {@link PUBLISH_CONTENT_PULL_MAX_BLOBS} for this request. Fetch them with another pull. */
  readonly deferredOverCap: readonly string[];
}

/**
 * PULL step 2: fetch the blob bytes a pulled envelope requires and store them HERE, so the
 * entities that need them plan as applicable instead of `blocked`.
 *
 * ## The security property this function holds
 *
 * A peer's bytes are UNTRUSTED. `BlobStorePort.putIfAbsent` does not verify that bytes hash to the
 * sha256 it is given — it derives the storage key from that string and writes whatever it was
 * handed (`blob-staging.ts`'s header traces this through both adapters). Since the sha IS the
 * identity throughout this feature, storing unverified bytes would poison content-addressed
 * storage: every later "do you have X?" would answer yes for bytes that are not X, and a `probe`
 * from a third instance would then skip re-uploading the real ones. So every response is hashed
 * with {@link bytesMatchSha256} BEFORE `putIfAbsent`, and a mismatch throws rather than being
 * skipped — a peer serving wrong bytes for a requested hash is corrupt or hostile, and neither is
 * something to continue a pull through. Nothing is written on that path.
 *
 * A 404 is the one peer answer that is NOT an error (see `unavailable` above); every other non-2xx
 * propagates from {@link callPeer} unchanged.
 *
 * @param deps.blobSink - This instance's blob store, write half.
 * @param deps.workspaceId - THIS instance's workspace id. Never the peer's: the bytes are being
 * stored locally, and `putIfAbsent` derives the local storage key from it.
 * @param deps.computeStorageKey - Local storage key for a sha, used for the `exists()` short-circuit.
 * @param deps.maxBlobs - Test seam / operator override for {@link PUBLISH_CONTENT_PULL_MAX_BLOBS}.
 * @returns The four disjoint sha lists described by {@link PullBlobsResult}.
 * @throws {PublishContentPeerTransportError} `PEER_RESPONSE_INVALID` when a peer's bytes do not hash
 * to the sha they were requested by, or the response is not a blob body; other codes per
 * {@link toTransportError}.
 * @complexity O(min(b, maxBlobs)) sequential round trips for `b` distinct shas. Memory is O(size of
 * the largest single blob) — downloaded, verified and written one at a time, never collected (the
 * same bound `pushBundleToPeer` documents for the opposite direction).
 */
export async function pullBlobsFromPeer(
  deps: PeerCallDeps & {
    blobSink: PeerBlobSink;
    workspaceId: string;
    computeStorageKey: (sha256: string) => string;
    maxBlobs?: number;
  },
  required: { blobManifest: readonly string[] }
): Promise<PullBlobsResult> {
  const maxBlobs = deps.maxBlobs ?? PUBLISH_CONTENT_PULL_MAX_BLOBS;
  const downloaded: string[] = [];
  const alreadyPresent: string[] = [];
  const unavailable: string[] = [];
  const deferredOverCap: string[] = [];

  // Deduplicated: one manifest legitimately names the same blob for many entities (a logo on every
  // page), and fetching it once per reference would multiply the round trips by the reuse factor.
  for (const sha256 of new Set(required.blobManifest)) {
    if (await deps.blobSink.exists({ storageKey: deps.computeStorageKey(sha256) })) {
      alreadyPresent.push(sha256);
      continue;
    }
    // The cap counts FETCHES, not manifest entries: a blob already held costs no round trip, so it
    // must not consume the budget that bounds them.
    if (downloaded.length + unavailable.length >= maxBlobs) {
      deferredOverCap.push(sha256);
      continue;
    }

    let body: Record<string, unknown>;
    try {
      body = requireObject(
        await callPeer(deps, { method: "GET", path: peerRoute(deps.credential, `/blobs/${encodeURIComponent(sha256)}`) }),
        "blob fetch",
        deps.credential.baseUrl
      );
    } catch (err) {
      if (err instanceof PublishContentPeerTransportError && err.peerStatus === 404) {
        unavailable.push(sha256);
        continue;
      }
      throw err;
    }

    if (typeof body.dataBase64 !== "string") {
      throw new PublishContentPeerTransportError(
        `the peer's response for blob '${sha256}' carried no 'dataBase64' string`,
        "PEER_RESPONSE_INVALID"
      );
    }
    // `Buffer.from(..., "base64")` never throws — it drops invalid characters — so a malformed
    // payload is caught by the hash check below rather than by a decode error, which is the check
    // that has to hold anyway.
    const bytes = new Uint8Array(Buffer.from(body.dataBase64, "base64"));

    // The security property this function exists to hold — see the doc above. MUST precede the
    // write: `putIfAbsent` will not catch it.
    if (!bytesMatchSha256({ bytes, claimedSha256: sha256 })) {
      throw new PublishContentPeerTransportError(
        `the peer's bytes for blob '${sha256}' do not hash to it — refusing to store them under that ` +
          `sha256, because the hash IS the identity this feature addresses content by`,
        "PEER_RESPONSE_INVALID"
      );
    }

    await deps.blobSink.putIfAbsent({ workspaceId: deps.workspaceId, sha256, bytes });
    downloaded.push(sha256);
  }

  return { downloaded, alreadyPresent, unavailable, deferredOverCap };
}
