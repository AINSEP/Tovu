/**
 * @file "Add Tovu Website" — the one implementation behind all three ways an operator points this
 * app at a site folder that already exists: the Projects header button (IPC), `tovu-desktop
 * add-site` (CLI), and the `add_site_pointer` MCP tool the assistant reaches through
 * `mcp-bridge.mjs`. One function, three entry points, so the three can never disagree about what
 * counts as a site or about what adding one does to the operator's files.
 *
 * **POINTER SEMANTICS, and this is the whole point of the file existing.** The registry stores the
 * PATH. Nothing is moved, nothing is copied, and nothing is created. That is why this cannot be
 * `adoptSiteDir` (`site-dir-store.js`) even though the name sounds right: `adoptSiteDir` is a
 * fixed-policy wrapper over `resolveOrInitSiteDir({onMissingSite: "init"})`, so handing it an EMPTY
 * folder runs `tovu init` and creates a site there. For "Open Site…" that is correct — a person just
 * picked an empty folder and meant "start one here". For "Add Tovu Website" it is exactly wrong: the
 * operator is naming a site they already have, so an empty folder is a MISTAKE to report (a typo, an
 * unmounted volume, a folder they meant to pick the parent of), never an invitation to write into.
 * So this calls {@link classifySiteDir} directly and admits `"site"` and nothing else.
 *
 * The row is always `SITE_ORIGIN.adopted`, stated rather than defaulted — see
 * {@link addSitePointer}. A pointer can therefore never authorize `project-ipc.js`'s `fs.rm`.
 *
 * No `electron` import, so every path here is testable under plain `node --test` — the same
 * convention `project-registry.js` and `site-dir-store.js` follow, and the reason the CLI and the
 * MCP bridge can both call it without an Electron runtime at all.
 */
import path from "node:path";

import { SITE_ORIGIN, isSiteDirKnown, readTrackedSites, trackSite } from "./project-registry.js";
import { classifySiteDirSafely } from "./site-dir-store.js";

/**
 * A refusal an operator (or a model) can act on, carrying a stable `code` so a caller can branch
 * without matching prose.
 *
 * Separate from a bare `Error` because this function has three callers rendering its failures three
 * different ways — a native dialog, a CLI exit line, and an MCP tool result — and the two that are
 * not prose (the CLI's exit code, the tool's structured result) must not have to parse a sentence to
 * tell "you typed the wrong path" apart from "this app is broken".
 */
class AddSitePointerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AddSitePointerError";
    this.code = code;
  }
}

/**
 * What to say about every {@link classifySiteDirSafely} verdict that is not `"site"`.
 *
 * A table rather than a chain of `if`s so adding a verdict is one row, and so the refusals stay
 * visibly EXHAUSTIVE: a future fifth classification that nobody maps here reaches
 * {@link refusalFor}'s fallback and is refused, rather than falling through the bottom of an `if`
 * chain and being silently admitted. Fail-closed is the direction that matters — the admitted arm
 * is what tracks a stranger's folder.
 *
 * Each message names the FIX, not just the fault: these are read by someone who mistyped a path or
 * pointed at a parent directory, and by a model that has to decide what to try next.
 */
const REFUSALS = Object.freeze({
  empty: {
    code: "SITE_DIR_EMPTY",
    describe: (dir) =>
      `${dir} does not exist, or is an empty folder — there is no Tovu site here to add. ` +
      `Adding a website only ever points at a site that already exists; it never creates one. ` +
      `Check the path, or use "Create website" to make a new site in an empty folder.`,
  },
  incomplete: {
    code: "SITE_DIR_INCOMPLETE",
    describe: (dir) =>
      `${dir} looks like a half-initialized or damaged Tovu site — it is missing one of the two ` +
      `files every site has (config.json and .site-meta.json). Repairing it is not something ` +
      `adding a website will do. Point at a complete site's folder instead.`,
  },
  occupied: {
    code: "SITE_DIR_OCCUPIED",
    describe: (dir) =>
      `${dir} is a folder of unrelated files, not a Tovu site (no config.json and no ` +
      `.site-meta.json). If your site lives in a subfolder, point at that subfolder instead.`,
  },
  unreadable: {
    code: "SITE_DIR_UNREADABLE",
    describe: (dir) =>
      `${dir} cannot be examined — it may be on an unmounted volume, be a broken symlink, or deny ` +
      `this app permission to read it. Nothing was added.`,
  },
});

/** The refusal for one non-`"site"` verdict, with an unmapped verdict refused rather than admitted
 *  — see {@link REFUSALS}. @complexity O(1). */
