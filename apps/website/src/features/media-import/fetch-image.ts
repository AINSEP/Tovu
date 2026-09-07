import type { HttpClientPort } from "#src/platform/http/index";
import { sniffContentType, DEFAULT_MAX_UPLOAD_BYTES, type SniffedContentType } from "../media/index.js";

/**
 * @file The guarded "fetch a media file from a URL" half of `media_import_from_url` — everything
 * between an agent-supplied URL string and a validated `Uint8Array` that is safe to hand to `uploadMedia`.
 * The tool surface itself lives in `agent-tools.ts`/`tool-registrations.ts` alongside it; this module
 * is separated so the security-relevant decisions (which URLs, which bytes, how many) are directly
 * unit-testable with a fake `HttpClientPort` and no tool harness, permission check, or database.
 *
 * ## Why this exists at all
 *
 * The media catalog could accept raw base64 (`media_upload_asset`) and it could promote something a
 * human had already attached to a chat (`media_promote_chat_attachment`). Nothing accepted a URL.
 * Found live 2026-09-06: the site assistant generated a real 2048x1152 PNG through an external MCP
 * server, was handed a CloudFront URL for it, and then could not save it — its own account was
 * "`media_upload_asset` needs base64 bytes I'm holding, `media_promote_chat_attachment` needs a chat
 * attachment, and there is no import-by-URL tool". A human had to bridge it by hand: fetch the bytes
 * in a browser and POST them to the admin API. This module is that bridge, made real.
 *
 * ## SSRF: the guard is not reimplemented here
 *
 * This is the textbook SSRF sink — an agent supplies a URL and the SERVER makes the request. None of
 * the defence lives in this file. Every fetch goes through the injected `HttpClientPort`
 * (ADR-038, `platform/http/client.ts`), which already resolves DNS, classifies every resolved
 * address (denying loopback/RFC1918/CGNAT/link-local incl. `169.254.169.254`/reserved, with
 * IPv4-mapped-IPv6 normalized first, in every spelling — the hex-tail and compressed forms that were
 * a real bypass gap until they were closed), PINS the connection to the address it checked (so DNS
 * cannot be rebound between check and connect), and re-runs that entire check on every redirect hop.
 * `MEDIA_IMPORT_EGRESS_POLICY` (`platform/http/egress-policies.ts`) supplies HTTPS-only, an EMPTY
 * dev-host allowlist, and the hop/size/time bounds.
 *
 * This module never constructs an `HttpClientPort` — `FetchImageDeps.httpClient` is injected, built
 * only by a composition root (`server/runtime/composition/{deps,app}.ts`), exactly as
 * `features/custom-credentials/credentialed-request.ts` documents for the identical shape of
 * dependency. Feature code may not deep-import `platform/http/client.ts` at all
 * (`.dependency-cruiser.mjs`'s guarded-module boundary); only the type-only barrel is reachable from
 * here, which is what makes "cannot obtain an unguarded client" structural rather than aspirational.
 *
 * What this module DOES own, on top of the transport guard:
 *
 * - **Scheme, before the network.** `https:` only, checked here so a caller gets a clear message
 *   naming the scheme rather than a generic egress rejection. The policy enforces the same thing
 *   independently — this is a better error, never the actual control.
 * - **Bytes are what the bytes say they are.** The response's own `Content-Type` header is NEVER
 *   trusted (see {@link fetchImage}); the type is decided by `sniffContentType`'s magic-byte read of
 *   the actual payload, and only the types in {@link IMPORTABLE_CONTENT_TYPES} are accepted. A
 *   server that answers `image/png` and returns HTML, a PDF, or an unsanitized SVG is rejected.
 * - **Bounded, with no silent truncation.** {@link MEDIA_IMPORT_MAX_BYTES} caps the payload, and a
 *   response whose BYTES the egress policy clipped (`HttpResponse.bodyBytesTruncated`) is refused
 *   outright rather than stored. That distinction is the whole point: a truncated image is not a
 *   smaller image, it is a corrupt file that would still hash, still write a blob, still create a
 *   media row, and still render as nothing — this repo has already shipped one class of "row exists,
 *   bytes don't" bug and has no interest in a second. The BYTE half's flag specifically, not the
 *   shared `bodyTruncated` (2026-09-06, MI-01): that one is the OR of both body shapes, and this
 *   module never reads `bodyText`, so honoring it refused complete images whose lossy UTF-8 decode
 *   crossed the policy cap the bytes themselves never reached.
 *
 * Architectural role: `features/media-import` domain logic. Depends on `features/media` (for
 * `sniffContentType` and the upload cap it must agree with) and on `platform/http`'s type-only
 * barrel. No dependency on `server/**`.
 */

