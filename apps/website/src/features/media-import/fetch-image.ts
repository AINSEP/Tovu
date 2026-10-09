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
 * What the package implementation, bound by this adapter, DOES own on top of the transport guard:
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
// Binary validation and source provenance live in Jini packages/cms/src/media/import/fetch-image.ts.
// URL import closes the gap between externally generated media URLs and upload/promotion tools:
// previously a human had to fetch a generated CDN image and POST its bytes to the admin API.
import {
  fetchImage as fetchPackageImage,
  validateImageBytes as validatePackageImageBytes,
  type FetchedImage,
  type ImageImportPolicy,
} from "@jini-ai/cms/media/import";
import type { HttpClientPort } from "#src/platform/http/index";
import { sniffContentType, TOVU_MAX_UPLOAD_BYTES, type SniffedContentType } from "../media/index.js";

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
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "video/mp4", "video/webm",
]);
/**
 * Largest payload this tool will import. Not an independent number: it IS `contracts/core/upload-limits.ts`'s
 * `TOVU_MAX_UPLOAD_BYTES` (this host's override of `@jini-ai/cms/media`'s 10 MiB
 * `DEFAULT_MAX_UPLOAD_BYTES`), the exact cap `tool-registrations.ts` now passes `uploadMedia` as
 * `maxUploadBytes` on the very next call — imported rather than restated so the two can never drift
 * into a state where this module downloads several megabytes that `uploadMedia` then throws away.
 */
export const MEDIA_IMPORT_MAX_BYTES = TOVU_MAX_UPLOAD_BYTES;
/** Per-request timeout. `MEDIA_IMPORT_EGRESS_POLICY.connectTimeoutMs` is a CEILING on this value,
 *  never a replacement for it (`client.ts`'s `sendWithPolicy` takes the `Math.min` of the two) —
 *  same relationship `custom-credentials`' `CREDENTIALED_REQUEST_TIMEOUT_MS` has to its own policy. */
export const MEDIA_IMPORT_TIMEOUT_MS = 20_000;

const IMPORT_POLICY = {
  maxBytes: MEDIA_IMPORT_MAX_BYTES,
  allowedContentTypes: IMPORTABLE_CONTENT_TYPES,
  sniffer: { sniff: ({ bytes }: { bytes: Uint8Array }) => sniffContentType({ bytes }) },
};

export interface FetchImageDeps {
  readonly httpClient: HttpClientPort;
  /**
   * HARNESS ONLY: exact loopback origins (`http://127.0.0.1:<port>`) whose plain-`http:` URLs are
   * imported as if they were `https:` — a site-import journey's offline fixture site. The same list
   * must have opened `httpClient` to them (`platform/http/test-origin-allowlist.ts`); every other
   * URL keeps the package's https-only refusal. Absent in every production composition.
   */
  readonly plainHttpTestOrigins?: readonly string[];
}

/**
 * The package refuses non-https URLs before any I/O. For a harness-listed origin only, hand it the
 * `https:` twin of the URL and turn that twin back into the real `http:` origin at the send and in
 * the returned source URL, so every other package check (status, bytes, sniffing) still runs.
 */
function plainHttpTwin(url: string, origins: readonly string[] | undefined): { packageUrl: string; toReal: (value: string) => string } {
  const identity = { packageUrl: url, toReal: (value: string) => value };
  if (!origins?.length || !URL.canParse(url)) return identity;
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" || !origins.includes(parsed.origin)) return identity;
  const twinOrigin = `https://${parsed.host}`;
  return {
    packageUrl: `${twinOrigin}${url.slice(parsed.origin.length)}`,
    toReal: (value) => (value.startsWith(`${twinOrigin}/`) || value === twinOrigin ? `${parsed.origin}${value.slice(twinOrigin.length)}` : value),
  };
}

/**
 * Imports binary media through Tovu's injected guarded HTTP client. The client checks DNS, pins
 * peers, and rechecks redirects; the package validates complete bytes and records the final URL.
 * @param optional.policy - Byte cap, accepted sniffed types and sniffer; defaults to this tool's
 * media policy. `theme_import_file_from_url` passes its own (fonts + still images, smaller cap) so
 * it shares this transport path, harness twin and backstop instead of copying them.
 * @param optional.accept - The request's `Accept` header; defaults to images and video.
 * @returns Validated bytes/type/source URL; package and guarded transport errors propagate.
 * @complexity One bounded GET plus redirects, fixed-window content sniffing.
 * @example await fetchImage({ deps: { httpClient }, url: "https://example.com/image.png" });
 */
export function fetchImage(
  { deps, url }: { deps: FetchImageDeps; url: string },
  { policy = IMPORT_POLICY, accept = "image/*, video/*" }: { policy?: ImageImportPolicy; accept?: string } = {},
): Promise<FetchedImage> {
  const twin = plainHttpTwin(url, deps.plainHttpTestOrigins);
  const fetched = fetchPackageImage({
    ...policy,
    url: twin.packageUrl,
    httpClient: {
      send: ({ request }) => {
        // Keep Tovu's independent transport backstop (60 MiB) above its accept limit (50 MiB).
        // The package's request cap would collapse the two; byte validation still rejects every
        // over-limit or clipped payload, with the existing feature-specific refusal wording.
        const { maxResponseBytes: _packageResponseCap, ...hostRequest } = request;
        return deps.httpClient.send({
          ...hostRequest,
          url: twin.toReal(hostRequest.url),
          headers: { ...request.headers, Accept: accept },
        });
      },
    },
    outboundGuard: { send: ({ httpClient, request }) => httpClient.send({ request }) },
  }, { timeoutMs: MEDIA_IMPORT_TIMEOUT_MS });
  if (twin.packageUrl === url) return fetched;
  return fetched.then((image) => ({ ...image, url: new URL(twin.toReal(image.url.href)) }));
}

/** Applies the same Tovu byte/type policy to guarded local reads. No I/O occurs here.
 * @returns Sniffed content type; throws the package validation error on rejected bytes.
 * @complexity Fixed-window sniffing and constant-time byte-limit checks.
 */
export function validateImageBytes(
  required: { source: URL | string; bytes: Uint8Array; bytesTruncated: boolean },
  _optional: Record<string, never> = {},
): string {
  return validatePackageImageBytes({ ...IMPORT_POLICY, ...required });
}
