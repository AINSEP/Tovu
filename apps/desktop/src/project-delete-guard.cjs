/**
 * @file The one rule that stands between a two-click card overlay and `fs.rm(dir, {recursive: true,
 * force: true})`.
 *
 * `project-ipc.cjs`'s `handleDelete` erases a project's whole install directory — `content.db`,
 * `uploads/`, `themes/`, `agent-plugins/` — with no backup and no OS trash, because that is the
 * honest meaning of "delete this project" for a project the app itself provisioned. It is NOT the
 * honest meaning for a directory the app merely ADOPTED. `main.cjs` seeds the Projects screen with
 * `<repo>/sites/tovu-com` (`seedDevFallbackProject`), a git-tracked folder holding a real production
 * database that this app did not create a single byte of; the moment that folder classifies as a
 * site, a card for it appears and two clicks would destroy it.
 *
 * **Two independent tests, both of which must pass before anything is erased:**
 *
 * 1. *Provenance* ({@link PROJECT_ORIGIN}) — only a row this app recorded as `created` is erasable.
 *    This is the general rule: it protects every adopted folder anywhere on the disk, not just the
 *    ones that happen to live in a checkout.
 * 2. *Containment* — nothing under `repoRoot` is erasable, whatever its row claims. This is the
 *    backstop for the specific asset at risk, and it survives a row whose provenance is wrong:
 *    a hand-edited `desktop-projects.json`, a future seeding path that forgets to say `adopted`, or
 *    an operator who points "+ Create website" at a folder inside the checkout.
 *
 * Neither test subsumes the other, which is why both are here rather than one. Both fail CLOSED:
 * anything this module cannot positively prove safe is refused, and a refusal costs the operator a
 * leftover folder they can delete in Finder, while a wrong permission costs them their content.
 *
 * No `electron` import, so all of it is testable under plain `node --test` — same convention as
 * `project-registry.cjs` and `site-dir-store.cjs`.
 */
const fs = require("node:fs");
const path = require("node:path");

const { PROJECT_ORIGIN } = require("./project-registry.cjs");

/**
 * `target` with every symlink resolved and the path normalized, so a containment test cannot be
 * defeated by `..`, a trailing slash, a relative segment, or a site dir that is itself a symlink
 * pointing into the repo.
 *
 * `realpathSync.native` rather than the JS implementation on purpose: on macOS the native call also
 * returns the directory's canonical on-disk CASE, so a case-insensitive filesystem cannot be used to
 * smuggle `/repo/Sites/tovu-com` past a comparison against `/repo/sites`.
 *
 * A path whose LEAF does not exist still resolves correctly: the deepest existing ancestor is
 * resolved and the remaining segments are re-appended to it. Resolving only whole paths would leave
 * a moved-or-deleted site dir under a symlinked checkout comparing as OUTSIDE the repo it is plainly
 * in — the wrong answer in the dangerous direction — because one side of the comparison would have
 * followed the symlink and the other would not.
 *
 * @returns the resolved absolute path. Falls back to `path.resolve`'s plain normalization (which
 *   still collapses `..` and trailing slashes) only when not even the filesystem root resolves.
 * @complexity O(depth) stat calls, worst case one per path segment.
 */
function resolveRealPath(target) {
  const absolute = path.resolve(target);
  const unresolved = [];
  let candidate = absolute;
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(candidate), ...unresolved);
    } catch {
      const parent = path.dirname(candidate);
      if (parent === candidate) return absolute;
      unresolved.unshift(path.basename(candidate));
      candidate = parent;
    }
  }
}

/**
 * Whether `target` is `container` itself or lives somewhere beneath it, compared on resolved real
 * paths.
 *
 * `path.relative` rather than a `startsWith` prefix test: `startsWith` would report `/repo-backup`
 * as being inside `/repo` (a false positive that refuses a legitimate delete) and would be defeated
 * by any `..` the caller had not normalized away. A relative path that is empty means "the same
 * directory"; one that neither starts with `..` nor is itself absolute means "below".
 *
 * @complexity O(depth) — two {@link resolveRealPath} calls plus a string compare.
 */
function isInsideDirectory(target, container) {
  const relative = path.relative(resolveRealPath(container), resolveRealPath(target));
  if (relative === "") return true;
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Whether deleting `row`'s project may erase its directory from disk, or must only drop its card.
 *
 * The single authority for that decision. `handleDelete` calls it, and `buildProjectRecord` calls it
 * too so the renderer can label the button with what will actually happen — the UI must never be
 * left to re-derive this rule for itself and drift from it.
 *
 * @param {{siteDir: string, origin: string}} row a row from `readTrackedProjects`, whose `origin` is
 *   already normalized fail-closed by that function.
 * @param {{repoRoot: string}} options
 * @param options.repoRoot the Tovu checkout root. A missing or non-string value refuses everything:
 *   containment cannot be PROVEN without it, and this module never permits what it cannot prove.
 *   `main.cjs` always supplies it, so that arm is a guard against a future miswiring, not a
 *   reachable operator state.
 * @returns `true` only when the app created the directory AND it lives outside the repo.
 * @complexity O(depth) — {@link isInsideDirectory}'s cost, and only for a `created` row.
 */
function mayEraseProjectDirectory(row, options) {
  if (row?.origin !== PROJECT_ORIGIN.created) return false;
  if (typeof options?.repoRoot !== "string" || options.repoRoot === "") return false;
  return !isInsideDirectory(row.siteDir, options.repoRoot);
}

module.exports = {
  resolveRealPath,
  isInsideDirectory,
  mayEraseProjectDirectory,
};
