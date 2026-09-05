import fs from "node:fs";
import path from "node:path";

import { writeFileAtomic } from "./atomic-write.js";

/**
 * @file Admin "Sites" screen backend, activate half (2026-09-04 sites-switcher decision,
 * `ADS-memory/reports/2026-09-04-sites-switcher-decision.md`).
 *
 * `siteDir()` (`server/runtime/composition/deps.ts`) resolves `TOVU_SITE_DIR`/`TOVU_SITE` once, at
 * process boot, and `content.db`/uploads/themes all bind off that single resolution — a running
 * server cannot swap its own database out from under itself (see that function's own doc). The
 * owner was told this and chose the design anyway: **activate = persist the choice, then a human
 * restarts.** No process may kill, signal, or re-exec itself to pick this up (standing rule — an
 * admin API that terminates the server on a click is explicitly out of scope for this slice).
 *
 * Persistence target: the repo-root `.env` file `development/scripts/dev.mjs` already loads via
 * `process.loadEnvFile` before its children (the API server included) ever read `process.env` —
 * the one place local-dev config already persists across restarts in this codebase; no new config
 * system invented. `persistActiveSite` upserts exactly ONE line (`TOVU_SITE=<name>`) and leaves
 * every other line — secrets included — byte-identical, via the same temp-file+rename atomic-write
 * discipline `init-site.ts`'s `.site-meta.json` write already uses (`atomic-write.ts`).
 *
 * Daemon-cwd trap (`reference_daemon_inherits_cwd_not_site_dir`) — investigated, not a new risk
 * here: `daemon-supervisor.ts`'s `buildDaemonSpawnEnvOverrides` already threads `TOVU_SITE_DIR`
 * from the PARENT's own resolved `siteDir()` into every daemon spawn (fixed 2026-08-29, see that
 * function's own doc), rather than letting the daemon fall back to ITS OWN cwd-relative
 * `resolveSiteRoot()`. So once a human restarts `npm run dev` after an activate: `dev.mjs` reloads
 * `.env` -> the new `TOVU_SITE` reaches the API server's `process.env` -> `siteDir()` resolves the
 * NEW site at that process's own boot -> the daemon it spawns inherits that same resolved
 * `siteDir` explicitly, not cwd. The two-hop chain agrees end to end; this file introduces no new
 * disagreement between what the API serves and what the daemon opens.
 *
 * Known limitation (disclosed, not silently swallowed): `.env` is loaded only by `npm run dev`
 * (`dev.mjs`) — a process started directly (`npm start`, a container entrypoint) never reads it,
 * so a persisted choice only takes effect on the NEXT `npm run dev` boot. This is consistent with
 * this slice's capability flag (`site-switcher-enabled.ts`), which only `dev.mjs` ever turns on by
 * default — see that file's own doc for the matching disclosure.
 *
 * Architectural role: `site-dir` domain logic (INV-06) — no `express`/`cli` import.
 */

export interface ActiveSiteEnvOptional {
  /** Defaults to `process.cwd()` — the repo root when launched the normal way (`dev.mjs` sets
   *  every child's `cwd` to its own `REPO_ROOT`, and `resolveSiteRoot()`'s own default already
   *  assumes `<cwd>/sites/...`, so this reuses the same assumption rather than a second one).
   *  Injectable so a test never touches a real `.env`. */
  cwd?: string;
}

/** Absolute path to the `.env` file this module reads/writes. */
function resolveEnvFilePath(optional: ActiveSiteEnvOptional): string {
  return path.join(optional.cwd ?? process.cwd(), ".env");
}

/**
 * Upsert one `KEY=value` line into `.env`-shaped text, preserving every other line verbatim
 * (content AND order) — a matching `KEY=` prefix is replaced in place; a missing key is appended.
 * Pure text transform, no fs access, so it is trivially testable without a real file.
 *
 * @complexity O(n) in the source text's own line count — bounded by how large a developer's own
 *   `.env` file is, never by caller-controlled request input.
 */
export function upsertEnvLine(source: string, key: string, value: string): string {
  const lines = source.length === 0 ? [] : source.split("\n");
  // A trailing blank line is `split("\n")`'s own artifact of the source's final "\n" (e.g.
  // `"A\n".split("\n")` -> `["A", ""]`), not real content — drop it up front so both branches
  // below always rejoin from the same real-line list, then this function's own single trailing
  // "\n" is the only one ever added back.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const prefix = `${key}=`;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  const newLine = `${prefix}${value}`;
  if (index === -1) {
    lines.push(newLine);
  } else {
    lines[index] = newLine;
  }
  return `${lines.join("\n")}\n`;
}

