import { peerHostname, peerUrl } from "./peer-url.js";
import type { PublishContentExportEnvelope } from "./export-bundle.js";
import { EgressRefusedError, type HttpClientPort } from "#src/platform/http/index";
import type { ResolvedPeerCredential } from "./peers.js";

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
  | "PEER_RESPONSE_INVALID";

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
        // The ONE place the opened key is used. `dev-auth.ts`'s `API_KEY_AUTHORIZATION_PATTERN`
        // accepts `Bearer <raw-key>`; a peer therefore authenticates as an ordinary API-key
        // principal and its grants come from its own issuance snapshot (plan §1.2) — there is no
        // transport-specific auth mechanism to get wrong.
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
}

/**
 * Push step 1: stage a bundle on the peer and obtain its gated plan.
 *
 * Order is load-bearing: blobs FIRST, then the bundle, then the plan. The peer's `planImport` marks
 * an entity `blocked` when a required blob is absent there, so uploading after planning would
 * produce a plan that is wrong the moment it is acted on.
 *
 * @param required.bundle - Built by `buildExportBundle` from THIS instance's registered types.
 * @param required.blobSource - Read-only access to this instance's blob store.
 * @throws {PublishContentPeerTransportError} on any peer failure.
 * @complexity O(b + 1) network round trips for `b` missing blobs, plus one probe, one stage and one
 * plan. Memory is O(size of the largest single blob) — blobs are uploaded one at a time, never
 * collected.
 */
export async function pushBundleToPeer(
  deps: PeerCallDeps & { blobSource: PeerBlobSource; computeStorageKey: (sha256: string) => string },
  required: { bundle: PublishContentExportEnvelope }
): Promise<PushBundleResult> {
  const { credential } = deps;
  const { bundle } = required;

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
    await callPeer(deps, { method: "POST", path: peerRoute(credential, "/import/plan"), body: { bundleId } }),
    "import plan",
    credential.baseUrl
  );

  return { bundleId, blobsUploaded, blobsUnavailable, plan };
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
 * @returns The peer's execute body verbatim (`{restorePointId, changeSetIds, ...}`) — this driver
 * never reshapes a destination's own report.
 * @complexity O(1) plus one network round trip (the peer's apply loop dominates wall time).
 */
export async function executePeerImport(
  deps: PeerCallDeps,
  required: { bundleId: string; confirmationToken: string }
): Promise<Record<string, unknown>> {
  return requireObject(
    await callPeer(deps, {
      method: "POST",
      path: peerRoute(deps.credential, "/import/execute"),
      body: { bundleId: required.bundleId, confirmationToken: required.confirmationToken },
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
 * KNOWN GAP — LIVE, not theoretical. This transfers no blob BYTES. The peer exposes
 * `PUT .../blobs/:sha` but no GET, so there is no route to fetch them through; a pulled entity that
 * requires a blob this instance lacks is `blocked` by `planImport`, which is the fail-closed
 * outcome and never a partial write.
 *
 * `media` IS a registered publish-content type (`publish-content-manifest.ts` registers
 * `contributeMediaPublish()`; commits `72e4992c7`/`a9b265ce1`), so a pulled media entity reaches
 * this gap for real as soon as the `PublishContentDeps` builders pass media's ports through. An
 * earlier revision of this comment claimed media was not yet registered — that was wrong, and the
 * difference matters: it is the difference between an empty `blobManifest` and a pull that blocks
 * every image. **A blob-fetch route on the peer (`GET .../blobs/:sha`) is the prerequisite for the
 * pull direction carrying media at all.**
 *
 * @complexity O(1) network round trip; O(e) memory in the peer's corpus size.
 */
export async function pullBundleFromPeer(deps: PeerCallDeps): Promise<PublishContentExportEnvelope> {
  const body = requireObject(
    await callPeer(deps, { method: "GET", path: peerRoute(deps.credential, "/export") }),
    "export",
    deps.credential.baseUrl
  );

  if (typeof body.hashVersion !== "number" || !Array.isArray(body.entities) || !Array.isArray(body.blobManifest)) {
    throw new PublishContentPeerTransportError(
      `the peer's export was not a publish-content bundle (expected hashVersion, entities and blobManifest)`,
      "PEER_RESPONSE_INVALID"
    );
  }

  return {
    hashVersion: body.hashVersion,
    sourceLabel: typeof body.sourceLabel === "string" ? body.sourceLabel : deps.credential.label,
    entities: body.entities as PublishContentExportEnvelope["entities"],
    blobManifest: (body.blobManifest as unknown[]).filter((sha): sha is string => typeof sha === "string"),
  };
}
