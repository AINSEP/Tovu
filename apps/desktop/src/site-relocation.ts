/**
 * @file A tracked project whose folder was renamed or moved heals itself. Found by the owner on the
 * 0.1.6 dmg: `sites/tovu-com` was renamed to `sites/tovu-dev` (commit bc015d6c5), and the Projects
 * screen kept a card for a folder that no longer existed. The owner's rule is that nobody should
 * have to fix that by hand, so {@link relocateMovedSites} runs from the list poll whenever something
 * could have moved ({@link createRelocationGate}):
 *
 * 1. A row whose folder is a VALID SITE gets that folder's id recorded on it (`relocationId`), once. That is
 *    what lets it be found again later — a folder that is already gone carries no id to read.
 * 2. A row whose folder is MISSING OR INVALID uses its saved siteId/relocationId (or surviving
 *    marker) among valid tracked sites, old siblings and any extra search roots. Exactly one folder with the same id: the row is
 *    repointed there, keeping its `createdAt`; if that folder is already tracked, the stale row is
 *    dropped instead of duplicating the card. Zero or several matches: the row is left exactly as it
 *    is, and the card shows it as missing with Locate / Remove (`project-ipc.ts`). Nothing is ever
 *    silently dropped.
 *
 * **The id is `siteId`, falling back to `siteKeyId`.** `tovu init` writes both today, but older
 * sites (tovu-dev itself) carry only `siteKeyId`. This is deliberately NOT `project-delete-guard.ts`'s
 * `readSiteIdentity`: that one is the proof that lets a delete ERASE a folder and must stay as strict
 * as it is. Finding a card's folder again is a much weaker act, so it gets its own field, and a moved
 * row is always written back `adopted` with no `siteId` — the app made the folder at the OLD path,
 * the operator moved it, and a later delete must not erase it at its new one.
 *
 * No `electron` import, so this is testable under plain `node --test`, like `tracked-sites.ts`.
 */
import { classifySiteDirSafely } from "./site-dir-store.ts";
import fs from "node:fs";
import path from "node:path";

import { SITE_ORIGIN, readProjectsFile, updateProjectsFile } from "./tracked-sites.ts";
import type { ProjectsFile, TrackedSiteRow, WritableTrackedRow } from "./tracked-sites.ts";

const SITE_META_FILE = ".site-meta.json";

/** What one {@link relocateMovedSites} pass did, for the caller to log. */
interface RelocationReport {
  /** Rows repointed from a missing folder to the one folder carrying the same id. */
  moved: Array<{ from: string; to: string }>;
  /** Missing folders whose site is already tracked at its new path — the stale row was dropped. */
  merged: string[];
}

/** {@link relocateMovedSites}'s options. */
interface RelocateOptions {
  /** Directories whose immediate children are also searched, beyond the old folder's siblings —
   *  in production the same `siteScanRoots` the rescan uses. */
  searchRoots?: string[];
  /** Existing site admission owner; tests may inject a classifier. */
  classifySiteDir?: typeof classifySiteDirSafely;
  /** One notice per committed relocation/merge, never per list poll. */
  report?: (message: string) => void;
}

/** {@link planRelocations}'s answer: the next rows, what changed, and whether anything did. */
interface RelocationPlan {
  rows: WritableTrackedRow[];
  report: RelocationReport;
  changed: boolean;
}

/** What {@link planRow} needs besides the row itself. */
interface PlanContext {
  /** Every site dir the next rows already point at — the merge check. */
  claimed: Set<string>;
  dismissed: string[];
  searchRoots: string[];
  knownDirs: string[];
  classifySiteDir: typeof classifySiteDirSafely;
}

/**
 * The id a site folder carries in its own `.site-meta.json` — `siteId`, else `siteKeyId`.
 *
 * @returns the id, or `null` when the folder is absent, unreadable, holds no meta file, holds one
 *   that is not JSON, or holds neither id as a non-empty string.
 * @complexity O(1) — one file read.
 */
function readRelocationId(siteDir: string): string | null {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(siteDir, SITE_META_FILE), "utf8")) as { siteId?: unknown; siteKeyId?: unknown } | null;
    const id = [meta?.siteId, meta?.siteKeyId].find((candidate): candidate is string => typeof candidate === "string" && candidate !== "");
    return id ?? null;
  } catch {
    return null;
  }
}

/** `root`'s immediate children as absolute paths; a root that cannot be read has none.
 *  @complexity O(n) in the child count. */
function childPathsOf(root: string): string[] {
  try {
    return fs.readdirSync(root).map((name) => path.join(root, name));
  } catch {
    return [];
  }
}

