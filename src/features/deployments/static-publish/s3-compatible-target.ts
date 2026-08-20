import { AwsClient } from "aws4fetch";

import { checkDeploymentUrl, DeployError, type DeployFile, type DeployLinkStatus, type DeployPublishInput, type DeployPublishResult, type DeploymentUrlCheck, type DeployTarget } from "@jini-ai/devops/deploy";

/**
 * @file `DeployTarget` implementation for S3-compatible object storage (AWS S3, Cloudflare R2,
 * Backblaze B2, DigitalOcean Spaces, Wasabi, MinIO, ...) — spec
 * `ADS-memory/specs/custom-publish-provider-contract.md` §1-§2.
 *
 * Purpose:
 * A plain signed-HTTP client, identical in kind to how `@jini-ai/devops/deploy`'s
 * `GitHubPagesDeployTarget`/`VercelDeployTarget`/etc. talk to their own provider's REST API (spec
 * §1a — nothing here shells out to anything). Signs each request with `aws4fetch`'s `AwsClient`
 * (SigV4 — decided over `@aws-sdk/client-s3` and hand-rolled signing, spec §1) and `PUT`s every
 * `DeployFile` to `{endpoint-or-derived-AWS-host}/{bucket}/{file}` — path-style addressing uniformly
 * across every provider in scope, a deliberate implementation choice the spec itself calls out as
 * "not architecture" (§2).
 *
 * How it relates to the project:
 * Lives in Tovu, not in `@jini-ai/devops` — no second consumer exists yet (spec §2's extraction
 * ruling). `adapter.ts` is this feature's ONLY caller; every OTHER caller in this codebase sees just
 * `./types.ts`'s `StaticPublishConfig`/`StaticPublishOutcome`, never this file's types (the same
 * "keep Jini's types at the boundary" discipline `adapter.ts`'s own header documents, extended one
 * level further here since even a Tovu-local deploy target should not leak past its one caller).
 *
 * `checkDeploymentUrl` is reused verbatim from `@jini-ai/devops/deploy`'s `reachability.ts` (already a
 * dependency) rather than reimplemented — it already carries the SSRF-hardened connection-time DNS
 * validation `reachability.js`'s own header documents (SEC-003), which a hand-rolled `fetch(url)` here
 * would not get for free. This is the same "plain unauthenticated HEAD/GET... identical in kind to
 * what a browser does" check spec §2 describes, just the maintained implementation of it rather than a
 * second one.
 *
 * `publish()` decides its own terminal `status` from that SAME check (not merely "did every PUT
 * succeed") — mirroring the pattern `VercelDeployTarget.publish()` already uses internally
 * (`waitForReachableDeploymentUrl`, verified by reading `vercel.js` directly): every `DeployTarget` in
 * this codebase resolves its own honest terminal state before returning, rather than reporting "the
 * API call worked" and leaving reachability to a caller. `adapter.ts`'s `publishStaticSite` is the one
 * place that turns a non-`'ready'` `status` into `StaticPublishOutcome`'s `ok: "partial"` branch — see
 * that file's own doc.
 *
 * CRITICAL FIX (2026-08-19, Codex 5.6-sol audit — data-loss/confidential-exposure class): `publish()`
 * used to only ever upload the current export and never delete anything, deliberately, per spec §7
 * ("Object cleanup / delete-on-republish ... assume S3-compatible ... leaves orphaned old keys in
 * place for v1 ... the safer default"). That assumption does not hold once a page can be UNPUBLISHED:
 * publish `/secret-announcement/index.html`, unpublish the page (it no longer appears in any later
 * export), publish again — the object stays in the bucket and keeps being served at its old public URL
 * INDEFINITELY, silently. "No delete" is only the safer default when nothing is ever supposed to stop
 * being public; for a CMS where unpublishing is a real, expected action, it is the opposite — this
 * finding supersedes spec §7's "no delete" ruling for this target (spec text not yet updated to match —
 * whoever owns `custom-publish-provider-contract.md` should reconcile §7 with this file).
 *
 * The fix: {@link MANAGED_MANIFEST_KEY} is a small JSON object this target PUTs to the bucket itself,
 * under a dedicated, Tovu-namespaced key, listing exactly which keys the LAST publish wrote. Every
 * `publish()` call now (1) uploads the current export (unchanged), (2) reads the previous manifest and
 * deletes any key it lists that the CURRENT export no longer produces — a targeted delete of a key this
 * target is certain it owns, never a key with no such record — and (3) writes the new manifest ONLY
 * after both of those steps succeed. That ordering is load-bearing for crash-safety: if a run dies
 * between steps, the OLD manifest (on disk in the bucket, untouched until step 3) still lists whatever
 * was not yet confirmed deleted, so the next run's diff naturally retries exactly the right work —
 * nothing is ever silently forgotten (re-deleting an already-gone key or re-uploading an
 * already-current one is a harmless no-op), and nothing not YET recorded as managed is ever deleted. A
 * bucket with no manifest yet (the first publish ever, or content a human uploaded before Tovu ever
 * touched this bucket) has nothing "known managed," so nothing is ever inferred safe to delete — the
 * same "unknown means untouched" default `github-git-provider.ts`'s own manifest-based fix uses for the
 * identical class of finding in that adapter.
 *
 * SECOND-ROUND CRITICAL FIX (2026-08-19, three independent auditors — Claude Sonnet 5, Codex 5.6-sol,
 * Codex 5.6-terra, all three converging on overlapping findings with no communication between them): the
 * manifest layer above closed the "content silently never cleaned up" gap, but had three of its own
 * defects, all now fixed together (mirroring `github-git-provider.ts`'s own SECOND-ROUND CRITICAL FIX
 * note for its sibling adapter — see that file's header for the identical reasoning applied to git):
 *
 *  1. OWNERSHIP WAS TRUSTED BLINDLY. Any key the manifest LISTED was deleted, with no check that the
 *     key's LIVE object still matched what this target itself last wrote. A human (or another tool)
 *     overwriting a Tovu-published object directly in the bucket, then a later export simply no longer
 *     producing that key, meant the overwrite got silently deleted on the very next publish. Fixed by
 *     giving the manifest real provenance: it is now `{version: 2, keys: [{key, etag}]}`, recording the
 *     ETag THIS target itself observed immediately after writing each key, not just the key string.
 *     {@link publish} now verifies, via {@link fetchLiveETag}, that a candidate deletion's CURRENT live
 *     ETag still equals the recorded one before ever deleting it — a key is deleted only when this
 *     target can prove nothing wrote to it since. A key with no recorded etag (a pre-this-fix
 *     `{version: 1, keys: [...]}` manifest, or a malformed entry) and a key whose live etag has DIVERGED
 *     from the recorded one are treated identically: never deleted, and reported back to the caller via
 *     `DeployPublishResult.statusMessage` (`adapter.ts`'s `publishStaticSite` passes this straight
 *     through to `StaticPublishOutcome`, the same channel every other status note already uses — no
 *     Jini-defined type could be widened for this, since `DeployPublishResult` is `@jini-ai/devops`'s own
 *     port, out of this fix's scope). ASSUMPTION, disclosed here rather than silently relied on: this
 *     comparison trusts that two GETs/HEADs of byte-identical content return the SAME ETag on a given
 *     provider (true for AWS S3, R2, MinIO, and every other provider in scope for a plain, non-multipart
 *     `PUT` — the shape every upload in this file always is); a provider whose ETag is not a deterministic
 *     function of content would make this check unreliable, which is the same class of caveat every
 *     ETag-based cache-validation scheme in the wild already carries.
 *
 *  2. A TRANSIENT MANIFEST READ FAILURE PERMANENTLY FORGOT STALE CONTENT. {@link fetchManagedManifest}
 *     used to return `undefined` on ANY failure — network, a non-404 HTTP error, or a body that failed to
 *     parse — and `publish()` treated `undefined` exactly like "verified: nothing was ever managed." The
 *     very next successful publish then wrote a brand-new manifest reflecting only the current export,
 *     permanently overwriting the only record of what a prior pass had tracked. A key removed from the
 *     export during exactly the same window as a manifest-read blip would then survive in the bucket
 *     forever, publicly reachable, invisible to every subsequent manifest. Fixed: {@link
 *     fetchManagedManifest} now throws a real {@link DeployError} for every unreadable case, and only a
 *     VERIFIED 404 is treated as "zero prior keys." `publish()` never uploads-then-silently-forgets on an
 *     unreadable manifest — the whole publish fails instead, the same fail-loud posture {@link deleteOne}
 *     already documents for a cleanup failure, extended one step earlier to the read that gates it.
 *
 *  3. NO CROSS-PUBLISHER CONCURRENCY GUARD AT ALL. `publish()` used to read the manifest, upload, delete
 *     stale keys, then unconditionally overwrite the manifest — with no lock, no generation check, no
 *     precondition. Two publishers racing (traced in the second-round audit): both read manifest `{x}`;
 *     A's export still includes `x`; B's export no longer does; B deletes `x` and writes `{}`; A then
 *     writes `{x}` back over top — the manifest now claims `x` exists, but the object is gone, forever
 *     mismatched. Fixed with a conditional write + bounded retry: {@link writeManagedManifestConditional}
 *     sends `If-Match` (keyed to the ETag this run observed reading the manifest) or `If-None-Match: *`
 *     (when no manifest existed yet) on the manifest `PUT` — a real compare-and-swap, the object-storage
 *     equivalent of the non-force git ref update `github-git-provider.ts`'s own `writeRef` already relies
 *     on. A precondition failure (412, or 409 on providers that signal conflict that way) means a genuine
 *     racer won since
 *     this run's own read — {@link publish} re-reads the manifest, RE-VERIFIES and re-diffs the stale-key
 *     set against that fresh state (never assumes the old diff is still valid), and retries, bounded to
 *     {@link MAX_MANIFEST_WRITE_ATTEMPTS} attempts before giving up loudly.
 *
 *     RESIDUAL RISK, disclosed rather than pretended closed: conditional writes on `PUT` (`If-Match`/
 *     `If-None-Match`) are NOT universally supported across every S3-compatible provider in this target's
 *     own scope — real AWS S3 added them relatively recently, and older MinIO/Backblaze/other
 *     deployments may still reject them. {@link writeManagedManifestConditional} detects this (a `501`,
 *     or a `400` whose body names an unsupported/not-implemented operation) and DEGRADES: the rest of
 *     THIS publish call falls back to a plain, unconditional manifest write rather than refusing to
 *     publish at all (this feature's own hard requirement — publishing must keep working end to end). A
 *     degraded publish still SUCCEEDS and still reports its result honestly: `statusMessage` names that
 *     the concurrency guard was unavailable for this call, so two publishers racing against a
 *     non-conditional-capable provider can still lose data the same way pre-fix code could — that
 *     specific residual risk is real, provider-dependent, and disclosed to the caller rather than
 *     silently absorbed.
 *
 * Architectural role:
 * `features/deployments/static-publish` domain logic, this feature's second (Tovu-local) seam into
 * the `DeployTarget` port `@jini-ai/devops/deploy` defines.
 */

