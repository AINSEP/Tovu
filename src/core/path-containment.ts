import path from "node:path";

/**
 * @file Shared containment check for any path built by joining a trusted `root` with an
 * untrusted `segment` (a request path segment, a URL extracted from crawled HTML). Extracted
 * 2026-08-21 from two near-identical copies — `export/site-exporter.ts`'s asset-path resolver and
 * `server/middleware/theme-static-assets.ts`'s theme-id resolver — so the check is tested once
 * instead of twice untested.
 */

/**
 * Resolves `<root>/<segment>` and refuses (returns `null`) unless the result stays strictly
 * within `root`. Two different escapes are checked, not one duplicated:
 * `resolved !== path.join(root, segment)` catches `path.resolve` diverging from a naive join —
 * the case where `root` itself was not already absolute, so `resolve` silently anchors against
 * `process.cwd()` instead; `!resolved.startsWith(root + sep)` catches `segment` carrying enough
 * `../` to walk back out of an (already-absolute) `root` even though both agree on the
 * normalized result.
 */
export function resolvePathWithin(root: string, segment: string): string | null {
  const resolved = path.resolve(root, segment);
  if (resolved !== path.join(root, segment)) return null;
  if (!resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}
