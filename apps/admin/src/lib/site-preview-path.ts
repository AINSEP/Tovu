/**
 * @file Validates a caller-supplied path for `admin.show_site_page`'s `<iframe src>` — the admin-side
 * sibling of `apps/website/src/features/site-inspection/published-page.ts`'s
 * `resolveSameOriginPath`, which cannot be imported here: apps/website and apps/admin are separate
 * builds with no shared-types package for this (the same cross-boundary-string discipline
 * `ADMIN_CAPTURE_SCREENSHOT_CAPABILITY_ID`'s own module doc already relies on).
 *
 * The rules are reimplemented, not merely copied, because this validator protects a DIFFERENT
 * threat from its sibling's. `resolveSameOriginPath` fetches in-process with no cookies at all, so
 * an authenticated admin route is someone else's problem there. This one builds an `<iframe src>`
 * that loads in the OPERATOR'S OWN browser, carrying their real admin session cookie — so a path
 * under `/admin` would render authenticated admin content (or, chained with
 * `admin.capture_screenshot`, an authenticated admin API response under a same-origin iframe) inside
 * what is supposed to be a read-only preview of the PUBLIC site. See
 * `ADS-memory/.local-artifacts/handoffs/2026-09-15-view-site-tool-PLAN.md` §Q4 Finding 2 for the full
 * chain this closes.
 *
 * Rules 1-7 below are unchanged from `resolveSameOriginPath`'s own doc, which explains each one at
 * length; only rule 8's `/api/` refusal is carried over verbatim; the `/admin` refusal in rule 8 is
 * THIS file's own addition and is load-bearing, not defence-in-depth.
 */

/** Longest path string accepted before validation even begins. Matches
 *  `published-page.ts`'s `MAX_PATH_LENGTH` — no reason for the two limits to disagree. */
export const MAX_SITE_PREVIEW_PATH_LENGTH = 2_048;

/**
 * True when `value` contains a C0/C1 control character or DEL. A character-code scan rather than a
 * regex literal — see `published-page.ts`'s identical helper for why (a regex holding raw control
 * bytes reads as binary to ordinary text tooling).
 *
 * @complexity O(L) in the string length.
 */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** Raised when a caller-supplied path is not a showable same-origin site path. Its own class, like
 *  `PublishedPagePathError`, so every rejection here is one a DIFFERENT path would fix. */
export class SitePreviewPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SitePreviewPathError";
  }
}

/**
 * Refuses a raw or once-percent-decoded `..` segment. Runs on the RAW string, before `new URL()`
 * resolves `..` away silently — see `published-page.ts`'s identical helper and its call site comment
 * for why this must run first.
 *
 * @throws {SitePreviewPathError} On a raw or singly-encoded `..` segment, or a malformed encoding.
 * @complexity O(L) in the path length.
 */
function assertNoTraversalSegment(pathOnly: string, raw: string): void {
  for (const segment of pathOnly.split("/")) {
    if (segment === "..") {
      throw new SitePreviewPathError(`path must not contain a '..' segment (encoded or not): '${raw}'.`);
    }
    if (!segment.includes("%")) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new SitePreviewPathError(`path contains a malformed percent-encoding: '${raw}'.`);
    }
    if (decoded === "..") {
      throw new SitePreviewPathError(`path must not contain a '..' segment (encoded or not): '${raw}'.`);
    }
  }
}

/**
 * The syntactic rejections that operate on the raw caller value, before any URL parsing happens.
 * Split out purely to keep {@link resolveAdminSitePreviewPath}'s own complexity below the repo's
 * gate of 9 — the checks, their order, and every message mirror `published-page.ts`'s own split.
 *
 * @throws {SitePreviewPathError} On the first rule `raw` fails.
 * @returns `raw`, narrowed to `string`, once every rule has passed.
 */
