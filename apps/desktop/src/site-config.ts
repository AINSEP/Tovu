/**
 * @file A site's own `config.json` — reading its display name, and the one operation that writes
 * it back. Split out of `project-ipc.ts` because the validation and the atomic write are the whole
 * substance of a rename and both deserve direct tests, while `project-ipc.ts`'s own handlers are
 * about IPC shape and registry bookkeeping.
 *
 * **WHY THIS WRITES A FILE `repairSite` REFUSES TO OVERWRITE.** `apps/website`'s `repairSite`
 * writes `config.json` too, and refuses outright when either marker file already exists — "a repair
 * must never overwrite an existing marker file". That refusal is about the OTHER marker.
 * `.site-meta.json` carries `{schemaVersion, schemaTag}`, which `tovu serve`/`bootSiteDir` compare
 * against the runtime's bundled migration identity BEFORE the database is opened, so a wrong stamp
 * makes `serve` silently skip a migration the database still needs — "stamping the WRONG version is
 * worse than no stamp at all". `config.json` sits inside that refusal only because `repairSite`
 * writes the PAIR as a single commit marker.
 *
 * A rename changes one string in `config.json` and never touches `.site-meta.json`, so it cannot
 * cause that harm at all. It is a different operation, not a way around the invariant — and it
 * carries its own guard instead (`project-ipc.ts`'s `handleRename`, for identity; this file, for
 * validity and atomicity).
 *
 * **WHY THE NAME IS VALIDATED HERE AND NOT ONLY IN THE UI.** `tovu serve` re-validates
 * `config.json.name` at EVERY boot (`platform/site-dir/read-site-dir.ts`'s `validateConfig`:
 * required, 1..200 chars after trim) and throws `SITE_DIR_INVALID` when it fails. So a bad name
 * does not break the running site — it breaks the NEXT one, long after the dialog is gone, with an
 * error that names a file the operator never edited. That delayed fuse is why the rule is enforced
 * on this side of the wire too, rather than trusted to a disabled Save button.
 *
 * No `electron` import, so all of it is testable under plain `node --test` — same convention as
 * `tracked-sites.ts`, `site-dir-store.ts` and `site-process-registry.ts`.
 */
import fs from "node:fs";
import path from "node:path";

const CONFIG_FILE_NAME = "config.json";

/** `read-site-dir.ts`'s own corruption guard, mirrored: a `config.json` larger than this is not a
 *  config file, and parsing it is not worth the memory. */
const MAX_CONFIG_BYTES = 64 * 1024;

/** `validateConfig`'s bound (`read-site-dir.ts`), after trimming. */
const NAME_MAX_LENGTH = 200;

/**
 * The trimmed name, or `null` when it is not a name `tovu serve` would accept.
 *
 * Pure and exported so the renderer's own pre-check can enforce exactly this rule rather than an
 * approximation of it — one source of truth for "is this a legal site name", checked on both sides
 * of the wire. Trims first, like `validateConfig` does: `"   "` is empty, not length 3.
 *
 * @param raw the operator's untrimmed input.
 * @returns the trimmed name, or `null` for a non-string, an empty/whitespace-only one, or one
 *   longer than 200 characters after trimming.
 * @complexity O(n) in the input length.
 */
export function normalizeSiteName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > NAME_MAX_LENGTH) return null;
  return trimmed;
}

/**
 * Parse `siteDir`'s `config.json`, or `null` when it is absent, oversized, or not a JSON object.
 *
 * `null` rather than a throw because both callers below already have a better error to report: the
 * rename path refuses with an operator-facing sentence naming the directory, and a caller that only
 * wanted the name has `path.basename` to fall back to.
 *
 * @complexity O(n) in file size, bounded by {@link MAX_CONFIG_BYTES}.
 */
function readSiteConfig(siteDir: string): Record<string, unknown> | null {
  const filePath = path.join(siteDir, CONFIG_FILE_NAME);
  try {
    if (fs.statSync(filePath).size > MAX_CONFIG_BYTES) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Write `name` into `siteDir`'s `config.json` as its display name, preserving every other key.
 *
 * **Read-modify-write, never a fresh `{name, domain, port}`.** `ConfigJson` is documented as an
 * "additive-only compatibility surface" shared with this shell, so rebuilding the object from the
 * three keys this shell happens to know about would silently drop any field a newer Tovu added —
 * a data loss with no error and no symptom until something downstream misses it.
 *
 * **Atomic: temp file in the SAME directory, then rename.** A plain `writeFileSync` that is
 * interrupted leaves a truncated `config.json`, which fails `validateConfig` and stops the site
 * booting at all — turning a cosmetic edit into an unbootable site. A same-directory rename is
 * atomic on every filesystem this app runs on, so the file is either the old one or the new one and
 * never half of either. The temp name carries the pid so two instances renaming two different sites
 * cannot collide on it.
 *
 * @param siteDir the site's install directory. The caller has already established it IS a site.
 * @param rawName the operator's untrimmed input.
 * @returns the trimmed name that was written.
 * @throws {Error} operator-facing, when the name is invalid or `config.json` cannot be read or
 *   written. The name check runs BEFORE anything is written, so a refusal leaves the file untouched.
 * @complexity O(n) in file size — one read, one write, one rename.
 */
export function writeSiteName(siteDir: string, rawName: unknown): string {
  const name = normalizeSiteName(rawName);
  if (name === null) {
    throw new Error(
      `A site name must be 1 to ${NAME_MAX_LENGTH} characters once surrounding spaces are removed. ` +
        `Tovu re-checks this every time the site starts, so an empty name would stop it booting.`,
    );
  }

  const config = readSiteConfig(siteDir);
  if (config === null) {
    throw new Error(
      `${path.join(siteDir, CONFIG_FILE_NAME)} could not be read as a site config, so there is ` +
        `nothing to rename. The site may have been moved, or the file edited by hand.`,
    );
  }

  const filePath = path.join(siteDir, CONFIG_FILE_NAME);
  const tempPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify({ ...config, name }, null, 2)}\n`);
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    // Best-effort: a temp file left behind would be picked up by nothing, but it is litter inside
    // the operator's own site directory, which is the one place this app should leave none.
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // The original write already failed; the cleanup failing too changes nothing to report.
    }
    throw new Error(`${filePath} could not be written: ${(error as Error).message}`);
  }

  return name;
}