/** Every caller-shape or security-boundary rejection this module raises. Distinct from
 *  `@jini-ai/cms/media`'s own `MediaValidationError` (which validates an upload once the bytes are
 *  already in hand) — this class rejects a REQUEST, before or just after the fetch. */
export class MediaImportValidationError extends Error {}

/**
 * The still-image and video types this tool will import, decided by magic bytes rather than by any
 * header — the SAME set `@jini-ai/cms/media`'s `DEFAULT_ALLOWED_MIME_TYPES` accepts, which is the
 * ceiling `uploadMedia` enforces on the very next call regardless of what this tool lets through.
 *
 * `video/mp4`/`video/webm` (2026-09-07): previously excluded here on the reasoning that a video is
 * never re-encoded by the transform pipeline (its public URL serves the original bytes as-is), so
 * importing one is a "fetch a remote file and republish it byte-for-byte from our origin" primitive —
 * a materially different thing to authorize than importing an image that gets decoded and re-encoded
 * on the way out. That distinction was real but not a reason to reject the request: `media_upload_asset`
 * already lets an agent put an arbitrary video's bytes in the library today (it accepts
 * `DEFAULT_ALLOWED_MIME_TYPES` verbatim, video included — `@jini-ai/cms/media`'s `agent-tools.ts`),
 * and `resolveMediaPublicUrls` (`features/media/tool-registrations.ts`) already branches on the
 * sniffed content type to hand back the byte-passthrough `/m/{id}/original` route for anything
 * `video/`-prefixed — so accepting a video HERE adds no new capability the assistant could not
 * already reach one hop earlier (fetch the bytes itself, base64-encode them, call
 * `media_upload_asset`); it only removes the pointless detour. SVG stays absent for the reason
 * `DEFAULT_ALLOWED_MIME_TYPES` itself states: it needs an ingest sanitizer that does not exist yet.
 */
export const IMPORTABLE_CONTENT_TYPES: ReadonlySet<string> = new Set<SniffedContentType>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
]);

/**
 * Largest payload this tool will import. Not an independent number: it IS
 * `@jini-ai/cms/media`'s `DEFAULT_MAX_UPLOAD_BYTES`, the exact cap `uploadMedia` enforces on the
 * very next call — imported rather than restated so the two can never drift into a state where this
 * module downloads several megabytes that `uploadMedia` then throws away.
 */
export const MEDIA_IMPORT_MAX_BYTES = DEFAULT_MAX_UPLOAD_BYTES;

/** Per-request timeout. `MEDIA_IMPORT_EGRESS_POLICY.connectTimeoutMs` is a CEILING on this value,
 *  never a replacement for it (`client.ts`'s `sendWithPolicy` takes the `Math.min` of the two) —
 *  same relationship `custom-credentials`' `CREDENTIALED_REQUEST_TIMEOUT_MS` has to its own policy. */
export const MEDIA_IMPORT_TIMEOUT_MS = 20_000;

/** File extension per accepted type, for {@link buildImportFilename}. Keyed by the SNIFFED type, so
 *  an extension can never contradict the bytes. */
const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export interface FetchImageDeps {
  /** Injected, never constructed here — see this file's header, "SSRF". */
  readonly httpClient: HttpClientPort;
}

/** One successfully fetched, validated image. `contentType` is the SNIFFED type, never the served
 *  header, and is always a member of {@link IMPORTABLE_CONTENT_TYPES}. */
export interface FetchedImage {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  /**
   * The URL the bytes actually came from — the last hop after redirect resolution, parsed and
   * normalized. The value to record/report, rather than the raw input.
   *
   * The requested URL only when nothing redirected, or when the client reports no final hop
   * (2026-09-06, MI-02 — before that this was always the requested URL, so a CDN link that
   * redirected recorded a URL that served nothing). Both `tool-registrations.ts`'s `sourceUrl` and
   * {@link buildImportFilename}'s default name derive from it, which is why it follows the bytes.
   */
  readonly url: URL;
}

