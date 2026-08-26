import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

import type { Express } from "express";

/**
 * @file `fetchPublishedPage()` — renders ONE route of this site's own public surface and returns
 * what a visitor would actually receive: status, headers, cookie shapes and (bounded) body.
 *
 * Why this exists as a sibling of `site-profile.ts` rather than a bigger snapshot (2026-08-26
 * swarm-consensus, "config truth vs. render truth", agreed 5/5): a configuration snapshot can
 * truthfully report "cookie-consent widget: installed, enabled" while the published page renders
 * nothing of the sort. This codebase has three render paths that do not agree, and configuration is
 * not one of them. Anything that must know what is LIVE has to fetch the live thing.
 *
 * ---------------------------------------------------------------------------
 * This is an SSRF-shaped surface. Here is why it structurally is not one.
 * ---------------------------------------------------------------------------
 *
 * The tool takes a **path**, never a URL. There is no caller-supplied host, scheme, port or
 * credential anywhere in this module, so there is no allowlist to get wrong and no redirect hop to
 * re-validate against a denylist of private ranges.
 *
 * The origin is one this process CREATES for the duration of a single call: `createSiteApp()`'s own
 * Express app on an ephemeral `127.0.0.1` port, exactly the way `export/site-exporter.ts` already
 * renders the site for a static export. Nothing in the input can steer that origin. Even a caller
 * that smuggles an absolute URL past the string checks would fail the explicit
 * `url.origin === base.origin` assertion in {@link resolveSameOriginPath}, which compares against
 * the origin this module minted rather than against a pattern.
 *
 * On top of that, the path itself is validated allowlist-style before it is used
 * ({@link resolveSameOriginPath}): must be root-relative, no protocol-relative `//` prefix, no
 * backslashes, no control characters (CR/LF request splitting), no `..` segments after a single
 * percent-decode, and not under `/api/` — see that function's own doc for why each one is there.
 *
 * `redirect: "manual"` is deliberate: a 30x is EVIDENCE (a compliance consumer wants to know the
 * privacy-policy URL redirects), and following it automatically would be the one place a
 * server-controlled `Location` could walk this fetch off-origin.
 *
 * ---------------------------------------------------------------------------
 * What is and is not returned
 * ---------------------------------------------------------------------------
 * - **All response headers except `set-cookie`.** An allowlist would defeat the point: "does this
 *   site emit an unexpected header" is exactly the kind of question this tool exists to answer.
 *   These are headers this site's own code emits; none of them is a stored credential.
 * - **`set-cookie` is projected to name + attributes, never a value** ({@link toCookieShapes}).
 *   For the compliance case the cookie NAME and its `Secure`/`HttpOnly`/`SameSite`/`Max-Age`
 *   attributes are the whole signal; the value is the only part that could carry a session token.
 * - **The body, capped** at {@link DEFAULT_MAX_BODY_BYTES} with an explicit `truncated` flag. The
 *   read stops at the cap rather than buffering the whole response and slicing afterwards, so a
 *   pathologically large route cannot be turned into a memory-exhaustion lever.
 */

/** Body bytes returned when the caller does not ask for a different cap. */
export const DEFAULT_MAX_BODY_BYTES = 200_000;

/** Hard ceiling on `maxBytes`, whatever the caller asks for. */
export const MAX_MAX_BODY_BYTES = 1_000_000;

/** Longest path string accepted before validation even begins. */
export const MAX_PATH_LENGTH = 2_048;

/** Wall clock for one render+fetch, including booting the ephemeral app. */
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

/** The origin this module mints for every call. Fixed loopback host; only the port varies. */
const LOOPBACK_HOST = "http://127.0.0.1";

/**
 * True when `value` contains a C0/C1 control character or DEL.
 *
 * A character-code scan rather than a regex literal, deliberately: a regex holding raw control
 * bytes makes this source file read as binary to ordinary text tooling, and the escaped form is
 * easy to mangle in transit. CR/LF are the load-bearing members — a control character in a
 * request target is HTTP request splitting — and the rest are refused on the same
 * "reject, never silently sanitize" rule.
 *
 * @param value - The candidate string.
 * @returns `true` if any code unit is <= 0x1F, or in 0x7F..0x9F.
 * @complexity O(L) in the string length.
 * @example hasControlCharacter("/ok"); // => false
 */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/**
 * Raised when `path` is not a fetchable same-origin site path. Its own class so the tool layer can
 * publish the input schema back with it: every rejection here is one a DIFFERENT `path` would fix.
 */
export class PublishedPagePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishedPagePathError";
  }
}

