/**
 * @file The ONE rule for "does this site path belong to the admin application rather than to the
 * public site".
 *
 * Purpose:
 * The site app and the admin application share a single Express app —
 * `admin-static.ts` mounts the admin SPA at `app.use("/admin", ...)` and `core.ts` mounts the
 * session gate at `app.use("/api/admin", ...)`, alongside `/api/runs`, `/api/tools` and friends.
 * So a "site path" a caller hands to a public-site feature can silently name the authenticated
 * surface instead. Several features need to refuse that, and each one refusing it slightly
 * differently is how a bypass gets built: `site-inspection`'s `published_page_fetch` (which claims
 * to fetch a PUBLISHED PAGE) and `redirects`'s write chokepoint (which stores a `Location` the
 * server later sends to a visitor's browser) are the two live consumers today.
 *
 * Why the rule is not `path.startsWith("/admin")`:
 * - `/administer-survey` is ordinary site content and must keep working, so the comparison is per
 *   SEGMENT, not per prefix.
 * - `/%61dmin` is `/admin` to every browser and server that decodes it, so the comparison happens
 *   AFTER one percent-decode, not on the raw bytes.
 * - `/ADMIN` reaches the same Express mount (Express matches paths case-insensitively by default),
 *   so the comparison is case-folded.
 * - `/blog/../admin` is `/admin` by the time a browser issues the request, so dot segments are
 *   resolved first.
 *
 * Architectural role:
 * Platform library, no I/O. `routing` already owns the shared URL vocabulary Menus/SEO/Redirects
 * were deliberately stopped from each reinventing (see this directory's INFO.md), which is the same
 * reason this rule lives here rather than inside either consumer.
 */

/** A path that lands on the admin application instead of the public site. */
export type ReservedSurface = "admin" | "api";

/** {@link checkSitePathname}'s verdict. Every arm is a refusal except `ok`. */
export type SitePathCheck =
  | { kind: "ok" }
  /** `decodeURIComponent` threw — a stray or truncated `%` sequence. */
  | { kind: "malformed-encoding" }
  /** Decodes to a backslash (a `/` to URL parsers) or a C0/C1 control character (CR/LF splitting). */
  | { kind: "disallowed-character" }
  | { kind: "reserved"; surface: ReservedSurface };

/** {@link checkSiteRelativeTarget}'s verdict — {@link SitePathCheck} plus the two structural arms
 *  that only apply when the input is still a raw, unparsed reference. */
export type SiteRelativeTargetCheck =
  | SitePathCheck
  /** `new URL()` could not parse it at all. */
  | { kind: "unparseable" }
  /** Parses, but resolves to a DIFFERENT host — e.g. `/\evil.example`, which starts with a single
   *  slash yet is `//evil.example` to a URL parser, so a `startsWith("//")` test never sees it. */
  | { kind: "off-origin" };

/** The segment names the admin application owns. Compared case-folded, one segment deep. */
const RESERVED_SEGMENTS: ReadonlySet<string> = new Set<ReservedSurface>(["admin", "api"]);

/**
 * A host this deployment can never actually reach, used only so `new URL()` has a base to resolve
 * a site-relative reference against. `.invalid` is reserved by RFC 2606 precisely for this.
 */
const PROBE_ORIGIN = "http://reserved-path-probe.invalid";

/**
 * Whether `value` contains a C0 or C1 control character.
 *
 * CR/LF in a request target is HTTP request splitting and in a `Location` header is response
 * splitting; NUL and friends are path-truncation tricks.
 *
 * @param value - Any string, already decoded or not.
 * @returns `true` if any code unit is in `U+0000`–`U+001F` or `U+007F`–`U+009F`.
 * @complexity O(n) in the string length.
 * @example hasControlCharacter("/ok"); // => false
 */
export function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/**
 * Resolve `.` and `..` segments, RFC 3986 §5.2.4 style, on an already-decoded path.
 *
 * Done by hand rather than with a second `new URL()` pass because a decoded path can contain a
 * literal `?` or `#` (from `%3F`/`%23`), and the URL parser would treat those as a query/fragment
 * delimiter and TRUNCATE the path — turning `/x#/../admin` into `/x` and losing the very segment
 * this check exists to find. A browser does no such thing: it never decodes `%23` before splitting
 * the path, so the truncation would be a false negative, not a match for real behavior.
 *
 * Empty segments are dropped, so `//admin` collapses to `/admin`. That is deliberately stricter
 * than a URL parser (which preserves `//`); over-matching here only ever refuses more.
 *
 * @param path - A decoded path, expected to start with `/`.
 * @returns The path with dot segments removed, always starting with `/`.
 * @complexity O(n) in the path length.
 * @example resolveDotSegments("/blog/../admin"); // => "/admin"
 */