/**
 * Parses and scheme-checks an agent-supplied URL.
 *
 * Rejects anything the WHATWG parser cannot read as an absolute URL (a bare path, a relative
 * reference, a data URI's payload), anything that is not `https:` (so `file:`, `data:`, `gopher:`
 * and plain `http:` are all out), and any URL carrying embedded credentials. The egress policy
 * independently enforces the scheme and the credentials rule at connect time — doing it here too is
 * for the error message a caller can act on, and is explicitly NOT the control being relied upon.
 *
 * @throws {MediaImportValidationError} on any of the above.
 * @complexity O(n) in `raw.length`, once.
 */
export function parseImportUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MediaImportValidationError(
      `'url' must be an absolute URL including the scheme (for example 'https://example.com/image.png') — got '${raw}'.`
    );
  }
  if (url.protocol !== "https:") {
    throw new MediaImportValidationError(
      `'url' must use https — got '${url.protocol.replace(":", "")}'. Only https URLs can be imported.`
    );
  }
  if (url.username || url.password) {
    throw new MediaImportValidationError("'url' must not embed credentials (user:password@host).");
  }
  return url;
}

/**
 * Builds the filename the imported asset is stored under — the last path segment of the source URL,
 * aggressively sanitized, with the extension taken from the SNIFFED type rather than from whatever
 * the URL happened to end in.
 *
 * Only alphanumerics, spaces and hyphens survive, collapsed and length-bounded, so a URL containing
 * path separators, `..`, control characters, or pathological punctuation can never produce a
 * surprising name. Same treatment (and same reasoning) as `media-generation`'s own
 * `buildGeneratedFilename`: this value reaches `uploadMedia`'s title derivation, never a filesystem
 * path — the blob's real on-disk location is content-addressed by sha256, not by this string.
 *
 * @complexity O(n) in the URL's last path segment, once.
 */
export function buildImportFilename(url: URL, contentType: string, override?: string): string {
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType] ?? "bin";
  const rawName = override ?? decodeLastPathSegment(url);
  const slug = rawName
    .replace(/\.[a-zA-Z0-9]{1,5}$/, "")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return `${slug || "imported-image"}.${extension}`;
}

/** The URL's last path segment, percent-decoded when it decodes cleanly. A malformed escape is not
 *  an error worth failing an import over — the sanitizer in {@link buildImportFilename} handles
 *  whatever comes back either way. */