/** One `Set-Cookie` header, with the value removed. */
export interface PublishedPageCookieShape {
  name: string;
  /** `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, ... — verbatim, minus the `name=value` pair. */
  attributes: string[];
}

export interface PublishedPageResult {
  /** The canonical path actually requested, after normalization — not the raw caller string. */
  path: string;
  status: number;
  /** `true` for 2xx only. A 30x/404 is a successful OBSERVATION, so the call does not throw. */
  ok: boolean;
  /** Response headers, lowercased, `set-cookie` excluded (see {@link cookies}). */
  headers: Record<string, string>;
  /** `Set-Cookie` headers with their values stripped — see this file's header. */
  cookies: PublishedPageCookieShape[];
  /** Bytes actually read into {@link body} (not `Content-Length`, which may disagree). */
  bodyBytes: number;
  /** `true` when the cap stopped the read before the response ended. */
  truncated: boolean;
  body: string;
}

export interface FetchPublishedPageDeps {
  /**
   * The SAME Express factory the static exporter renders through
   * (`RouteDeps.createSiteApp`). Declared with METHOD syntax, and passed the deps bag itself, so
   * this port satisfies BOTH shapes that field has had: the older
   * `(routeDeps: RouteDeps) => Express` (which needs the argument) and the newer nullary
   * `() => Express` (which ignores it). Method-syntax parameters are bivariant, so a real
   * `RouteDeps`-typed implementation assigns to this narrower declaration without a cast, and the
   * object handed in at runtime IS the composition root's real deps bag.
   */
  createSiteApp(routeDeps: unknown): Express;
}

export interface FetchPublishedPageOptions {
  /** Body bytes to keep, clamped to `[1, MAX_MAX_BODY_BYTES]`. */
  maxBytes?: number | undefined;
  /** Wall clock for the whole call. */
  timeoutMs?: number | undefined;
}

/**
 * Refuses any `..` segment in a raw path, before and after ONE percent-decode.
 *
 * Runs on the RAW string rather than a parsed `URL.pathname` because `new URL()` resolves `..`
 * away silently — see the call site's own comment. One decode pass is the right depth: a
 * double-encoded `%252e%252e` decodes to the literal text `%2e%2e`, which a static-file handler
 * treats as a filename, not as traversal.
 *
 * @param pathOnly - The raw path with any query string already removed.
 * @param raw - The caller's original string, for the error message.
 * @throws {PublishedPagePathError} On a raw or singly-encoded `..` segment, or on a malformed
 * percent-encoding (which cannot be decoded and therefore cannot be cleared).
 * @complexity O(L) in the path length.
 * @example assertNoTraversalSegment("/a/%2e%2e/b", "/a/%2e%2e/b"); // throws
 */
function assertNoTraversalSegment(pathOnly: string, raw: string): void {
  for (const segment of pathOnly.split("/")) {
    if (segment === "..") {
      throw new PublishedPagePathError(`path must not contain a '..' segment (encoded or not): '${raw}'.`);
    }
    if (!segment.includes("%")) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new PublishedPagePathError(`path contains a malformed percent-encoding: '${raw}'.`);
    }
    if (decoded === "..") {
      throw new PublishedPagePathError(`path must not contain a '..' segment (encoded or not): '${raw}'.`);
    }
  }
}

/**
 * Validates and canonicalizes a caller-supplied site path against the loopback origin this module
 * minted, following canonicalize-then-validate order.
 *
 * Each rule closes a specific hole rather than being defensive in general:
 * - **must be a non-empty string within {@link MAX_PATH_LENGTH}** — bounds the work every later
 *   check does.
 * - **must start with `/`** — rejects an absolute URL (`http://evil.example/x`) and a bare relative
 *   path, both of which would resolve somewhere other than this site's root.
 * - **must not start with `//`** — a protocol-relative URL resolves to a DIFFERENT HOST while still
 *   starting with a slash. This is the single most commonly missed same-origin bypass.
 * - **no backslash anywhere** — `\` is treated as `/` by URL parsers and browsers, so `/\evil.com`
 *   is a protocol-relative URL wearing a disguise.
 * - **no C0/C1 control characters** — CR/LF in a request target is HTTP request splitting; NUL and
 *   friends are path-truncation tricks.
 * - **`new URL(raw, base)` must keep `base`'s origin** — the structural assertion. Everything above
 *   is belt; this is braces, and it compares against the origin this process minted rather than
 *   against a pattern someone has to keep correct.
 * - **no `..` segment after ONE percent-decode** — blocks `%2e%2e` and its double-encoded variants
 *   from reaching a static-file handler. `..` cannot escape the origin, but it can escape a
 *   directory, and a single decode pass is enough because the check runs on the decoded form and
 *   rejects a remaining `%` sequence that decodes to a traversal.
 * - **not under `/api/`** — the site app and the admin API share one Express app. The admin API is
 *   session-gated, so an unauthenticated in-process request already fails, but "a published page"
 *   is a claim about the public site and this tool must not become a second, unaudited door to the
 *   API surface. Defense in depth, stated as a rule rather than relied on as a side effect.
 *
 * @param raw - The caller's path, untrusted.
 * @param base - The loopback origin this call minted, e.g. `http://127.0.0.1:53142`.
 * @returns The canonical `pathname + search` to request, re-encoded by the URL parser.
 * @throws {PublishedPagePathError} With a message naming the specific rule that rejected it, so the
 * model can fix the input in one turn instead of guessing.
 * @complexity O(L) in the path length, bounded by {@link MAX_PATH_LENGTH}.
 * @example resolveSameOriginPath("/blog/hello", "http://127.0.0.1:53142"); // => "/blog/hello"
 */
