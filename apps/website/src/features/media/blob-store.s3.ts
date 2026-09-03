import { AwsClient } from "aws4fetch";

import { computeBlobStorageKey, type BlobStorePort, type PutBlobInput } from "@jini-ai/cms/media";

/**
 * @file S3-compatible `BlobStorePort` adapter — the adapter `blob-store.fs.ts`'s own file header
 * names as "deliberately NOT built: the S3 adapter (deferred)". `LocalFsBlobStore` (real) and
 * `InMemoryBlobStore` (test double) already satisfy this port's rule-of-two; this is a THIRD
 * adapter behind the SAME interface, wired in as an operator-selected alternative to
 * `LocalFsBlobStore` (`server/runtime/composition/deps.ts`), never a replacement for it. Local
 * disk stays the default for every existing install — this file is inert until an operator sets
 * `TOVU_MEDIA_BLOB_STORE=s3` (see `deps.ts`'s `resolveBlobStore`).
 *
 * Signing: `aws4fetch`'s `AwsClient` (SigV4), the SAME library and path-style-addressing
 * convention `features/deployments/static-publish/s3-compatible-target.ts` already uses and
 * documents choosing over `@aws-sdk/client-s3` and hand-rolled signing (that file's header §1) —
 * already a pinned dependency, so this adapter adds none. Deliberately NOT shared code with that
 * file: `s3-compatible-target.ts` signs whole-site-publish `PUT`/`DELETE`/manifest traffic against
 * a bucket meant to be browsed directly (public-read, sometimes literal static-website hosting);
 * this adapter signs `BlobStorePort`'s narrower `put`/`get`/`exists`/`remove` byte operations
 * against a bucket the Tovu server itself is the ONLY reader of — every public media byte is
 * proxied back out through the existing `/m/...` rendition route
 * (`server/inbound/public-http/routes/site/media-rendition.ts`), which calls `blobStore.get()`
 * and streams the result itself. That proxying is what makes this adapter's bucket safe to leave
 * PRIVATE (least-privilege `s3:GetObject`/`PutObject`/`DeleteObject`/`HeadObject` on one prefix,
 * no `s3:ListBucket`, no public-read ACL, no CORS, no website hosting, no custom domain) —
 * intentionally the opposite posture from the publish target's bucket, and worth stating here
 * explicitly since a reader who has seen that other file's config shape could otherwise assume the
 * two need the same bucket setup.
 *
 * Storage keys: unchanged from `LocalFsBlobStore` — `computeBlobStorageKey` (`blob-key.ts`)
 * produces `ws/{workspaceId}/blobs/{sha256[0..1]}/{sha256}`, used here as the S3 object key
 * verbatim (no `rootDir` prefix — an operator-set `keyPrefix` plays that role, see
 * {@link S3BlobStoreConfig.keyPrefix}). Switching a fresh site's `TOVU_MEDIA_BLOB_STORE` to `s3`
 * therefore addresses the exact same keys the SQLite `asset_blobs.storage_key` column already
 * records; only what interprets that string changes.
 *
 * Contract note: {@link get} throws the same message shape `InMemoryBlobStore.get` uses
 * (`blob '<key>' was not found`) for a missing key, not `LocalFsBlobStore`'s raw Node `ENOENT` —
 * callers in this codebase (`rendition-service.ts`, `media-service.ts`) only ever branch on
 * `exists()` first or treat any `get()` throw as "unreadable," so the exact shape is not a load-
 * bearing contract today; documented so a future caller pattern-matching on `code === "ENOENT"`
 * (as thrown by the fs adapter) knows not to assume it here.
 */

/** Config for one `S3BlobStore` instance — one bucket/credential pair per site. */
export interface S3BlobStoreConfig {
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /**
   * Blank/omitted derives a plain-AWS-S3 host from `region` (`https://s3.{region}.amazonaws.com`)
   * — same derivation `s3-compatible-target.ts`'s `deriveEndpoint` uses. Required for every other
   * S3-compatible provider (R2, B2, DigitalOcean Spaces, Wasabi, MinIO, a local test double).
   */
  readonly endpoint?: string;
  /**
   * Optional key namespace prepended to every `computeBlobStorageKey` result, e.g. `tovu-media/`
   * for a bucket an operator also uses for other purposes. Blank/omitted means objects are written
   * at the bare `ws/...` key.
   */
  readonly keyPrefix?: string;
}

/** @complexity O(1) — a fixed string template, byte-identical derivation to the publish target's. */
function deriveEndpoint(region: string): string {
  return `https://s3.${region}.amazonaws.com`;
}

/**
 * Builds the path-style object URL for one storage key, each path segment percent-encoded
 * independently (mirrors `s3-compatible-target.ts`'s `objectUrl`).
 *
 * @complexity O(n) in the number of path segments.
 */