function decodeLastPathSegment(url: URL): string {
  const segment = url.pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Turns a non-200 response into the rejection a caller should see, naming the status so an operator
 * can tell "the link expired" (403/404 — very common for signed vendor URLs) apart from "the host is
 * broken" (5xx). Split out of {@link fetchImage} to keep that function under the repo's complexity
 * ceiling.
 *
 * @complexity O(1).
 */
function buildStatusError(url: URL, status: number): MediaImportValidationError {
  const hint =
    status === 403 || status === 404
      ? " Signed or time-limited image URLs expire quickly — ask for a fresh URL rather than retrying this one."
      : "";
  return new MediaImportValidationError(`fetching '${url.href}' returned HTTP ${status}, not an image.${hint}`);
}

/**
 * Validates a fetched body and identifies it — the "the bytes are what the bytes say they are" half
 * of this module, extracted from {@link fetchImage} so it is testable against a byte array directly
 * and so neither function carries both the I/O and the whole rule set.
 *
 * Order matters and is deliberate: truncation is checked BEFORE sniffing, because a clipped image
 * still carries valid magic bytes in its first few bytes and would sniff as a perfectly good PNG.
 *
 * `bytesTruncated` is a verdict about THESE bytes and nothing else — `HttpResponse.bodyBytesTruncated`,
 * never the OR-of-both-shapes `bodyTruncated` (2026-09-06, MI-01). Passing the latter refused whole
 * images because a lossy UTF-8 decode this module never reads had crossed the policy cap.
 *
 * @throws {MediaImportValidationError} bytes truncated, empty, over {@link MEDIA_IMPORT_MAX_BYTES},
 *   or not one of {@link IMPORTABLE_CONTENT_TYPES}.
 * @complexity O(1) beyond `sniffContentType`'s own fixed-window magic-byte scan.
 */
export function validateImageBytes(url: URL, bytes: Uint8Array, bytesTruncated: boolean): string {
  if (bytesTruncated || bytes.byteLength > MEDIA_IMPORT_MAX_BYTES) {
    throw new MediaImportValidationError(
      `the image at '${url.href}' exceeds the ${MEDIA_IMPORT_MAX_BYTES}-byte import limit. Nothing was saved — a partially downloaded image would be a corrupt file, not a smaller one.`
    );
  }
  if (bytes.byteLength === 0) {
    throw new MediaImportValidationError(`'${url.href}' returned an empty response body — there is nothing to import.`);
  }
  const contentType = sniffContentType(bytes);
  if (!IMPORTABLE_CONTENT_TYPES.has(contentType)) {
    throw new MediaImportValidationError(
      `'${url.href}' is not an importable file: its actual bytes are '${contentType}'. ` +
        `Only ${[...IMPORTABLE_CONTENT_TYPES].join(", ")} can be imported (the served Content-Type header is deliberately ignored — the bytes decide).`
    );
  }
  return contentType;
}

/**
 * Fetches one file through the SSRF-guarded client and returns its validated bytes.
 *
 * The response's own `Content-Type` header is read nowhere in this function, on purpose: it is
 * remote-controlled metadata about remote-controlled bytes, and trusting it is precisely the gap
 * `routes/admin/media/upload.ts` and `media_generate_asset` both already close by sniffing after the
 * fact. {@link validateImageBytes} decides the type from the payload itself.
 *
 * The returned `url` is the hop that SERVED the bytes, not the one that was asked for — see
 * {@link FetchedImage.url} and {@link resolveSourceUrl}. Validation errors still name the requested
 * URL, which is the one a caller can act on.
 *
 * @throws {MediaImportValidationError} for a bad URL, a non-200 status, or a body that fails
 *   {@link validateImageBytes}. A transport-level failure (DNS, timeout, or an `EgressPolicy`
 *   refusal — including every SSRF rejection) propagates from the client as its own error, uncaught
 *   here: those are not shape problems and must not be reported as though a different input would
 *   fix them.
 * @complexity One outbound HTTPS GET (plus up to `MEDIA_IMPORT_EGRESS_POLICY.maxRedirects` re-checked
 *   hops), then O(1) validation.
 */
export async function fetchImage(deps: FetchImageDeps, input: { url: string }): Promise<FetchedImage> {
  const url = parseImportUrl(input.url);

  const response = await deps.httpClient.send({
    method: "GET",
    url: url.href,
    headers: { Accept: "image/*, video/*" },
    timeoutMs: MEDIA_IMPORT_TIMEOUT_MS,
  });

  if (response.status < 200 || response.status >= 300) {
    throw buildStatusError(url, response.status);
  }

  const bytes = response.bodyBytes;
  if (bytes === undefined) {
    // Structurally unreachable in production — `transport.fetch.ts` always populates `bodyBytes`.
    // Reachable only from a hand-written `HttpClientPort` double that predates that field, in which
    // case failing loudly is correct: the alternative is re-deriving bytes from the LOSSY `bodyText`,
    // which would store a UTF-8-mangled image and call it a success.
    throw new MediaImportValidationError(
      `the HTTP client returned no raw bytes for '${url.href}' — refusing to reconstruct image data from its lossy text decoding.`
    );
  }

  // The BYTE half's own flag. The `??` fallback is for a client that reports only the coarse
  // `bodyTruncated`: that names no shape, so it still has to count as "these bytes may be clipped".
  // It cannot fire in production — `client.ts`'s `capResponse` always sets `bodyBytesTruncated`
  // whenever it sets `bodyBytes`, and a response with no `bodyBytes` was already refused above.
  const bytesTruncated = response.bodyBytesTruncated ?? response.bodyTruncated === true;

  const contentType = validateImageBytes(url, bytes, bytesTruncated);
  return { bytes, contentType, url: resolveSourceUrl(url, response.finalUrl) };
}

/**
 * The URL to record as an import's source: the final hop the client reports, when it reports one that
 * parses, and otherwise the URL that was requested.
 *
 * A client predating `HttpResponse.finalUrl` reports nothing, and a value that does not parse can
 * only come from a hand-written double — in both cases the requested URL is a true, if less precise,
 * answer. Neither blanking the field nor throwing is right: the bytes are good, and only their LABEL
 * was unavailable.
 *
 * @complexity O(n) in `reported.length`, once.
 */
function resolveSourceUrl(requested: URL, reported: string | undefined): URL {
  if (reported === undefined) return requested;
  try {
    return new URL(reported);
  } catch {
    return requested;
  }
}