export function resolveSameOriginPath(raw: unknown, base: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new PublishedPagePathError("path must be a non-empty string, e.g. '/' or '/blog/hello'.");
  }
  if (raw.length > MAX_PATH_LENGTH) {
    throw new PublishedPagePathError(`path must be at most ${MAX_PATH_LENGTH} characters, got ${raw.length}.`);
  }
  if (!raw.startsWith("/")) {
    throw new PublishedPagePathError(
      `path must start with '/' — this tool fetches a route on THIS site and never accepts a full URL or a remote host. Got '${raw}'.`,
    );
  }
  if (raw.startsWith("//")) {
    throw new PublishedPagePathError(
      "path must not start with '//' — a protocol-relative path resolves to a different host, which this tool never fetches.",
    );
  }
  if (raw.includes("\\")) {
    throw new PublishedPagePathError("path must not contain a backslash — URL parsers treat '\\' as '/'.");
  }
  if (hasControlCharacter(raw)) {
    throw new PublishedPagePathError("path must not contain control characters (including CR/LF).");
  }
  // BEFORE `new URL()`, because the URL parser RESOLVES `..` away rather than reporting it:
  // `new URL("/a/../../etc/passwd", base).pathname` is already `/etc/passwd`, so a check on the
  // parsed pathname sees nothing to reject. Silent normalization is exactly the "rewrite rather
  // than refuse" behavior this validator must not have — a caller that wrote `..` gets told so.
  assertNoTraversalSegment(raw.split("?")[0] ?? "", raw);

  const baseUrl = new URL(base);
  let resolved: URL;
  try {
    resolved = new URL(raw, baseUrl);
  } catch {
    throw new PublishedPagePathError(`path is not a valid URL path: '${raw}'.`);
  }
  if (resolved.origin !== baseUrl.origin) {
    throw new PublishedPagePathError(
      `path resolved off-origin (to '${resolved.origin}') — this tool only fetches routes on this site.`,
    );
  }

  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(resolved.pathname);
  } catch {
    throw new PublishedPagePathError(`path contains a malformed percent-encoding: '${raw}'.`);
  }
  if (decodedPathname.includes("\\") || hasControlCharacter(decodedPathname)) {
    throw new PublishedPagePathError("path decodes to a backslash or control character, which is refused.");
  }
  if (decodedPathname.toLowerCase().startsWith("/api/")) {
    throw new PublishedPagePathError(
      "path must not target '/api/' — that is the authenticated admin/API surface, not a published page.",
    );
  }

  return `${resolved.pathname}${resolved.search}`;
}

/**
 * Strips the value from each `Set-Cookie` header, keeping the name and the attribute list.
 *
 * `Headers.getSetCookie()` is used rather than `headers.get("set-cookie")` because the latter joins
 * multiple cookies with `, `, which is ambiguous (an `Expires` attribute legally contains a comma)
 * and would corrupt the split.
 *
 * @param headers - The fetch response's headers.
 * @returns One entry per `Set-Cookie` header, in wire order. Empty array when none were sent.
 * @complexity O(C * A) in cookie count and attributes per cookie — both bounded by the response.
 * @example toCookieShapes(res.headers); // => [{ name: "sid", attributes: ["Path=/", "HttpOnly"] }]
 */
export function toCookieShapes(headers: Headers): PublishedPageCookieShape[] {
  const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  return raw.map((cookie) => {
    const parts = cookie.split(";");
    const pair = parts[0] ?? "";
    const equals = pair.indexOf("=");
    return {
      name: (equals >= 0 ? pair.slice(0, equals) : pair).trim(),
      attributes: parts.slice(1).map((part) => part.trim()).filter((part) => part.length > 0),
    };
  });
}