/** Fallback `Content-Type` for a `DeployFile` with none set — same gap `adapter.ts`'s `toDeployFile`
 *  already tolerates for the other four targets (their own provider APIs infer it from the file
 *  extension server-side; S3-compatible storage does not, so an explicit fallback is required here
 *  specifically, not merely nice-to-have). */
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/** Bounds how many `PUT` requests run concurrently per `publish()` call — resource-bounds pre-check
 *  (this codebase's Programmer skill 5a4): an export with thousands of files must not open thousands
 *  of concurrent sockets against a caller-configured host. 8 is a conservative, arbitrary-but-documented
 *  choice — enough to amortize per-request latency without behaving like a burst scanner against a
 *  third-party host holding a human's real credentials. */
const MAX_CONCURRENT_UPLOADS = 8;

/** Per-file upload timeout — resource-bounds pre-check, the "timeout on external service calls" half.
 *  A single slow/hanging object PUT must not stall the whole publish indefinitely; 30s is generous for
 *  a single static asset over a normal connection while still bounding the worst case. Reused verbatim
 *  for the manifest read/write and stale-key deletes below — none of those are larger than a single
 *  static asset either. */
const UPLOAD_TIMEOUT_MS = 30_000;

/** Bounds how many times {@link S3CompatibleDeployTarget.publish} retries the read-verify-delete-write
 *  cycle after a genuine manifest-write conflict (a `412`/`409` from {@link
 *  writeManagedManifestConditional}) before giving up loudly — this file's header SECOND-ROUND CRITICAL
 *  FIX note, finding 3. 3 is a small, documented bound: a real conflict resolves in one retry almost
 *  always (the losing writer simply re-reads the winner's now-current state); repeated conflicts beyond
 *  that indicate sustained contention this target should surface rather than retry indefinitely against. */
