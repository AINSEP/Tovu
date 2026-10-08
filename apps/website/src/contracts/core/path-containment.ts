/**
 * @file Shared containment check for any path built by joining a trusted `root` with an
 * untrusted `segment` (a request path segment, a URL extracted from crawled HTML).
 */

/**
 * Resolves `<root>/<segment>` and refuses (returns `null`) unless the result stays strictly
 * within `root`. Two different escapes are checked, not one duplicated:
 * `resolved !== path.join(root, segment)` catches `path.resolve` diverging from a naive join —
 * the case where `root` itself was not already absolute, so `resolve` silently anchors against
 * `process.cwd()` instead; `!resolved.startsWith(prefix)` catches `segment` carrying enough
 * `../` to walk back out of an (already-absolute) `root` even though both agree on the
 * normalized result. `prefix` is built from `path.resolve(root)` rather than raw `root` so a
 * trailing separator on `root` (or `root` being exactly `/`) can't double up into a separator
 * nothing would ever start with — that would silently refuse every valid child instead of only
 * real traversal. Calling `path.resolve` on `root` here is safe specifically because the guard
 * above already proved `root` is absolute (a relative `root` would have diverged from
 * `path.join` and returned already), so this can only normalize `root`, not re-anchor it.
 */
export { resolvePathWithin } from "@jini-ai/platform/fs";