/**
 * Reads at most `maxBytes` from a fetch response body, stopping the stream once the cap is hit.
 *
 * Stops rather than buffering-then-slicing so an unexpectedly large route cannot be used to
 * exhaust memory. Decoding is UTF-8 and non-strict, so a multi-byte character split by the cap
 * degrades to a replacement character instead of throwing.
 *
 * @param response - The fetch response.
 * @param maxBytes - Cap, already clamped by the caller.
 * @returns The decoded text, how many bytes were read, and whether the cap stopped the read.
 * @complexity O(min(B, maxBytes)) in the response size.
 * @example await readBoundedBody(res, 200_000);
 */
export async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<{ body: string; bodyBytes: number; truncated: boolean }> {
  if (!response.body) return { body: "", bodyBytes: 0, truncated: false };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - total;
      if (value.byteLength >= remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {
      // The response is already being abandoned; a cancel failure adds nothing the caller can act on.
    });
  }

  return { body: new TextDecoder("utf-8").decode(Buffer.concat(chunks)), bodyBytes: total, truncated };
}

/** Resolves once the server is fully closed. Mirrors `export/site-exporter.ts`'s own teardown. */
async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

/** Clamps `maxBytes` into `[1, MAX_MAX_BODY_BYTES]`, defaulting when absent or nonsensical. */
function resolveMaxBytes(requested: number | undefined): number {
  if (requested === undefined || !Number.isInteger(requested) || requested < 1) return DEFAULT_MAX_BODY_BYTES;
  return Math.min(requested, MAX_MAX_BODY_BYTES);
}

/**
 * Fetches one route of this site's own published surface and reports exactly what came back.
 *
 * Boots the site's real Express app on an ephemeral loopback port for the duration of ONE call,
 * requests the validated path, and tears the server down in a `finally` — the same lifecycle
 * `export/site-exporter.ts` uses to render a static export, so this observes the real render path
 * rather than a second, agreeing-today copy of it.
 *
 * A per-call server rather than a memoized one is deliberate: a long-lived listening socket in the
 * agent daemon would be a resource with no owner, and the cost here (route registration plus a
 * loopback round trip) is nothing against the LLM turn that requested it.
 *
 * @param deps - Supplies `createSiteApp` (see {@link FetchPublishedPageDeps} for why the signature
 * is written the way it is).
 * @param input.path - A root-relative path on this site, e.g. `/` or `/blog/hello?page=2`.
 * @param options.maxBytes - Body bytes to keep, clamped to `[1, MAX_MAX_BODY_BYTES]`.
 * @param options.timeoutMs - Wall clock for the whole call, default {@link DEFAULT_FETCH_TIMEOUT_MS}.
 * @returns A {@link PublishedPageResult}. A 404 or 30x is a RESULT, not an error — the caller
 * asked what is live, and "nothing is there" is a true answer.
 * @throws {PublishedPagePathError} When `path` fails {@link resolveSameOriginPath}.
 * @throws {Error} Named `PublishedPageTimeoutError` when the render exceeds `timeoutMs`.
 * @complexity O(min(B, maxBytes)) in the rendered response size, plus one Express app construction.
 * @example
 * const live = await fetchPublishedPage(routeDeps, { path: "/privacy" }, { maxBytes: 50_000 });
 * if (live.status === 404) console.log("no privacy policy is published");
 */
export async function fetchPublishedPage(
  deps: FetchPublishedPageDeps,
  input: { path: string },
  options: FetchPublishedPageOptions = {},
): Promise<PublishedPageResult> {
  const maxBytes = resolveMaxBytes(options.maxBytes);
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  const server = createServer(deps.createSiteApp(deps));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `${LOOPBACK_HOST}:${address.port}`;

  try {
    // Validated against the origin this call just minted — see `resolveSameOriginPath`'s doc.
    const path = resolveSameOriginPath(input.path, baseUrl);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        const timeout = new Error(`rendering '${path}' exceeded ${timeoutMs}ms`);
        timeout.name = "PublishedPageTimeoutError";
        throw timeout;
      }
      throw err;
    }

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      // `set-cookie` is reported separately, with values stripped — see this file's header.
      if (key.toLowerCase() !== "set-cookie") headers[key.toLowerCase()] = value;
    });

    const { body, bodyBytes, truncated } = await readBoundedBody(response, maxBytes);

    return {
      path,
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      headers,
      cookies: toCookieShapes(response.headers),
      bodyBytes,
      truncated,
      body,
    };
  } finally {
    server.closeAllConnections?.();
    await closeServer(server);
  }
}