export interface PersistActiveSiteRequired {
  /** The site's folder name under `sites/` (`SiteListEntry.name` — never the display name or the
   *  absolute `dir`), matching `resolveSiteRoot()`'s own `TOVU_SITE` contract (`site-root.ts`:
   *  "just the folder name under `<cwd>/sites/`"). */
  name: string;
}

/**
 * Persist `name` as the site `dev.mjs`'s NEXT boot should serve, by upserting `TOVU_SITE=<name>`
 * into the repo-root `.env`. Never touches the live process's own `process.env` or any open
 * `content.db` handle — this process keeps serving whatever it already booted with; see this
 * file's own header for why that is the deliberate design, not an oversight.
 *
 * @throws whatever the underlying `fs` call throws (e.g. `EACCES` on an unwritable repo root) —
 *   surfaced, never swallowed, so a caller can report the real reason a restart won't pick up the
 *   new site.
 * @complexity O(1) plus {@link upsertEnvLine}'s own line-count-bounded cost — never a function of
 *   caller-controlled input size.
 */
export function persistActiveSite(required: PersistActiveSiteRequired, optional: ActiveSiteEnvOptional = {}): void {
  const envFilePath = resolveEnvFilePath(optional);
  let existing: string;
  try {
    existing = fs.readFileSync(envFilePath, "utf8");
  } catch {
    // No `.env` yet (the common case: nothing has ever needed to override anything locally) — an
    // empty starting point, not a failure; `upsertEnvLine` appends the one line either way.
    existing = "";
  }
  writeFileAtomic(envFilePath, upsertEnvLine(existing, "TOVU_SITE", required.name));
}

/**
 * Read one `KEY=value` line out of `.env`-shaped text — the inverse of {@link upsertEnvLine}, and
 * deliberately just as narrow: the FIRST matching line wins (same line `upsertEnvLine` would
 * replace, so a write-then-read round trip always agrees), the value is returned verbatim with only
 * surrounding whitespace trimmed, and no `export ` prefix, quoting, or interpolation is understood.
 *
 * That narrowness is the point: this is not a `.env` parser and must never grow into one — Node's
 * own `process.loadEnvFile` is what actually interprets this file at boot, and a second, subtly
 * different interpretation living here would report a value the next boot does not use. The one
 * key this is ever asked for (`TOVU_SITE`) is written by {@link persistActiveSite} in exactly the
 * unquoted `KEY=value` form this reads.
 *
 * Pure text transform, no fs access.
 *
 * @returns The value, or `null` when no line starts with `KEY=`.
 * @complexity O(n) in the source text's own line count — bounded by the developer's own `.env`
 *   size, never by caller-controlled request input.
 */
export function readEnvLine(source: string, key: string): string | null {
  const prefix = `${key}=`;
  const match = source.split("\n").find((line) => line.startsWith(prefix));
  return match === undefined ? null : match.slice(prefix.length).trim();
}

/**
 * The site name a previous {@link persistActiveSite} call left in the repo-root `.env`, or `null`
 * when none has ever been persisted (or the file does not exist).
 *
 * This is a PENDING choice, never a statement about what this process is serving — the live binding
 * is `resolveSiteRoot()`'s, resolved at boot and unaffected by this file (see this file's header).
 * The admin Sites screen needs both to tell the operator the truth after a reload: "serving A, and
 * B is queued for the next restart" is only expressible if the queued value survives the page load
 * that forgot the activate response.
 *
 * Reads and returns ONLY the `TOVU_SITE` line's value. Every other line in `.env` — secrets
 * included — is neither parsed nor returned.
 *
 * @returns The persisted folder name, or `null` for an absent file, an absent key, or an empty
 *   value (an empty `TOVU_SITE=` is a no-op for `resolveSiteRoot`, so reporting it as a pending
 *   choice would be a lie).
 * @complexity O(n) in the `.env` file's own line count plus one file read.
 */
export function readPersistedActiveSite(optional: ActiveSiteEnvOptional = {}): string | null {
  let existing: string;
  try {
    existing = fs.readFileSync(resolveEnvFilePath(optional), "utf8");
  } catch {
    // No `.env` yet — nothing has ever been activated. Same non-failure this file's writer treats
    // an absent file as.
    return null;
  }
  const value = readEnvLine(existing, "TOVU_SITE");
  return value === null || value.length === 0 ? null : value;
}
