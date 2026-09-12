/**
 * @file The one rule that stands between a two-click card overlay and `fs.rm(dir, {recursive: true,
 * force: true})`.
 *
 * `project-ipc.js`'s `handleDelete` erases a project's whole install directory — `content.db`,
 * `uploads/`, `themes/`, `agent-plugins/` — with no backup and no OS trash, because that is the
 * honest meaning of "delete this project" for a project the app itself provisioned. It is NOT the
 * honest meaning for a directory the app merely ADOPTED. `main.js` seeds the Projects screen with
 * `<repo>/sites/tovu-com` (`seedDevFallbackSite`), a git-tracked folder holding a real production
 * database that this app did not create a single byte of; the moment that folder classifies as a
 * site, a card for it appears and two clicks would destroy it.
 *
 * **Three independent tests, all of which must pass before anything is erased:**
 *
 * 1. *Provenance* ({@link SITE_ORIGIN}) — only a row this app recorded as `created` is erasable.
 *    This is the general rule: it protects every adopted folder anywhere on the disk, not just the
 *    ones that happen to live in a checkout.
 * 2. *Containment* — nothing under `repoRoot` is erasable, whatever its row claims. This is the
 *    backstop for the specific asset at risk, and it survives a row whose provenance is wrong:
 *    a hand-edited `desktop-projects.json`, a future seeding path that forgets to say `adopted`, or
 *    an operator who points "+ Create website" at a folder inside the checkout.
 * 3. *Identity* ({@link isStillTheRecordedSite}) — the site actually living at that path right now
 *    must be the same site whose creation produced the row. Tests 1 and 2 are both properties of the
 *    ROW, and a row is a path string in a JSON file; a path is not an identity. An operator who moves
 *    their site elsewhere and lets something else take its old path leaves a row whose provenance and
 *    containment are both still perfectly true about a directory this app never made — and the card
 *    even renders under the NEW site's name, since `readSiteName` reads whatever `config.json` is
 *    there now. That is the whole of SEC-01/D-04, and no amount of reasoning about the row can catch
 *    it: only asking the live directory who it is can.
 *
 * No test subsumes another, which is why all three are here rather than one. All fail CLOSED:
 * anything this module cannot positively prove safe is refused, and a refusal costs the operator a
 * leftover folder they can delete in Finder, while a wrong permission costs them their content.
 *
 * **Consequence of test 3, stated rather than hidden:** a `created` row written before identity was
 * recorded carries no `siteId`, so it is refused and its delete removes the card only. That is the
 * fail-closed direction — the alternative would be to trust exactly the rows this test exists to
 * distrust — and it self-corrects for every project created from here on.
 *
 * No `electron` import, so all of it is testable under plain `node --test` — same convention as
 * `tracked-sites.js` and `site-dir-store.ts`.
 */
import fs from "node:fs";
import path from "node:path";

import { SITE_ORIGIN } from "./tracked-sites.ts";
import { SITE_META_FILE } from "./site-dir-store.ts";

/**
 * A tracked-project row, as loosely as {@link mayEraseSiteDirectory} must tolerate it: every field
 * may be garbage, missing, or of the wrong type (a hand-edited `desktop-projects.json`, or a test
 * proving the fail-closed direction), and this module must refuse rather than throw or admit it.
 */
interface RowLike {
  siteDir?: unknown;
  origin?: unknown;
  siteId?: unknown;
  [key: string]: unknown;
}

/** {@link mayEraseSiteDirectory}'s second argument — just as loosely typed as {@link RowLike}. */
interface MayEraseOptions {
  repoRoot?: unknown;
  [key: string]: unknown;
}

/**
 * The identity a site carries in its own directory — `.site-meta.json`'s `siteId`, the UUID
 * `tovu init` stamps once at creation and nothing afterwards rewrites.
 *
 * Chosen over an inode/device pair on purpose. Both distinguish "the site I created" from "whatever
 * is at that path now", but `st_dev` is a property of the MOUNT, not of the directory: it is free to
 * change across a reboot or a re-mounted external volume, which would silently downgrade every
 * later delete of a perfectly ordinary project to a card-removal. `siteId` is content the site
 * carries with it — it survives a move, a reboot, a copy, and a restore from backup, and a
 * DIFFERENT site has a different one, which is exactly the discrimination this guard needs.
 *
 * @returns the site's id, or `null` when the directory is absent, unreadable, holds no
 *   `.site-meta.json`, holds one that is not JSON, or holds one with no usable `siteId` — every one
 *   of which is "cannot prove identity", and all of which the caller must treat identically.
 * @complexity O(1) — one file read.
 */
function readSiteIdentity(siteDir: string): string | null {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(siteDir, SITE_META_FILE), "utf8")) as { siteId?: unknown };
    return typeof meta?.siteId === "string" && meta.siteId !== "" ? meta.siteId : null;
  } catch {
    return null;
  }
}

/**
 * Whether the site living at `row.siteDir` right now is the one whose creation wrote `row`.
 *
 * A row with no recorded `siteId` (written before this test existed, or hand-edited) can never
 * satisfy this — it has nothing to compare — so it is refused rather than grandfathered.
 *
 * @complexity O(1) beyond {@link readSiteIdentity}'s own file read.
 */
function isStillTheRecordedSite(row: RowLike | undefined): boolean {
  if (typeof row?.siteId !== "string" || row.siteId === "") return false;
  return readSiteIdentity(row.siteDir as string) === row.siteId;
}

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
function resolveRealPath(target: string): string {
  const absolute = path.resolve(target);
  const unresolved: string[] = [];
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
function isInsideDirectory(target: string, container: string): boolean {
  const relative = path.relative(resolveRealPath(container), resolveRealPath(target));
  if (relative === "") return true;
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Whether deleting `row`'s project may erase its directory from disk, or must only drop its card.
 *
 * The single authority for that decision. `handleDelete` calls it, and `buildSiteRecord` calls it
 * too so the renderer can label the button with what will actually happen — the UI must never be
 * left to re-derive this rule for itself and drift from it.
 *
 * @param row a row from `readTrackedSites`, whose `origin` is already normalized fail-closed by that
 *   function. `siteId` is present only on rows `trackSite` wrote as `created` once identity
 *   recording existed. Typed loosely (every field `unknown`) because a hand-edited registry file, or
 *   a row written before a field existed, must be refused rather than crash this check.
 * @param options.repoRoot the Tovu checkout root. A missing or non-string value refuses everything:
 *   containment cannot be PROVEN without it, and this module never permits what it cannot prove.
 *   `main.js` always supplies it, so that arm is a guard against a future miswiring, not a
 *   reachable operator state.
 * @returns `true` only when the app created the directory, it lives outside the repo, AND the site
 *   at that path is still the one the app created.
 * @complexity O(depth) — {@link isInsideDirectory}'s cost plus one file read, and only for a
 *   `created` row.
 */
function mayEraseSiteDirectory(row: RowLike | undefined, options: MayEraseOptions | undefined): boolean {
  if (row?.origin !== SITE_ORIGIN.created) return false;
  if (typeof options?.repoRoot !== "string" || options.repoRoot === "") return false;
  if (!isStillTheRecordedSite(row)) return false;
  return !isInsideDirectory(row!.siteDir as string, options.repoRoot); // row!: the line 178 check above already returned false for an undefined row via optional chaining, but that does not narrow `row` itself
}

export {
  resolveRealPath,
  isInsideDirectory,
  readSiteIdentity,
  isStillTheRecordedSite,
  mayEraseSiteDirectory,
};