function refusalFor(kind, dir) {
  const refusal = REFUSALS[kind];
  if (refusal === undefined) {
    return new AddSitePointerError("SITE_DIR_UNUSABLE", `${dir} is not a usable Tovu site (${kind}). Nothing was added.`);
  }
  return new AddSitePointerError(refusal.code, refusal.describe(dir));
}

/**
 * The absolute, normalized form of an operator-supplied path.
 *
 * Absolute because the registry keys rows by exact string and `discoverSiteDirs` only ever writes
 * absolute paths — a relative row would be a second row for a site that is already tracked, and
 * would resolve against whatever cwd a later reader happened to have. Resolved against `cwd`
 * explicitly rather than implicitly so the CLI's relative argument (`tovu-desktop add-site
 * ./sites/x`) means what a shell user expects.
 *
 * Deliberately NOT `fs.realpathSync`. A symlinked site dir IS a site (`project-registry.js`'s
 * `isDiscoverableSite` says so on purpose), and `discoverSiteDirs` does not resolve links either —
 * resolving here would let the scan and this function record two different strings for one site and
 * show the operator two cards.
 *
 * @complexity O(n) in the path length.
 */
function normalizeSiteDirPath(rawSiteDir, cwd) {
  return path.resolve(cwd, rawSiteDir);
}

/**
 * Track an EXISTING Tovu site folder as a project, or refuse with a specific reason. Never creates,
 * moves, copies, initializes, or opens anything — see this file's header.
 *
 * Idempotent: a folder that is already tracked reports `alreadyTracked: true` and leaves its row
 * untouched (`trackSite` neither duplicates nor bumps it), so a model retrying a call, a rescan
 * racing the button, and an operator double-clicking all converge on one row.
 *
 * A folder the operator previously REMOVED is added back, and that is deliberate rather than an
 * oversight: `trackSite` is `project-registry.js`'s explicit adder, and clearing the tombstone
 * there is documented as correct precisely because reaching it means the operator named the folder
 * themselves. `alreadyDismissed` is reported so a caller can say "this was one you removed" rather
 * than having the return resurrect a card with no explanation.
 *
 * @param input.siteDir the folder to point at. Absolute, or relative to `input.cwd`.
 * @param input.projectsPath `project-registry.js`'s tracked-project JSON file.
 * @param input.cwd base for a relative `siteDir`. Defaults to `process.cwd()`.
 * @param input.classifySiteDir injected classifier, defaulting to `site-dir-store.js`'s
 *   throw-free form — injected for the same reason `seedDevFallbackSite` takes it, so the
 *   decision is testable without a real directory, and SAFE rather than throwing because a caller
 *   here is an MCP tool and a CLI, neither of which should turn an EACCES into a stack trace.
 * @returns `{siteDir, alreadyTracked, alreadyDismissed}` — `siteDir` normalized, so a caller
 *   reports the path that was actually recorded rather than the one it was handed.
 * @throws {AddSitePointerError} when `siteDir` is not a complete Tovu site. Nothing is written on
 *   any throwing path.
 * @complexity O(n) in the tracked-row count, plus `classifySiteDir`'s own cost.
 */
function addSitePointer(input) {
  const classify = input.classifySiteDir ?? classifySiteDirSafely;
  const siteDir = normalizeSiteDirPath(input.siteDir, input.cwd ?? process.cwd());

  const kind = classify(siteDir);
  if (kind !== "site") throw refusalFor(kind, siteDir);

  // Read BEFORE the write, because afterwards both answers are gone: `trackSite` is idempotent
  // and clears the tombstone, so a caller asking after the fact cannot tell a fresh add from a
  // no-op, nor an ordinary add from the restoration of a project the operator had removed.
  const alreadyTracked = readTrackedSites(input.projectsPath).some((row) => row.siteDir === siteDir);
  const alreadyDismissed = !alreadyTracked && isSiteDirKnown(input.projectsPath, siteDir);

  // ALWAYS `adopted`, and passed explicitly rather than left to `trackSite`'s default. This
  // folder existed as a site before this app ever saw it — every byte under it is someone else's —
  // and `project-delete-guard.js` reads exactly this field to decide whether a later delete may
  // reach `fs.rm`. `created` here would hand a stranger's site to a recursive erase.
  trackSite(input.projectsPath, siteDir, SITE_ORIGIN.adopted);

  return { siteDir, alreadyTracked, alreadyDismissed };
}

export { AddSitePointerError, addSitePointer, normalizeSiteDirPath };