function assertRawPathShape(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new SitePreviewPathError("path must be a non-empty string, e.g. '/' or '/blog/hello'.");
  }
  if (raw.length > MAX_SITE_PREVIEW_PATH_LENGTH) {
    throw new SitePreviewPathError(`path must be at most ${MAX_SITE_PREVIEW_PATH_LENGTH} characters, got ${raw.length}.`);
  }
  if (!raw.startsWith("/")) {
    throw new SitePreviewPathError(
      `path must start with '/' — this tool shows a route on THIS site and never accepts a full URL or a remote host. Got '${raw}'.`,
    );
  }
  if (raw.startsWith("//")) {
    throw new SitePreviewPathError(
      "path must not start with '//' — a protocol-relative path resolves to a different host, which this tool never shows.",
    );
  }
  if (raw.includes("\\")) {
    throw new SitePreviewPathError("path must not contain a backslash — URL parsers treat '\\' as '/'.");
  }
  if (hasControlCharacter(raw)) {
    throw new SitePreviewPathError("path must not contain control characters (including CR/LF).");
  }
  // BEFORE `new URL()` — see `published-page.ts`'s identical comment: the URL parser resolves `..`
  // away rather than reporting it, so a check on the parsed pathname would see nothing to reject.
  assertNoTraversalSegment(raw.split("?")[0] ?? "", raw);
  return raw;
}

/**
 * Parses `raw` against `base` and asserts the result stayed on that origin. Split out purely to
 * keep {@link resolveAdminSitePreviewPath}'s own complexity below the repo's gate.
 *
 * @throws {SitePreviewPathError} If `raw` does not parse, or parses off-origin.
 */
function resolveWithinOrigin(raw: string, base: URL): URL {
  let resolved: URL;
  try {
    resolved = new URL(raw, base);
  } catch {
    throw new SitePreviewPathError(`path is not a valid URL path: '${raw}'.`);
  }
  if (resolved.origin !== base.origin) {
    throw new SitePreviewPathError(
      `path resolved off-origin (to '${resolved.origin}') — this tool only shows routes on this site.`,
    );
  }
  return resolved;
}

/** `true` for `/admin` itself or any `/admin/...` sub-path, case-insensitively; `false` for a
 *  sibling segment that merely starts with the same letters (e.g. `/administer-survey`), which is
 *  why this compares the FIRST SEGMENT rather than using a bare `startsWith("/admin")`.
 *
 *  Empty segments are dropped before that comparison, so `//admin` and `///admin` are caught too.
 *  The earlier `const [, firstSegment] = …split("/")` read index 1 unconditionally, which made
 *  `//admin` present a first segment of `""` and pass — reachable because the ONLY caller feeds this
 *  a once-percent-DECODED string, where `/%2fadmin` becomes exactly that.
 *  @complexity O(L) in the path length, bounded by {@link MAX_SITE_PREVIEW_PATH_LENGTH}. */
function isAdminAppPath(decodedPathname: string): boolean {
  const [firstSegment] = decodedPathname
    .toLowerCase()
    .split("/")
    .filter((segment) => segment !== "");
  return firstSegment === "admin";
}

/**
 * The two refused destinations, checked against one already-decoded pathname. Extracted so the
 * decoded form AND its re-resolved form (see {@link assertDecodedFormStaysInBounds}) are checked by
 * the same code rather than two copies that could drift apart.
 *
 * @throws {SitePreviewPathError} On a path under `/api/`, or one that is the admin app itself.
 */
function assertPathnameNotRefused(pathname: string): void {
  if (pathname.toLowerCase().startsWith("/api/")) {
    throw new SitePreviewPathError(
      "path must not target '/api/' — that is the authenticated admin/API surface, not a published page.",
    );
  }
  // ⚠️ Load-bearing, not defence-in-depth (see this file's own header, §Q4 Finding 2): the iframe
  // this path feeds carries the operator's admin session cookie, so `/admin` must be refused here
  // even though `resolveSameOriginPath` (its unauthenticated sibling) has no equivalent rule.
  if (isAdminAppPath(pathname)) {
    throw new SitePreviewPathError(
      "path must not target '/admin' — that is the admin application itself, not a published page. Showing " +
        "it here would render an authenticated admin surface inside this preview.",
    );
  }
}