const MAX_MANIFEST_WRITE_ATTEMPTS = 3;

/** Where this target records exactly which keys IT wrote — see this file's header CRITICAL fix note.
 *  A hidden, Tovu-namespaced key deliberately: a real static export does not produce a dotfile
 *  directory, so collision with genuine site content is not a practical concern the way a plain
 *  `manifest.json` at the bucket root would be. Byte-identical NAMING PATTERN to
 *  `github-git-provider.ts`'s `MANAGED_MANIFEST_PATH` — not shared code (this is an S3 object key, that
 *  is a git tree path; the two adapters have no dependency on each other), just the same "small
 *  Tovu-owned tracking file, physically stored inside what this adapter manages" shape applied to two
 *  different storage systems. */
const MANAGED_MANIFEST_KEY = ".tovu/managed-keys.json";

export interface S3CompatibleTargetConfig {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly region: string;
  /** Blank/omitted derives a plain-AWS-S3 host from `region` — see {@link deriveEndpoint}. */
  readonly endpoint?: string;
  /** The address `publish()` reachability-checks after every upload, and what `publish()`/
   *  `checkReachability()` both report as the publish's `url` — see this file's header. */
  readonly publicUrl: string;
}

/**
 * Derives the object-storage API host to sign requests against when `config.endpoint` is blank —
 * "Plain AWS S3: leave this blank" per the credential form's own hint copy (spec §4c). Every other
 * provider in scope (R2, B2, DigitalOcean Spaces, Wasabi, MinIO) requires an explicit endpoint, so this
 * derivation only ever needs to know AWS's own host-naming convention.
 *
 * @complexity O(1) — a fixed string template.
 */
function deriveEndpoint(region: string): string {
  return `https://s3.${region}.amazonaws.com`;
}

/**
 * Builds the path-style object URL for one file — `{endpoint}/{bucket}/{key}`, each path segment
 * percent-encoded independently so a `/` inside a single deploy-relative path SEGMENT (never the
 * separators themselves, which `toDeployFile` in `adapter.ts` already normalizes to forward slashes)
 * cannot be misread as an extra path boundary.
 *
 * @complexity O(n) in the number of path segments.
 */
function objectUrl(config: S3CompatibleTargetConfig, file: string): string {
  const host = (config.endpoint && config.endpoint.trim() !== "" ? config.endpoint : deriveEndpoint(config.region)).replace(/\/+$/, "");
  const key = file
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${host}/${encodeURIComponent(config.bucket)}/${key}`;
}

/** Reads a response body defensively for an error message — never throws itself (a body-read failure
 *  must not mask the original HTTP error), and caps length so an unexpectedly large error page never
 *  balloons a thrown `DeployError`'s message. */
async function safeErrorBody(resp: Response): Promise<string> {
  try {
    return (await resp.text()).slice(0, 300);
  } catch {
    return "";
  }
}

/**
 * Signs and PUTs one `DeployFile` to its object URL, bounded by {@link UPLOAD_TIMEOUT_MS}.
 *
 * @returns The `ETag` this provider reported for the just-written object, or `undefined` when the
 *   response carried none — this target's own recorded provenance for the key (this file's header
 *   SECOND-ROUND CRITICAL FIX note, finding 1). A key uploaded with no observed ETag is recorded in the
 *   NEXT manifest with `etag: undefined`, meaning a future publish can never verify-and-delete it either
 *   — the same disclosed, bounded limitation a pre-provenance manifest entry gets.
 * @throws {DeployError} A non-2xx response, or the request timing out/erroring at the network layer.
 *   Never leaks the response body raw — capped to 300 chars, the same "actionable but bounded" shape
 *   `adapter.ts`'s own `catch` uses for provider errors.
 * @complexity O(1) — one signed HTTP request.
 */
async function uploadOne(client: AwsClient, config: S3CompatibleTargetConfig, file: DeployFile): Promise<string | undefined> {
  const url = objectUrl(config, file.file);
  let resp: Response;
  try {
    resp = await client.fetch(url, {
      method: "PUT",
      // `DeployFile.data`'s declared type (`Buffer | Uint8Array | string`) is always a valid fetch
      // body at runtime — Node's `Buffer` IS a `Uint8Array`. The cast is needed only because
      // `@types/node`'s `Buffer<ArrayBufferLike>` and lib.dom's `BodyInit` (which expects
      // `Uint8Array<ArrayBuffer>`) disagree on the typed array's generic parameter, a known
      // ecosystem type mismatch rather than a real runtime concern.
      body: file.data as BodyInit,
      headers: { "Content-Type": file.contentType ?? DEFAULT_CONTENT_TYPE },
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch (err) {
    throw new DeployError(`Failed to upload '${file.file}' to S3-compatible storage: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
  if (!resp.ok) {
    const body = await safeErrorBody(resp);
    throw new DeployError(`Failed to upload '${file.file}' to S3-compatible storage: HTTP ${resp.status}${body ? ` — ${body}` : ""}`, resp.status >= 500 ? 502 : 400);
  }
  return resp.headers.get("etag") ?? undefined;
}

