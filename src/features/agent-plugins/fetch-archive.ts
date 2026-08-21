/**
 * @file The missing front half of the Agent Plugin install pipeline: URL -> verified bytes.
 *
 * `install.ts` deliberately takes `archive: Uint8Array` and never a URL — it is a pure
 * verify/extract/publish step with no network surface at all. This module is the one place that
 * talks to the network, and it hands `install.ts` exactly what it already accepts. The split is
 * kept on purpose: every hostile-archive guard in `install.ts` (`DIGEST_MISMATCH`, zip-slip,
 * decompression caps) stays reachable from a plain in-memory buffer in tests, with no fetch mock.
 *
 * What this module does NOT do:
 * - It does not decide whether a digest is trustworthy. `expectedSha256` is verified by
 *   `install.ts`, not here; {@link fetchAgentPluginArchive} only reports the digest of what
 *   actually arrived so a caller can pin it.
 * - It does not follow a redirect chain by hand. `fetch` handles redirects; the scheme guard below
 *   re-runs on the FINAL response URL so an `https://` start cannot be redirected onto a
 *   non-network scheme.
 * - It does not trust `Content-Length`. That header is attacker-controlled for a hostile host; the
 *   cap below is enforced against bytes actually read, and `Content-Length` is used only as an
 *   early reject so an obviously-oversized download is not started at all.
 */
import { createHash } from "node:crypto";

/** Mirrors `install.ts`'s own `LIMITS.maxArchiveBytes` — a download this module would accept but
 * `installAgentPlugin` would then reject with `ARCHIVE_TOO_LARGE` is wasted bandwidth, so the cap
 * is enforced at the earliest point it can be. Kept as its own constant rather than imported so
 * this module has no dependency on `install.ts`; the pairing is asserted by a unit test instead. */
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;

/** `http:` is permitted alongside `https:` because a self-hosted Tovu's first registry is realistically
 * a machine on its own network (and because the local end-to-end proof of this pipeline serves over
 * loopback). Transport confidentiality is NOT what protects an install here — `expectedSha256` is.
 * Every other scheme is refused: `file:`/`data:` would turn a "download a plugin" call into an
 * arbitrary local-file read reachable from whatever supplies the URL. */
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(["https:", "http:"]);

export type AgentPluginFetchErrorCode =
  /** The URL did not parse, or its scheme is not in {@link ALLOWED_PROTOCOLS}. */
  | "UNSUPPORTED_URL"
  /** The request never produced a response — DNS failure, connection refused, TLS failure, abort. */
  | "REQUEST_FAILED"
  /** A response arrived with a non-2xx status. */
  | "HTTP_ERROR"
  /** The response body exceeded {@link MAX_ARCHIVE_BYTES}, by header or by bytes actually read. */
  | "ARCHIVE_TOO_LARGE"
  /** A 2xx response with no body at all — never a valid archive, and a clearer error than letting
   * the zip reader fail on zero bytes. */
  | "EMPTY_BODY";

export class AgentPluginFetchError extends Error {
  readonly code: AgentPluginFetchErrorCode;

  constructor(code: AgentPluginFetchErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AgentPluginFetchError";
    this.code = code;
  }
}

export interface FetchAgentPluginArchiveRequired {
  /** Absolute `https:` or `http:` URL of a plugin `.zip`. */
  readonly url: string;
}

export interface FetchAgentPluginArchiveOptional {
  /** Injectable for tests and for a caller that needs its own agent/proxy. Defaults to global `fetch`. */
  readonly fetchImpl?: typeof globalThis.fetch;
  /** Lowered by a caller that wants a tighter cap than the module default. Never raised above
   * {@link MAX_ARCHIVE_BYTES} — a larger value is clamped, because `install.ts` would reject it anyway. */
  readonly maxBytes?: number;
  /** Forwarded to `fetch`, so a caller can time out or cancel a slow download. */
  readonly signal?: AbortSignal;
}

export interface FetchedAgentPluginArchive {
  readonly archive: Uint8Array;
  /** Lowercase hex SHA-256 of `archive` as received. Pass to `installAgentPlugin` as
   * `expectedSha256` only if the caller has independently decided to trust these bytes — this value
   * is computed from the download itself and therefore proves nothing about origin on its own. */
  readonly sha256: string;
  /** The FINAL URL after redirects, which may differ from the requested one. */
  readonly resolvedUrl: string;
}