/**
 * The one folder that holds the missing row's site now, or `null` when there is none, when there is
 * more than one (a copy of a site carries its id too, and guessing between them is not ours to do),
 * or when the operator removed that folder from Projects on purpose.
 *
 * @complexity O(n + r * c) bounded marker reads and candidate space — n tracked dirs,
 *   r search roots, c children each. The gate bounds scans to at most once per idle minute.
 */
function relocationTarget({ row, context }: { row: TrackedSiteRow; context: PlanContext }, _options = {}): { dir: string; id: string } | null {
  // Created rows already saved the site id before relocationId existed. Never infer identity
  // from the name: different sites can legitimately share it. An invalid folder may retain a marker.
  const identity = row.siteId ?? row.relocationId ?? readRelocationId(row.siteDir);
  if (identity === null || identity === undefined) return null;
  const roots = new Set([path.dirname(row.siteDir), ...context.searchRoots]);
  const candidates = new Set([...context.knownDirs, ...[...roots].flatMap(childPathsOf)]);
  const matches = [...candidates].filter((dir) => dir !== row.siteDir && context.classifySiteDir(dir) === "site" && readRelocationId(dir) === identity);
  if (matches.length !== 1 || context.dismissed.includes(matches[0]!)) return null; // length checked on the same line, so index 0 exists
  // The target was matched BY this id, so the id travels with it rather than being read off disk again.
  return { dir: matches[0]!, id: identity };
}

/**
 * `row` pointed at `siteDir` — the same card, so its `createdAt` stays, but always `adopted` and
 * without `siteId` (see this file's header on why a moved folder is never erasable).
 *
 * @complexity O(1).
 */
function movedRow(row: TrackedSiteRow, siteDir: string, relocationId: string | null | undefined): WritableTrackedRow {
  const next: WritableTrackedRow = { siteDir, createdAt: row.createdAt, origin: SITE_ORIGIN.adopted };
  return typeof relocationId === "string" ? { ...next, relocationId } : next;
}

/**
 * One row's contribution to the plan: stamped, repointed, merged away, or kept as it is.
 *
 * @complexity O(1) bounded marker reads for a valid folder; {@link relocationTarget}'s cost for a missing one.
 */
function planRow({ plan, row, context }: { plan: RelocationPlan; row: TrackedSiteRow; context: PlanContext }, _options = {}): void {
  if (context.classifySiteDir(row.siteDir) === "site") {
    const id = row.relocationId === undefined ? readRelocationId(row.siteDir) : null;
    plan.changed ||= id !== null;
    plan.rows.push(id === null ? row : { ...row, relocationId: id });
    return;
  }
  const target = relocationTarget({ row, context });
  if (target === null) {
    plan.rows.push(row);
    return;
  }
  plan.changed = true;
  if (context.claimed.has(target.dir)) {
    plan.report.merged.push(row.siteDir);
    return;
  }
  context.claimed.add(target.dir);
  plan.report.moved.push({ from: row.siteDir, to: target.dir });
  plan.rows.push(movedRow(row, target.dir, target.id));
}

/**
 * The whole pass over one file's contents, decided without writing anything. A damaged file is left
 * alone — a list poll must never be the thing that moves its bytes aside.
 *
 * @complexity O(n) rows, plus {@link relocationTarget}'s cost per missing row.
 */
function planRelocations({ current, searchRoots, classifySiteDir }: { current: ProjectsFile; searchRoots: string[]; classifySiteDir: typeof classifySiteDirSafely }, _options = {}): RelocationPlan {
  const plan: RelocationPlan = { rows: [], report: { moved: [], merged: [] }, changed: false };
  if (current.state !== "ok") return plan;
  const context: PlanContext = { claimed: new Set(current.rows.map((row) => row.siteDir)), dismissed: current.dismissed, searchRoots, knownDirs: current.rows.map((row) => row.siteDir), classifySiteDir };
  for (const row of current.rows) planRow({ plan, row, context });
  return plan;
}

/**
 * Heal every tracked row whose folder moved, and record ids on rows whose folder is present — see
 * this file's header for the rules.
 *
 * Planned once WITHOUT the lock, and only when that finds something to do is it planned again inside
 * `updateProjectsFile`'s cross-process lock and written. The list poll runs it whenever
 * {@link createRelocationGate} says something could have moved, and the ordinary answer — nothing to
 * do — must not take a lock every other instance then waits on.
 *
 * @returns what changed; empty lists when nothing did, in which case nothing was written.
 * @param required.projectsPath Desktop registry; the existing cross-process lock owns updates.
 * @throws Filesystem persistence/lock errors; no site files are changed.
 * @complexity O(n * (n + r * c)) worst-case marker reads; O(n + r * c) space, for n rows,
 *   r roots and c children. Idle scans are gated; directories are never searched recursively.
 */