/**
 * Re-resolves the DECODED pathname against `base` and re-runs {@link assertPathnameNotRefused} on
 * the result.
 *
 * Why a second resolve rather than trusting the first: `new URL()` deliberately does NOT decode
 * `%2f`/`%5c`, and only collapses a `..` segment when the segment is EXACTLY `..`/`%2e%2e`. So
 * `/%2e%2e%2fadmin`, `/a/..%2fadmin` and `/a/%252e%252e/admin` all survive the first resolve intact,
 * and their once-decoded form (`/../admin`, `/a/../admin`) is a plain string whose first segment is
 * `..` or `a` — which a string-only check reads as "not admin". Resolving that decoded string is
 * what turns it back into the `/admin` it denotes. Any consumer that decodes before routing (a
 * reverse proxy, a rewrite rule, a future non-Express server) would do exactly this, so the
 * validator has to refuse what they would resolve, not only what this server happens to match today.
 *
 * @throws {SitePreviewPathError} If the decoded form does not parse, leaves `base`'s origin (the
 * `//host` case a decoded `%2f%2f` produces), or resolves to a refused path.
 */
function assertDecodedFormStaysInBounds(decodedPathname: string, raw: string, base: URL): void {
  let renormalized: URL;
  try {
    renormalized = new URL(decodedPathname, base);
  } catch {
    throw new SitePreviewPathError(`path is not a valid URL path once decoded: '${raw}'.`);
  }
  if (renormalized.origin !== base.origin) {
    throw new SitePreviewPathError(
      `path decodes to an off-origin reference (to '${renormalized.origin}') — this tool only shows routes on this site.`,
    );
  }
  assertPathnameNotRefused(renormalized.pathname);
}

/**
 * Decodes the resolved pathname once and asserts it carries none of the forms this file's own doc
 * refuses. Split out purely to keep {@link resolveAdminSitePreviewPath}'s own complexity below the
 * repo's gate — the decode-once rule mirrors `published-page.ts`'s identical helper.
 *
 * @throws {SitePreviewPathError} On a malformed encoding, a decoded backslash/control character, a
 * decoded path under `/api/`, or a decoded path that is — or resolves to — the admin app itself.
 */
function assertNoDisallowedDecodedForm(resolved: URL, raw: string, base: URL): void {
  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(resolved.pathname);
  } catch {
    throw new SitePreviewPathError(`path contains a malformed percent-encoding: '${raw}'.`);
  }
  if (decodedPathname.includes("\\") || hasControlCharacter(decodedPathname)) {
    throw new SitePreviewPathError("path decodes to a backslash or control character, which is refused.");
  }
  assertPathnameNotRefused(decodedPathname);
  assertDecodedFormStaysInBounds(decodedPathname, raw, base);
}

/**
 * Validates and canonicalizes a caller-supplied site path for `admin.show_site_page`'s iframe `src`,
 * following canonicalize-then-validate order — see this file's own header for the full rule list and
 * why rule 8's `/admin` refusal exists only here.
 *
 * @param raw - The caller's path, untrusted.
 * @param origin - The origin to resolve and compare against. Defaults to `window.location.origin`
 * (the real call site never passes this explicitly); a test passes an explicit origin so this stays
 * testable with no real `window.location`.
 * @returns The canonical `pathname + search` to show, re-encoded by the URL parser.
 * @throws {SitePreviewPathError} With a message naming the specific rule that rejected it.
 * @complexity O(L) in the path length, bounded by {@link MAX_SITE_PREVIEW_PATH_LENGTH}.
 * @example resolveAdminSitePreviewPath("/blog/hello", window.location.origin); // => "/blog/hello"
 */
export function resolveAdminSitePreviewPath(raw: unknown, origin: string = window.location.origin): string {
  const path = assertRawPathShape(raw);
  const base = new URL(origin);
  const resolved = resolveWithinOrigin(path, base);
  assertNoDisallowedDecodedForm(resolved, path, base);
  return `${resolved.pathname}${resolved.search}`;
}