/**
 * Downloads one Agent Plugin archive into memory, bounded and digested.
 *
 * @throws {AgentPluginFetchError} For every expected failure. A caller distinguishes them by `code`.
 * @complexity O(b) in bytes downloaded, bounded by `maxBytes`.
 */
export async function fetchAgentPluginArchive(
  required: FetchAgentPluginArchiveRequired,
  optional: FetchAgentPluginArchiveOptional = {},
): Promise<FetchedAgentPluginArchive> {
  const fetchImpl = optional.fetchImpl ?? globalThis.fetch;
  const maxBytes = Math.min(optional.maxBytes ?? MAX_ARCHIVE_BYTES, MAX_ARCHIVE_BYTES);

  assertAllowedUrl(required.url, "requested");

  let response: Response;
  try {
    response = await fetchImpl(required.url, { redirect: "follow", signal: optional.signal });
  } catch (error) {
    throw new AgentPluginFetchError("REQUEST_FAILED", `could not fetch '${required.url}': ${describe(error)}`, {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new AgentPluginFetchError(
      "HTTP_ERROR",
      `'${required.url}' returned HTTP ${response.status} ${response.statusText}`.trimEnd(),
    );
  }

  // Re-checked against the FINAL url: `redirect: "follow"` means the scheme validated above is not
  // necessarily the scheme the bytes came from.
  const resolvedUrl = response.url || required.url;
  assertAllowedUrl(resolvedUrl, "redirected-to");

  assertDeclaredSizeWithinCap(response, maxBytes, required.url);

  const archive = await readBodyWithinCap(response, maxBytes, required.url);
  if (archive.byteLength === 0) {
    throw new AgentPluginFetchError("EMPTY_BODY", `'${required.url}' returned an empty body`);
  }

  return {
    archive,
    sha256: createHash("sha256").update(archive).digest("hex"),
    resolvedUrl,
  };
}

/** The module's own cap, exported so a caller (or a test pinning it against `install.ts`'s
 * `LIMITS.maxArchiveBytes`) can read it without duplicating the number. */
export function maxAgentPluginArchiveBytes(): number {
  return MAX_ARCHIVE_BYTES;
}

function assertAllowedUrl(value: string, position: "requested" | "redirected-to"): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new AgentPluginFetchError("UNSUPPORTED_URL", `'${value}' is not an absolute URL`);
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new AgentPluginFetchError(
      "UNSUPPORTED_URL",
      `${position} URL '${value}' uses unsupported scheme '${parsed.protocol}' — only https: and http: are allowed`,
    );
  }
}

/** Early reject on a self-declared oversized body. Advisory only — {@link readBodyWithinCap} is the
 * enforcement, because a hostile host can under-report or omit this header entirely. */
function assertDeclaredSizeWithinCap(response: Response, maxBytes: number, url: string): void {
  const header = response.headers.get("content-length");
  if (header === null) return;
  const declared = Number(header);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AgentPluginFetchError(
      "ARCHIVE_TOO_LARGE",
      `'${url}' declares ${declared} bytes, over the ${maxBytes}-byte cap`,
    );
  }
}

/**
 * Reads the body chunk by chunk, aborting the moment the running total would exceed the cap — so a
 * hostile endpoint streaming an unbounded body cannot drive this process out of memory. Buffering
 * the whole response first (`await response.arrayBuffer()`) would defeat the cap entirely.
 */
async function readBodyWithinCap(response: Response, maxBytes: number, url: string): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array(0);

  const chunks: Uint8Array[] = [];
  let total = 0;

  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new AgentPluginFetchError(
          "ARCHIVE_TOO_LARGE",
          `'${url}' body exceeded the ${maxBytes}-byte cap`,
        );
      }
      chunks.push(value);
    }
  } finally {
    // Releases the connection on the throw path too; without it an aborted oversized download
    // leaves the socket held until GC.
    await reader.cancel().catch(() => {});
  }

  const archive = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return archive;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