function relocateMovedSites({ projectsPath }: { projectsPath: string }, options: RelocateOptions = {}): RelocationReport {
  const searchRoots = options.searchRoots ?? [];
  const classifySiteDir = options.classifySiteDir ?? classifySiteDirSafely;
  let report: RelocationReport = { moved: [], merged: [] };
  if (!planRelocations({ current: readProjectsFile(projectsPath), searchRoots, classifySiteDir }).changed) return report;
  updateProjectsFile(projectsPath, (current) => {
    const plan = planRelocations({ current, searchRoots, classifySiteDir });
    report = plan.report;
    return plan.changed ? { rows: plan.rows, dismissed: current.dismissed } : null;
  });
  const log = options.report ?? console.info;
  for (const { from, to } of report.moved) log(`tovu desktop: healed moved site ${from} → ${to}.`);
  for (const from of report.merged) log(`tovu desktop: removed stale duplicate site card ${from}; its valid twin is already tracked.`);
  return report;
}

/** {@link createRelocationGate}'s cadence, clock and site-admission ports. */
interface RelocationGateOptions {
  /** The longest a list poll goes without a pass. */
  maxIdleMs?: number;
  now?: () => number;
  classifySiteDir?: typeof classifySiteDirSafely;
}

/** Decides, per list poll, whether {@link relocateMovedSites} is worth running. */
interface RelocationGate {
  shouldRun(file: Pick<ProjectsFile, "rows" | "dismissed">, options?: Record<string, never>): boolean;
}

/** One minute: a sibling folder that appears while a row stays missing is picked up within this. */
const RELOCATION_MAX_IDLE_MS = 60_000;

/**
 * The list poll runs every 4 s while the window is visible, and a pass for a row whose folder is
 * missing re-reads every sibling folder's meta each time. Nothing can have moved unless the rows,
 * which of their folders are valid sites, or the removals changed, so a pass runs only when that picture
 * differs from the last pass's (a folder renamed away is noticed on the very next poll, as before),
 * and otherwise at most once per {@link RELOCATION_MAX_IDLE_MS} — the case where a missing row's
 * folder turns up somewhere new while the row still points at the old path. The first poll always
 * runs.
 *
 * @complexity O(n) bounded site classifications per poll — the same checks the list's own `folderMissing` makes.
 */
function createRelocationGate(_required: Record<string, never>, options: RelocationGateOptions = {}): RelocationGate {
  const maxIdleMs = options.maxIdleMs ?? RELOCATION_MAX_IDLE_MS;
  const now = options.now ?? Date.now;
  const classifySiteDir = options.classifySiteDir ?? classifySiteDirSafely;
  let lastPicture: string | null = null;
  let lastRunAt = 0;
  return {
    shouldRun(file, _options = {}) {
      const picture = [...file.rows.map((row) => `${row.siteDir}\u0000${classifySiteDir(row.siteDir)}`), "\u0000dismissed", ...file.dismissed].join("\n");
      const at = now();
      if (picture === lastPicture && at - lastRunAt < maxIdleMs) return false;
      lastPicture = picture;
      lastRunAt = at;
      return true;
    },
  };
}

/**
 * The card's Locate: point the row for `fromDir` at `toDir`, a folder the operator picked themselves.
 * Explicit, so — like `trackSite` — it clears any tombstone on `toDir`. When `toDir` is already
 * tracked, the stale row is dropped instead of duplicating that card.
 *
 * The caller checks `toDir` is a complete Tovu site first; this only rewrites the row.
 *
 * @returns the rows afterwards.
 * @throws {Error} operator-facing, when `fromDir` is not a tracked row.
 * @complexity O(n) in the row count.
 */
function repointTrackedSite(projectsPath: string, fromDir: string, toDir: string): WritableTrackedRow[] {
  let tracked = false;
  const next = updateProjectsFile(projectsPath, (current) => {
    tracked = current.rows.some((row) => row.siteDir === fromDir);
    if (!tracked || fromDir === toDir) return null;
    const merge = current.rows.some((row) => row.siteDir === toDir);
    const rows = current.rows.flatMap((row) => {
      if (row.siteDir !== fromDir) return [row];
      return merge ? [] : [movedRow(row, toDir, readRelocationId(toDir))];
    });
    return { rows, dismissed: current.dismissed.filter((dir) => dir !== toDir) };
  });
  if (!tracked) throw new Error(`This app is not tracking a site at ${fromDir}, so there is nothing to locate.`);
  return next.rows;
}

export { createRelocationGate, readRelocationId, relocateMovedSites, repointTrackedSite };
export type { RelocationGate };
export type { RelocationReport };