function objectUrl(config: S3BlobStoreConfig, storageKey: string): string {
  const host = (config.endpoint && config.endpoint.trim() !== "" ? config.endpoint : deriveEndpoint(config.region)).replace(/\/+$/, "");
  const fullKey = `${config.keyPrefix ?? ""}${storageKey}`;
  const encodedKey = fullKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${host}/${encodeURIComponent(config.bucket)}/${encodedKey}`;
}

/** Reads a response body defensively for an error message — never throws itself, same defensive
 *  shape `s3-compatible-target.ts`'s `safeErrorBody` uses, capped shorter since these messages
 *  are logged/thrown locally rather than surfaced through a user-facing deploy status. */
async function safeErrorBody(resp: Response): Promise<string> {
  try {
    return (await resp.text()).slice(0, 200);
  } catch {
    return "";
  }
}

/**
 * S3-compatible `BlobStorePort` adapter. Every operation is one signed HTTP request against
 * `{endpoint-or-derived-AWS-host}/{bucket}/{key}` — no retries, no multipart (blobs this codebase
 * handles are single-file media uploads, not the large multi-GB objects multipart exists for).
 */
export class S3BlobStore implements BlobStorePort {
  private readonly client: AwsClient;

  constructor(private readonly config: S3BlobStoreConfig) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      service: "s3",
    });
  }

  async put(input: PutBlobInput): Promise<{ storageKey: string }> {
    const storageKey = computeBlobStorageKey(input);
    let resp: Response;
    try {
      resp = await this.client.fetch(objectUrl(this.config, storageKey), {
        method: "PUT",
        body: input.bytes as BodyInit,
      });
    } catch (err) {
      throw new Error(`S3BlobStore.put: request failed for '${storageKey}' — ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!resp.ok) {
      const body = await safeErrorBody(resp);
      const bodySuffix = body ? ` — ${body}` : "";
      throw new Error(`S3BlobStore.put: failed to write '${storageKey}' — HTTP ${resp.status}${bodySuffix}`);
    }
    return { storageKey };
  }

  /**
   * `If-None-Match: *` makes this a conditional PUT: the object store itself refuses the write
   * (HTTP 412) when the key is already occupied, so there is no separate `exists()` round trip and
   * therefore no window between "check" and "write" for a concurrent writer to land in — same
   * atomicity guarantee `LocalFsBlobStore.putIfAbsent`'s `"wx"` flag gets from the filesystem.
   *
   * Provider caveat (disclosed, not silently assumed): AWS S3 and Cloudflare R2 honor
   * `If-None-Match: *` on `PUT`; some other S3-compatible providers this adapter's file header
   * lists as supported (older MinIO, some DigitalOcean Spaces/Wasabi deployments) may not enforce
   * it and could return 200 on an unconditional overwrite instead of 412 — in which case this
   * degrades to `put()`'s own unconditional-overwrite behavior on those providers specifically,
   * not a crash or silently wrong result. Local disk (`LocalFsBlobStore`, the default backend) is
   * unaffected either way.
   *
   * @complexity O(1) — one signed HTTP request.
   */
  async putIfAbsent(input: PutBlobInput): Promise<{ storageKey: string; written: boolean }> {
    const storageKey = computeBlobStorageKey(input);
    let resp: Response;
    try {
      resp = await this.client.fetch(objectUrl(this.config, storageKey), {
        method: "PUT",
        headers: { "If-None-Match": "*" },
        body: input.bytes as BodyInit,
      });
    } catch (err) {
      throw new Error(`S3BlobStore.putIfAbsent: request failed for '${storageKey}' — ${err instanceof Error ? err.message : String(err)}`);
    }
    if (resp.status === 412) {
      // Precondition Failed — an object already occupies this key. Content-addressed: whatever is
      // there already carries the same sha256 this call would have written (see this method's own
      // doc), so leaving it untouched is always correct.
      return { storageKey, written: false };
    }
    if (!resp.ok) {
      const body = await safeErrorBody(resp);
      const bodySuffix = body ? ` — ${body}` : "";
      throw new Error(`S3BlobStore.putIfAbsent: failed to write '${storageKey}' — HTTP ${resp.status}${bodySuffix}`);
    }
    return { storageKey, written: true };
  }

  async get(input: { storageKey: string }): Promise<Uint8Array> {
    let resp: Response;
    try {
      resp = await this.client.fetch(objectUrl(this.config, input.storageKey), { method: "GET" });
    } catch (err) {
      throw new Error(`S3BlobStore.get: request failed for '${input.storageKey}' — ${err instanceof Error ? err.message : String(err)}`);
    }
    if (resp.status === 404) {
      // Same message shape `InMemoryBlobStore.get` throws for a missing key — see this file's
      // header contract note.
      throw new Error(`blob '${input.storageKey}' was not found`);
    }
    if (!resp.ok) {
      throw new Error(`S3BlobStore.get: failed to read '${input.storageKey}' — HTTP ${resp.status}`);
    }
    return new Uint8Array(await resp.arrayBuffer());
  }

  async exists(input: { storageKey: string }): Promise<boolean> {
    const resp = await this.client.fetch(objectUrl(this.config, input.storageKey), { method: "HEAD" });
    return resp.ok;
  }

  /** Idempotent — a 404 (already absent) is treated as success, matching `BlobStorePort.remove`'s
   *  documented contract (`ports.d.ts`: "removing an already-absent key is not an error") and the
   *  same tolerance `LocalFsBlobStore.remove` gets for free from `rm(..., { force: true })`. */
  async remove(input: { storageKey: string }): Promise<void> {
    let resp: Response;
    try {
      resp = await this.client.fetch(objectUrl(this.config, input.storageKey), { method: "DELETE" });
    } catch (err) {
      throw new Error(`S3BlobStore.remove: request failed for '${input.storageKey}' — ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!resp.ok && resp.status !== 404) {
      throw new Error(`S3BlobStore.remove: failed to delete '${input.storageKey}' — HTTP ${resp.status}`);
    }
  }
}
