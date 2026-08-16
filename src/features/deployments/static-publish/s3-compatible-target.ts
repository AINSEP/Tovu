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
 *  a single static asset over a normal connection while still bounding the worst case. */
const UPLOAD_TIMEOUT_MS = 30_000;

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
 * @throws {DeployError} A non-2xx response, or the request timing out/erroring at the network layer.
 *   Never leaks the response body raw — capped to 300 chars, the same "actionable but bounded" shape
 *   `adapter.ts`'s own `catch` uses for provider errors.
 * @complexity O(1) — one signed HTTP request.
 */
async function uploadOne(client: AwsClient, config: S3CompatibleTargetConfig, file: DeployFile): Promise<void> {
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
}

/**
 * Runs `upload` over every item in `files` with at most {@link MAX_CONCURRENT_UPLOADS} in flight at
 * once — a fixed-size worker pool rather than `Promise.all` over the whole set, per this codebase's
 * resource-bounds pre-check (large exports must not open one socket per file simultaneously). The
 * FIRST rejection wins and is rethrown; in-flight siblings are not explicitly cancelled (their own
 * `AbortSignal.timeout` still bounds them), matching `Promise.all`'s own "first rejection propagates"
 * semantics that every other target's own multi-request internals already rely on.
 *
 * @complexity O(files) requests, bounded to {@link MAX_CONCURRENT_UPLOADS} concurrent in-flight.
 */
async function uploadAllBounded(files: readonly DeployFile[], upload: (file: DeployFile) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  let firstError: unknown;
  let sawError = false;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= files.length) return;
      if (sawError) return;
      try {
        await upload(files[index]!);
      } catch (err) {
        if (!sawError) {
          sawError = true;
          firstError = err;
        }
        return;
      }
    }
  }

  const poolSize = Math.max(1, Math.min(MAX_CONCURRENT_UPLOADS, files.length));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  if (sawError) throw firstError;
}

/** Maps a reachability probe to `DeployPublishResult.status`'s fixed vocabulary — see this file's
 *  header for why `publish()` decides this itself rather than leaving it to a caller. */
function toDeployLinkStatus(check: DeploymentUrlCheck): DeployLinkStatus {
  if (check.reachable) return "ready";
  if (check.status === "protected") return "protected";
  return "link-delayed";
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
   * @throws {DeployError} Any file's upload fails — see {@link uploadOne}. A partially-uploaded bucket
   *   from a failed run is left as-is (spec §7: no delete/cleanup semantics in this first slice,
   *   matching the other four targets' own "no sync" behavior).
   * @complexity O(files) PUT requests (bounded concurrency, see {@link uploadAllBounded}) plus one
   *   reachability probe (`checkDeploymentUrl`, itself O(1)-O(2) requests).
   */
  async publish(input: DeployPublishInput): Promise<DeployPublishResult> {
    await uploadAllBounded(input.files, (file) => uploadOne(this.client, this.config, file));

    const check = await checkDeploymentUrl(this.config.publicUrl);
    return {
      targetId: this.id,
      url: this.config.publicUrl,
      status: toDeployLinkStatus(check),
      statusMessage: check.statusMessage ?? (check.reachable ? "Reachable." : "Not yet reachable."),
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
