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
 * to fetch a PUBLISHED PAGE) and `redirects` (its write chokepoint, which stores a `Location`
 * target, and its read gate, which checks the interpolated `Location` a visitor's browser receives)
 * are the live consumers today.
 *
 * Generic decoding and origin-tracking rationale lives in @jini-ai/http-kit/verified-origin.
 *
 * Architectural role:
 * Platform library, no I/O. `routing` already owns the shared URL vocabulary Menus/SEO/Redirects
 * were deliberately stopped from each reinventing (see this directory's INFO.md), which is the same
 * reason this rule lives here rather than inside either consumer.
 */

import {
  hasControlCharacter as sharedHasControlCharacter,
  checkSitePathname as sharedCheckSitePathname,
  checkSiteRelativeTarget as sharedCheckSiteRelativeTarget,
} from "@jini-ai/http-kit/verified-origin";

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
export const RESERVED_SEGMENTS: ReadonlySet<string> = new Set<ReservedSurface>(["admin", "api"]);

/** C0/C1 check delegated to the generic site-path owner.
 * @param value any string; returns whether it contains a control character.
 * @complexity O(value.length).
 * @example hasControlCharacter("/ok"); // false
 */
export function hasControlCharacter(value: string): boolean {
  return sharedHasControlCharacter({ value }, {});
}

/** Check an already-parsed URL against this app's reserved surfaces.
 * @param url a URL already established to be on this site's origin.
 * @returns The unchanged reserved-path verdict, narrowed to Tovu's two surfaces.
 * @complexity O(url.pathname.length).
 * @example checkSitePathname(new URL("http://site.invalid/admin")); // reserved: admin
 */
export function checkSitePathname(url: URL): SitePathCheck {
  return sharedCheckSitePathname({ url, reservedSegments: RESERVED_SEGMENTS }, {}) as SitePathCheck;
}

/** Check an untrusted relative target against this app's reserved surfaces.
 * @param raw a raw site-relative reference; parsing and origin tracking belong to the shared owner.
 * @returns The unchanged relative-target verdict, narrowed to Tovu's two surfaces.
 * @complexity O(raw.length).
 * @example checkSiteRelativeTarget("/new"); // ok
 */
export function checkSiteRelativeTarget(raw: string): SiteRelativeTargetCheck {
  return sharedCheckSiteRelativeTarget({ raw, reservedSegments: RESERVED_SEGMENTS }, {}) as SiteRelativeTargetCheck;
}