function resolveDotSegments(path: string): string {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return `/${out.join("/")}`;
}

/**
 * The actual per-segment rule, on a pathname string that is guaranteed to have come from a real
 * `URL` (see {@link checkSitePathname}, this function's only two callers). Kept private: a bare
 * string carries no proof it was ever parsed — the query/fragment stripping, dot-segment removal
 * relative to a real origin, etc. are exactly what `new URL()` already did before either caller
 * reaches this. Do not export this directly.
 *
 * Order is load-bearing: decode ONCE, then resolve dot segments, then compare the first segment
 * case-folded. Decoding first is what catches `/%61dmin`; resolving dot segments after the decode
 * is what catches `/blog/%2e%2e/admin`. A single decode pass matches what a browser and Express
 * actually do — `/%2561dmin` decodes to `/%61dmin`, which is genuinely not `/admin` on the wire.
 *
 * @param pathname - An already-parsed `URL`'s `.pathname` (no query, no fragment).
 * @returns `{ kind: "ok" }` when it is ordinary site content; otherwise the arm naming the refusal.
 * @complexity O(n) in the pathname length.
 */
function checkDecodedSitePathname(pathname: string): SitePathCheck {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { kind: "malformed-encoding" };
  }
  if (decoded.includes("\\") || hasControlCharacter(decoded)) return { kind: "disallowed-character" };

  const first = (resolveDotSegments(decoded).split("/")[1] ?? "").toLowerCase();
  if (RESERVED_SEGMENTS.has(first)) return { kind: "reserved", surface: first as ReservedSurface };
  return { kind: "ok" };
}

/**
 * Classify an already-parsed URL's pathname against the admin application's URL space.
 *
 * Takes the {@link URL} itself, not a bare pathname string, so this cannot be handed a raw,
 * unparsed reference by accident: a string has no way to prove it went through `new URL()` first,
 * and this rule's whole design (see the module doc) depends on comparing the DECODED, dot-resolved
 * form a URL parser would actually produce. A caller that only has a raw string — a stored redirect
 * target, anything from user input — must go through {@link checkSiteRelativeTarget} instead, which
 * parses it (and rejects what doesn't parse) before this check ever runs.
 *
 * @param url - An already-parsed `URL`; only `url.pathname` is read.
 * @returns `{ kind: "ok" }` when it is ordinary site content; otherwise the arm naming the refusal.
 * @complexity O(n) in the pathname length.
 * @example checkSitePathname(new URL("/administer-survey", "http://x.invalid")); // => { kind: "ok" }
 * @example checkSitePathname(new URL("/%61dmin/settings", "http://x.invalid")); // => { kind: "reserved", surface: "admin" }
 */
export function checkSitePathname(url: URL): SitePathCheck {
  return checkDecodedSitePathname(url.pathname);
}

/**
 * Classify a raw, site-relative reference (a stored redirect target, a caller-supplied path)
 * against the admin application's URL space, including the structural check that it is site-
 * relative at all.
 *
 * The structural pass runs FIRST and matters on its own: `/\evil.example` begins with exactly one
 * slash, so a `startsWith("//")` or scheme test calls it site-relative, while `new URL()` — and
 * every browser following a `Location` — reads the backslash as a separator and lands on
 * `evil.example`. Resolving against a probe origin and asserting the origin survived is a
 * structural answer to that instead of a pattern someone has to keep correct.
 *
 * @param raw - The untrusted reference, expected to be site-relative.
 * @returns `{ kind: "ok" }` when it stays on this site and names ordinary content; otherwise the
 * arm naming the refusal.
 * @complexity O(n) in the reference length.
 * @example checkSiteRelativeTarget("/new"); // => { kind: "ok" }
 * @example checkSiteRelativeTarget("/\\evil.example"); // => { kind: "off-origin" }
 */
export function checkSiteRelativeTarget(raw: string): SiteRelativeTargetCheck {
  if (hasControlCharacter(raw)) return { kind: "disallowed-character" };
  let parsed: URL;
  try {
    parsed = new URL(raw, PROBE_ORIGIN);
  } catch {
    return { kind: "unparseable" };
  }
  if (parsed.origin !== PROBE_ORIGIN) return { kind: "off-origin" };
  return checkSitePathname(parsed);
}