/**
 * Reads the CURRENT `ETag` the provider reports for `key` right now, via a signed HEAD, used ONLY to
 * verify a single candidate deletion still matches what this target itself last recorded writing (this
 * file's header SECOND-ROUND CRITICAL FIX note,
 * finding 1). Best-effort: `undefined` on ANY failure (network, non-2xx, or a response with no `ETag`
 * header) or when the key is genuinely absent (404, e.g. already deleted by a previous pass or a human).
 * Every one of those outcomes means the same thing to {@link S3CompatibleDeployTarget.publish} — "cannot
 * confirm this ONE deletion is safe" — which always resolves to skipping just that one key, never to
 * failing the whole publish. That narrower blast radius is exactly why this read gets the OPPOSITE
 * tolerance from {@link fetchManagedManifest} itself: a failure here can only ever cost one candidate's
 * cleanup this pass, never the ownership record as a whole.
 *
 * @complexity One signed HTTP request per call — bounded by the (typically small) number of candidate
 *   deletions, never by the size of the whole bucket.
 */
async function fetchLiveETag(client: AwsClient, config: S3CompatibleTargetConfig, key: string): Promise<string | undefined> {
  let resp: Response;
  try {
    resp = await client.fetch(objectUrl(config, key), { method: "HEAD", signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
  } catch {
    return undefined;
  }
  if (!resp.ok) return undefined;
  return resp.headers.get("etag") ?? undefined;
}

/**
 * Deletes one object by key, bounded by {@link UPLOAD_TIMEOUT_MS}. A 404 is treated as SUCCESS, not an
 * error — the object is gone either way, and this delete is always driven by a diff against a manifest
 * that may itself be stale by the time this call lands (a previous run already deleted it, a human
 * deleted it directly), so "already absent" is the same outcome as "just removed," not a failure.
 *
 * @throws {DeployError} A non-404 non-2xx response, or the request timing out/erroring at the network
 *   layer — deliberately fails LOUD (never silently swallowed) so a real cleanup failure surfaces to
 *   the caller instead of letting the manifest "forget" a key that is still actually live in the
 *   bucket (see this file's header CRITICAL fix note on why the manifest write only ever happens after
 *   this succeeds).
 * @complexity O(1) — one signed HTTP request.
 */
async function deleteOne(client: AwsClient, config: S3CompatibleTargetConfig, key: string): Promise<void> {
  const url = objectUrl(config, key);
  let resp: Response;
  try {
    resp = await client.fetch(url, { method: "DELETE", signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
  } catch (err) {
    throw new DeployError(`Failed to delete stale object '${key}' from S3-compatible storage: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
  if (!resp.ok && resp.status !== 404) {
    const body = await safeErrorBody(resp);
    throw new DeployError(`Failed to delete stale object '${key}' from S3-compatible storage: HTTP ${resp.status}${body ? ` — ${body}` : ""}`, resp.status >= 500 ? 502 : 400);
  }
}

/** One key this target recorded owning in a previous manifest, together with the ETag it observed
 *  writing it — or `etag: undefined` when no such provenance exists for this key (this file's header
 *  SECOND-ROUND CRITICAL FIX note, finding 1): either a pre-this-fix `{version: 1, keys: [...]}` manifest
 *  (a real, historical shape this target itself used to write, not corruption), or a `v2` entry whose own
 *  `etag` field was missing/blank. `etag: undefined` is deliberately NOT "safe to delete" — {@link
 *  S3CompatibleDeployTarget.publish} treats it exactly like a verified mismatch: never auto-deleted,
 *  always reported. */
interface PreviouslyManagedKey {
  readonly key: string;
  readonly etag: string | undefined;
}

/** Recognizes both manifest shapes this target has ever written: the CURRENT one (`{version: 2, keys:
 *  [{key, etag}]}`, real per-key provenance) and the shape it wrote before this file's second-round fix
 *  (`{version: 1, keys: [...]}`, bare key strings, no per-key etag at all — a real historical format, not
 *  corruption). Anything else — an unrecognized `version`, an entry of the wrong shape, a hand-edited
 *  file that merely resembles one of these — is treated as UNRECOGNIZED, never as "zero prior keys": see
 *  {@link fetchManagedManifest}'s own doc for why an unrecognized shape must fail the whole publish
 *  (this file's header SECOND-ROUND CRITICAL FIX note, finding 2).
 *
 * @returns `undefined` when `parsed` matches neither recognized shape.
 * @complexity O(n) in the manifest's own entry count.
 */
/** One `v2` manifest `keys[]` entry: `{key, etag}`, `etag` blank/missing normalized to `undefined`. */
function parseManagedManifestV2Entry(entry: unknown): PreviouslyManagedKey | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;
  const e = entry as Record<string, unknown>;
  if (typeof e.key !== "string") return undefined;
  const etag = typeof e.etag === "string" && e.etag.length > 0 ? e.etag : undefined;
  return { key: e.key, etag };
}

/** The current `{version: 2, keys: [{key, etag}]}` shape — real per-key provenance. */
function parseManagedManifestV2(obj: Record<string, unknown>): PreviouslyManagedKey[] | undefined {
  if (obj.version !== 2 || !Array.isArray(obj.keys)) return undefined;
  const files: PreviouslyManagedKey[] = [];
  for (const entry of obj.keys) {
    const parsedEntry = parseManagedManifestV2Entry(entry);
    if (parsedEntry === undefined) return undefined;
    files.push(parsedEntry);
  }
  return files;
}

/** The legacy `{version: 1, keys: [...]}` shape — bare key strings, no per-key provenance. Every
 * listed key is KNOWN but UNVERIFIABLE. See this file's header, SECOND-ROUND CRITICAL FIX note,
 * finding 1. */
function parseManagedManifestV1(obj: Record<string, unknown>): PreviouslyManagedKey[] | undefined {
  if (obj.version !== 1 || !Array.isArray(obj.keys) || !obj.keys.every((key) => typeof key === "string")) {
    return undefined;
  }
  return (obj.keys as string[]).map((key) => ({ key, etag: undefined }));
}

function parseManagedManifestShape(parsed: unknown): PreviouslyManagedKey[] | undefined {
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const obj = parsed as Record<string, unknown>;
  // `parseManagedManifestV1` re-checks `obj.version === 1` itself, so it can never accidentally
  // match a `v2` object whose `keys[]` failed entry validation above.
  return parseManagedManifestV2(obj) ?? parseManagedManifestV1(obj);
}

/** A verified read of {@link MANAGED_MANIFEST_KEY} — either a confirmed absence (a real 404, "no
 *  manifest yet") or the parsed prior keys together with the manifest OBJECT's own ETag (used as the
 *  `If-Match` precondition on the next write — this file's header SECOND-ROUND CRITICAL FIX note,
 *  finding 3). `etag: undefined` on a `"found"` read means this provider did not report one on the GET —
 *  {@link S3CompatibleDeployTarget.publish} cannot condition a write on a value it never observed, so
 *  that case degrades to an unconditional write for this one attempt, the same as an explicitly
 *  `"unsupported"` provider. */
type ManagedManifestRead = { status: "not-found" } | { status: "found"; files: readonly PreviouslyManagedKey[]; etag: string | undefined };

/**
 * Reads {@link MANAGED_MANIFEST_KEY} — the previous publish's own record of which keys IT wrote, and
 * (from `v2` onward) the ETag it observed for each (this file's header CRITICAL fix note, and its
 * SECOND-ROUND CRITICAL FIX note, finding 2, for why this read is no longer best-effort).
 *
 * A VERIFIED 404 is the ONLY case treated as "zero prior keys" — it is a genuinely different fact than
 * "this object could not be read," and is exactly what the first publish ever to a bucket (or one a
 * human populated before Tovu ever touched it) looks like. Every OTHER failure (network, a non-404 HTTP
 * error, a body that fails to parse, or a body that parses but matches neither manifest shape {@link
 * parseManagedManifestShape} recognizes) now THROWS a real {@link DeployError} — `publish()` fails the
 * whole call rather than risk writing a new manifest that silently forgets what an unreadable one
 * recorded. This is the OPPOSITE tolerance from {@link fetchLiveETag}, which stays best-effort per-key —
 * see that function's own doc for why the two reads get different treatment.
 *
 * @throws {DeployError} Any failure other than a verified 404.
 * @complexity One signed HTTP request.
 */
/** The GET half of {@link fetchManagedManifest} — network/transport failures only; HTTP-status and
 * body handling stay with the caller. */
async function fetchManagedManifestResponse(client: AwsClient, config: S3CompatibleTargetConfig): Promise<Response> {
  try {
    return await client.fetch(objectUrl(config, MANAGED_MANIFEST_KEY), { method: "GET", signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
  } catch (err) {
    throw new DeployError(`Failed to read the Tovu-managed object manifest — cannot confirm which keys this target previously owned: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
}

/** The parse-and-validate half of {@link fetchManagedManifest}, for an already-`ok` response. */
async function parseManagedManifestBody(resp: Response): Promise<{ files: readonly PreviouslyManagedKey[]; etag: string | undefined }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await resp.text());
  } catch {
    throw new DeployError("The Tovu-managed object manifest is not valid JSON — cannot confirm which keys this target previously owned.", 502);
  }
  const files = parseManagedManifestShape(parsed);
  if (files === undefined) {
    throw new DeployError("The Tovu-managed object manifest did not match a recognized shape — cannot confirm which keys this target previously owned.", 502);
  }
  return { files, etag: resp.headers.get("etag") ?? undefined };
}

async function fetchManagedManifest(client: AwsClient, config: S3CompatibleTargetConfig): Promise<ManagedManifestRead> {
  const resp = await fetchManagedManifestResponse(client, config);
  if (resp.status === 404) return { status: "not-found" };
  if (!resp.ok) {
    const body = await safeErrorBody(resp);
    throw new DeployError(`Failed to read the Tovu-managed object manifest — cannot confirm which keys this target previously owned: HTTP ${resp.status}${body ? ` — ${body}` : ""}`, resp.status >= 500 ? 502 : 400);
  }
  const { files, etag } = await parseManagedManifestBody(resp);
  return { status: "found", files, etag };
}

/** How {@link writeManagedManifestConditional} asks the provider to accept the write only if the
 *  manifest object is in the expected state — `"if-match"` for "only if it still has THIS etag" (the one
 *  this run observed reading it), `"if-none-match"` for "only if it still does not exist at all" (this
 *  run found no manifest), and `"none"` for an unconditional write — used once a provider has already
 *  signaled it cannot honor a precondition ({@link ConditionalWriteOutcome}'s own `"unsupported"`), or
 *  when a `"found"` read carried no ETag to condition on in the first place. */
type ManifestWritePrecondition = { readonly kind: "if-match"; readonly etag: string } | { readonly kind: "if-none-match" } | { readonly kind: "none" };

/** {@link writeManagedManifestConditional}'s own outcome — `"written"` (the precondition held, or none
 *  was sent), `"conflict"` (a REAL precondition failure: something else changed the manifest since this
 *  run's own read — {@link S3CompatibleDeployTarget.publish} re-reads and retries), or `"unsupported"`
 *  (this provider does not implement conditional `PUT` at all — `publish()` degrades to an unconditional
 *  write for the rest of this call, see this file's header SECOND-ROUND CRITICAL FIX note, finding 3). */
type ConditionalWriteOutcome = "written" | "conflict" | "unsupported";

/**
 * Overwrites {@link MANAGED_MANIFEST_KEY} with exactly `files`, honoring `precondition` — the LAST step
 * of every `publish()` attempt (this file's header CRITICAL fix note on why the ordering is
 * load-bearing). A GENUINE failure (not a precondition outcome) is NOT tolerated silently: a manifest
 * write this target cannot confirm means the NEXT publish cannot trust what it reads, so this throws the
 * same as a real upload/delete failure rather than degrading.
 *
 * @returns `"written"`, `"conflict"`, or `"unsupported"` — see {@link ConditionalWriteOutcome}'s own doc.
 *   Never throws for either of the latter two; those are real, expected outcomes the caller decides how
 *   to act on, not failures.
 * @throws {DeployError} Any OTHER non-2xx response, or the request timing out/erroring at the network
 *   layer.
 * @complexity One signed HTTP request.
 */
function buildManifestBody(files: readonly PreviouslyManagedKey[]): string {
  return JSON.stringify({
    version: 2,
    keys: files.map((f) => ({ key: f.key, etag: f.etag })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
  });
}

function buildManifestHeaders(precondition: ManifestWritePrecondition): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (precondition.kind === "if-match") headers["If-Match"] = precondition.etag;
  if (precondition.kind === "if-none-match") headers["If-None-Match"] = "*";
  return headers;
}

/** The PUT half of {@link writeManagedManifestConditional} — network/transport failures only;
 * status-code interpretation stays with the caller. */
async function putManagedManifest(
  client: AwsClient,
  config: S3CompatibleTargetConfig,
  body: string,
  headers: Record<string, string>
): Promise<Response> {
  try {
    return await client.fetch(objectUrl(config, MANAGED_MANIFEST_KEY), { method: "PUT", body, headers, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
  } catch (err) {
    throw new DeployError(`Failed to update the Tovu-managed object manifest: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
}

/** Classifies a `400` manifest-write response. Some S3-compatible providers report an unsupported
 * conditional header this way rather than `501` — recognized only by a body naming the operation
 * as unsupported, never assumed from the bare status code alone (a genuine 400 — a malformed
 * request for an unrelated reason — must still throw, not be silently treated as "this provider
 * just doesn't support preconditions"). */
async function classifyManifestWrite400(resp: Response): Promise<ConditionalWriteOutcome> {
  const body = await safeErrorBody(resp);
  if (/notimplemented|not implemented|unsupportedoperation/i.test(body)) return "unsupported";
  throw new DeployError(`Failed to update the Tovu-managed object manifest: HTTP 400${body ? ` — ${body}` : ""}`, 400);
}

async function classifyManifestWriteResponse(resp: Response): Promise<ConditionalWriteOutcome> {
  if (resp.ok) return "written";
  if (resp.status === 412 || resp.status === 409) return "conflict";
  if (resp.status === 501) return "unsupported";
  if (resp.status === 400) return classifyManifestWrite400(resp);
  const errorBody = await safeErrorBody(resp);
  throw new DeployError(`Failed to update the Tovu-managed object manifest: HTTP ${resp.status}${errorBody ? ` — ${errorBody}` : ""}`, resp.status >= 500 ? 502 : 400);
}

async function writeManagedManifestConditional(
  client: AwsClient,
  config: S3CompatibleTargetConfig,
  files: readonly PreviouslyManagedKey[],
  precondition: ManifestWritePrecondition
): Promise<ConditionalWriteOutcome> {
  const body = buildManifestBody(files);
  const headers = buildManifestHeaders(precondition);
  const resp = await putManagedManifest(client, config, body, headers);
  return classifyManifestWriteResponse(resp);
}

/**
 * Runs `task` over every item in `items` with at most {@link MAX_CONCURRENT_UPLOADS} in flight at
 * once — a fixed-size worker pool rather than `Promise.all` over the whole set, per this codebase's
 * resource-bounds pre-check (a large export or a large stale-key set must not open one socket per item
 * simultaneously). The FIRST rejection wins and is rethrown; in-flight siblings are not explicitly
 * cancelled (their own `AbortSignal.timeout` still bounds them), matching `Promise.all`'s own "first
 * rejection propagates" semantics that every other target's own multi-request internals already rely
 * on. Generic over both the item type AND the result type (not `DeployFile`-specific, not `void`-only) —
 * reused for uploads (which need each file's own observed ETag back, in order) and deletes (which need
 * nothing back).
 *
 * @returns Each item's own result, in the SAME order as `items` — never reordered by completion time.
 * @complexity O(items) requests, bounded to {@link MAX_CONCURRENT_UPLOADS} concurrent in-flight.
 */
async function runBounded<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let firstError: unknown;
  let sawError = false;

  // Claims the next unclaimed index, or `undefined` once the queue is drained or a sibling worker
  // has already recorded a failure (no further claims once `sawError` — a claimed-but-unprocessed
  // index is harmless since `results` is discarded whenever `sawError` ends up true).
  const claimNextIndex = (): number | undefined => {
    if (sawError || nextIndex >= items.length) return undefined;
    const index = nextIndex;
    nextIndex += 1;
    return index;
  };

  // Runs `task` for one claimed index, recording only the FIRST failure across every worker.
  const runOne = async (index: number): Promise<void> => {
    try {
      results[index] = await task(items[index]!);
    } catch (err) {
      if (!sawError) {
        sawError = true;
        firstError = err;
      }
    }
  };

  async function worker(): Promise<void> {
    let index = claimNextIndex();
    while (index !== undefined) {
      await runOne(index);
      if (sawError) return;
      index = claimNextIndex();
    }
  }

  const poolSize = Math.max(1, Math.min(MAX_CONCURRENT_UPLOADS, items.length));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  if (sawError) throw firstError;
  return results;
}

/** Maps a reachability probe to `DeployPublishResult.status`'s fixed vocabulary — see this file's
 *  header for why `publish()` decides this itself rather than leaving it to a caller. */
function toDeployLinkStatus(check: DeploymentUrlCheck): DeployLinkStatus {
  if (check.reachable) return "ready";
  if (check.status === "protected") return "protected";
  return "link-delayed";
}

/**
 * Appends this file's own residual-risk/divergence disclosures to a reachability `statusMessage` —
 * `DeployPublishResult` (a Jini-defined port type, out of scope to widen — see this file's header) has
 * no dedicated field for either, so both ride the SAME free-text channel every other status note already
 * uses (`adapter.ts`'s `publishStaticSite` passes it straight through). `divergedKeys` reports which
 * previously-managed keys survived because their live content could not be verified as still Tovu's own
 * (this file's header SECOND-ROUND CRITICAL FIX note, finding 1); `concurrencyGuardActive: false` reports
 * that this specific publish had no compare-and-swap protection because the provider does not support
 * conditional writes (finding 3) — never silently absorbed into a plain "Reachable." message.
 *
 * @complexity O(min(divergedKeys.length, 3)) — only a bounded preview is ever rendered.
 */
/** One {@link diffManagedKeys} candidate's classification: `"skip"` (current export still produces
 * it, it's the manifest key itself, or its live-verification read couldn't confirm anything this
 * pass), `"diverged"` (known but not safe to delete — no recorded provenance, or live content no
 * longer matches what was recorded), or `"stale"` (verified safe to delete). */
type ManagedKeyClassification = "skip" | "diverged" | "stale";

/**
 * Classifies one previously-managed key against `currentKeys`, verifying its LIVE etag against
 * what this target recorded writing before ever calling it stale (this file's header SECOND-ROUND
 * CRITICAL FIX note, finding 1). `MANAGED_MANIFEST_KEY` is excluded defensively (never part of
 * `previousFiles`' own meaning, but a manifest written by some future/other version should not be
 * able to delete itself via this path).
 *
 * @complexity One HEAD request when the key has a recorded etag to verify; O(1) otherwise.
 */
async function classifyManagedKey(
  client: AwsClient,
  config: S3CompatibleTargetConfig,
  previous: PreviouslyManagedKey,
  currentKeys: ReadonlySet<string>
): Promise<ManagedKeyClassification> {
  if (currentKeys.has(previous.key) || previous.key === MANAGED_MANIFEST_KEY) return "skip";
  if (previous.etag === undefined) {
    // No recorded provenance (a pre-provenance v1 manifest entry, or a malformed v2 one) — nothing
    // to verify against, so it is never auto-deleted.
    return "diverged";
  }
  const liveEtag = await fetchLiveETag(client, config, previous.key);
  if (liveEtag === undefined) {
    // Already gone, or this ONE key's verification read failed — nothing this pass can safely
    // delete now. Not reported as a divergence: an absent/unverifiable key in isolation is not
    // evidence of tampering, just nothing this pass could act on.
    return "skip";
  }
  // content changed since this target wrote it — never delete unverified content
  return liveEtag === previous.etag ? "stale" : "diverged";
}

/**
 * Diffs `previousFiles` (the last publish's own manifest) against `currentKeys` (this export) —
 * {@link S3CompatibleDeployTarget.publish}'s per-attempt read/verify step, extracted so the retry
 * loop above it doesn't carry this nesting itself. Only a key {@link classifyManagedKey} verifies
 * `"stale"` is ever returned for deletion.
 *
 * @complexity O(previousFiles.length) HEAD requests (one per candidate whose etag is known).
 */
async function diffManagedKeys(
  client: AwsClient,
  config: S3CompatibleTargetConfig,
  previousFiles: readonly PreviouslyManagedKey[],
  currentKeys: ReadonlySet<string>
): Promise<{ staleKeys: string[]; divergedKeys: string[] }> {
  const staleKeys: string[] = [];
  const divergedKeys: string[] = [];
  for (const previous of previousFiles) {
    const classification = await classifyManagedKey(client, config, previous, currentKeys);
    if (classification === "stale") staleKeys.push(previous.key);
    else if (classification === "diverged") divergedKeys.push(previous.key);
  }
  return { staleKeys, divergedKeys };
}

/** The manifest-write `precondition` for one {@link attemptManifestSync} attempt: no condition once
 * the concurrency guard has degraded, `if-none-match` for "I saw no manifest," `if-match` keyed to
 * the etag this attempt's own read observed, or `none` when a `"found"` read reported no etag to
 * condition on. */
function buildWritePrecondition(concurrencyGuardActive: boolean, manifestRead: ManagedManifestRead): ManifestWritePrecondition {
  if (!concurrencyGuardActive) return { kind: "none" };
  if (manifestRead.status === "not-found") return { kind: "if-none-match" };
  if (manifestRead.etag !== undefined) return { kind: "if-match", etag: manifestRead.etag };
  return { kind: "none" };
}

/**
 * Runs one full read-verify-delete-write attempt at reconciling the managed-object manifest with
 * `currentFiles` — the body of {@link S3CompatibleDeployTarget.publish}'s retry loop, extracted so
 * the loop's own break/continue/throw control flow isn't nested three deep with this attempt's own
 * work. Reads the manifest FRESH on every call (never reused across a retry — this file's header
 * SECOND-ROUND CRITICAL FIX note, finding 3: a stale diff computed against an outdated manifest is
 * exactly the race this fix closes), diffs and deletes verified-stale keys, then attempts the
 * conditional manifest write.
 *
 * @complexity One manifest read, {@link diffManagedKeys}'s own cost, O(stale keys) DELETE requests
 *   (bounded concurrency, see {@link runBounded}), and one manifest write.
 */
async function attemptManifestSync(
  client: AwsClient,
  config: S3CompatibleTargetConfig,
  currentKeys: ReadonlySet<string>,
  currentFiles: readonly PreviouslyManagedKey[],
  concurrencyGuardActive: boolean
): Promise<{ outcome: ConditionalWriteOutcome; divergedKeys: string[] }> {
  const manifestRead = await fetchManagedManifest(client, config);
  const previousFiles = manifestRead.status === "found" ? manifestRead.files : [];

  const { staleKeys, divergedKeys } = await diffManagedKeys(client, config, previousFiles, currentKeys);
  if (staleKeys.length > 0) {
    await runBounded(staleKeys, (key) => deleteOne(client, config, key));
  }

  // LAST step, and only reached after every upload and verified delete above has succeeded — see
  // this file's header CRITICAL fix note on why this ordering is what makes a crash mid-publish
  // self-healing rather than an over-delete or a permanently orphaned, never-cleaned-up key.
  const precondition = buildWritePrecondition(concurrencyGuardActive, manifestRead);
  const outcome = await writeManagedManifestConditional(client, config, currentFiles, precondition);
  return { outcome, divergedKeys };
}

function buildStatusMessage(base: string, divergedKeys: readonly string[], concurrencyGuardActive: boolean): string {
  let message = base;
  if (divergedKeys.length > 0) {
    const preview = divergedKeys.slice(0, 3).join(", ");
    message += ` ${divergedKeys.length} previously-managed key(s) were preserved because their live content no longer matched this target's own record (or pre-dates that record): ${preview}${divergedKeys.length > 3 ? ", ..." : ""}.`;
  }
  if (!concurrencyGuardActive) {
    message += " This provider does not support conditional writes; the concurrent-publish safety check (precondition on the managed-object manifest) was skipped for this publish.";
  }
  return message;
}

/**
 * `DeployTarget` for S3-compatible object storage. See this file's header for the full design —
 * SigV4-signed `PUT` per file, then a real reachability check against `config.publicUrl` before
 * reporting a terminal status.
 */
export class S3CompatibleDeployTarget implements DeployTarget {
  readonly id = "s3-compatible";
  private readonly client: AwsClient;

  constructor(private readonly config: S3CompatibleTargetConfig) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: config.region,
    });
  }

  /**
   * Uploads every file, then checks whether `config.publicUrl` is actually reachable — see this file's
   * header for why this is checked here rather than left to a caller. A successful upload with an
   * unreachable public URL still returns normally (`status` reflects it as `'link-delayed'`/
   * `'protected'`, never thrown) — `adapter.ts` is what turns that into `StaticPublishOutcome`'s
   * `ok: "partial"` branch; this method's own job is only to report the honest terminal state.
   *
   * Deletion is now a VERIFY-then-delete pass, and the manifest write is a CONDITIONAL, retried one —
   * see this file's header SECOND-ROUND CRITICAL FIX note for the full reasoning behind both:
   *  1. Uploads happen ONCE, up front — idempotent (re-running a PUT with the same content is a no-op),
   *     so a conflict retry below never needs to re-upload.
   *  2. Each retry attempt re-reads the manifest FRESH (never reuses a stale read across attempts),
   *     re-verifies every candidate deletion's LIVE etag against what this target itself recorded
   *     writing, deletes only the ones that verify, then attempts a CONDITIONAL manifest write keyed to
   *     that same fresh read.
   *  3. `"conflict"` (a real precondition failure — something else changed the manifest since THIS
   *     attempt's own read) retries from step 2, bounded to {@link MAX_MANIFEST_WRITE_ATTEMPTS}.
   *     `"unsupported"` (this provider cannot do conditional writes at all) degrades to an unconditional
   *     write for the rest of this call and keeps going — publishing must still work end to end.
   *
   * @throws {DeployError} Any file's upload fails (see {@link uploadOne}), the manifest cannot be read
   *   for any reason other than a verified 404 (see {@link fetchManagedManifest}), any verified stale
   *   key's delete fails (see {@link deleteOne}), the manifest write itself fails for a reason other than
   *   a precondition outcome (see {@link writeManagedManifestConditional}), or every conflict retry is
   *   exhausted. A partially-completed run remains SAFE to retry (this file's header CRITICAL fix note):
   *   the manifest is rewritten only after uploads and verified deletes succeed, so a crash anywhere
   *   before that point is self-healing on the next `publish()` call rather than orphaning or
   *   over-deleting anything.
   * @complexity O(files) PUT requests (bounded concurrency, see {@link runBounded}) plus, PER ATTEMPT
   *   (bounded to {@link MAX_MANIFEST_WRITE_ATTEMPTS}): one manifest read, O(candidate deletions)
   *   HEAD requests to verify live content, O(verified stale keys) DELETE requests (bounded
   *   concurrency), and one manifest write — plus one reachability probe at the end
   *   (`checkDeploymentUrl`, itself O(1)-O(2) requests).
   */
  async publish(input: DeployPublishInput): Promise<DeployPublishResult> {
    const currentKeys = new Set(input.files.map((file) => file.file));

    // Uploads happen ONCE, up front — a PUT is idempotent, so a conflict retry below never re-uploads.
    const observedEtags = await runBounded(input.files, (file) => uploadOne(this.client, this.config, file));
    const currentFiles: PreviouslyManagedKey[] = input.files.map((file, index) => ({ key: file.file, etag: observedEtags[index] }));

    let concurrencyGuardActive = true;
    let divergedKeys: string[] = [];

    for (let attempt = 1; ; attempt++) {
      const attempted = await attemptManifestSync(this.client, this.config, currentKeys, currentFiles, concurrencyGuardActive);
      divergedKeys = attempted.divergedKeys;

      if (attempted.outcome === "written") break;
      if (attempted.outcome === "unsupported") {
        // This provider cannot do conditional writes at all — degrade for the REST of this call and
        // retry immediately with an unconditional write. Not a real conflict, so it does not need a
        // fresh manifest re-read; nothing about the bucket's OWN state changed because of this outcome.
        concurrencyGuardActive = false;
        continue;
      }
      // outcome === "conflict": a real racing publisher changed the manifest since this attempt's own
      // read. Retry from a fresh read (top of loop) — bounded, so sustained contention surfaces loudly
      // rather than retrying forever.
      if (attempt >= MAX_MANIFEST_WRITE_ATTEMPTS) {
        throw new DeployError(
          "Concurrent publish detected on the Tovu-managed object manifest and retries were exhausted — another publish updated it while this one was running. Try publishing again.",
          409
        );
      }
    }

    const check = await checkDeploymentUrl(this.config.publicUrl);
    return {
      targetId: this.id,
      url: this.config.publicUrl,
      status: toDeployLinkStatus(check),
      statusMessage: buildStatusMessage(check.statusMessage ?? (check.reachable ? "Reachable." : "Not yet reachable."), divergedKeys, concurrencyGuardActive),
    };
  }

  /** Plain unauthenticated HEAD/GET against `url` — no S3 API call, no credential used. Satisfies the
   *  `DeployTarget` port; `publish()` above already runs the identical check against `config.publicUrl`
   *  as part of every publish, so this method exists for a caller that wants to re-check reachability
   *  independently of a fresh publish. */
  async checkReachability(url: string): Promise<DeploymentUrlCheck> {
    return checkDeploymentUrl(url);
  }
}
