/**
 * @file A tracked project whose folder was renamed or moved heals itself. Found by the owner on the
 * 0.1.6 dmg: `sites/tovu-com` was renamed to `sites/tovu-dev` (commit bc015d6c5), and the Projects
 * screen kept a card for a folder that no longer existed. The owner's rule is that nobody should
 * have to fix that by hand, so {@link relocateMovedSites} runs from the list poll whenever something
 * could have moved ({@link createRelocationGate}):
 *
 * 1. A row whose folder EXISTS gets that folder's id recorded on it (`relocationId`), once. That is
 *    what lets it be found again later — a folder that is already gone carries no id to read.
 * 2. A row whose folder is MISSING and carries a `relocationId` is looked for among the old
 *    folder's siblings (and any extra search roots). Exactly one folder with the same id: the row is
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

/** Whether `dir` is a directory right now, with every way of failing to find out counted as "no".
 *  @complexity O(1). */
function folderExists(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
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
 * @complexity O(r * c) meta reads — r search roots, c children each.
 */
function relocationTarget(row: TrackedSiteRow, context: PlanContext): string | null {
  if (row.relocationId === undefined) return null;
  const roots = new Set([path.dirname(row.siteDir), ...context.searchRoots]);
  const candidates = new Set([...roots].flatMap(childPathsOf));
  const matches = [...candidates].filter((dir) => dir !== row.siteDir && readRelocationId(dir) === row.relocationId);
  if (matches.length !== 1 || context.dismissed.includes(matches[0]!)) return null; // length checked on the same line, so index 0 exists
  return matches[0]!;
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
 * @complexity O(1) for a present folder; {@link relocationTarget}'s cost for a missing one.
 */
function planRow(plan: RelocationPlan, row: TrackedSiteRow, context: PlanContext): void {
  if (folderExists(row.siteDir)) {
    const id = row.relocationId === undefined ? readRelocationId(row.siteDir) : null;
    plan.changed ||= id !== null;
    plan.rows.push(id === null ? row : { ...row, relocationId: id });
    return;
  }
  const target = relocationTarget(row, context);
  if (target === null) {
    plan.rows.push(row);
    return;
  }
  plan.changed = true;
  if (context.claimed.has(target)) {
    plan.report.merged.push(row.siteDir);
    return;
  }
  context.claimed.add(target);
  plan.report.moved.push({ from: row.siteDir, to: target });
  plan.rows.push(movedRow(row, target, row.relocationId));
}

/**
 * The whole pass over one file's contents, decided without writing anything. A damaged file is left
 * alone — a list poll must never be the thing that moves its bytes aside.
 *
 * @complexity O(n) rows, plus {@link relocationTarget}'s cost per missing row.
 */
function planRelocations(current: ProjectsFile, searchRoots: string[]): RelocationPlan {
  const plan: RelocationPlan = { rows: [], report: { moved: [], merged: [] }, changed: false };
  if (current.state !== "ok") return plan;
  const context: PlanContext = { claimed: new Set(current.rows.map((row) => row.siteDir)), dismissed: current.dismissed, searchRoots };
  for (const row of current.rows) planRow(plan, row, context);
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
 * @complexity O(n) rows, plus O(r * c) meta reads per missing row that carries an id.
 */
function relocateMovedSites(projectsPath: string, options: RelocateOptions = {}): RelocationReport {
  const searchRoots = options.searchRoots ?? [];
  let report: RelocationReport = { moved: [], merged: [] };
  if (!planRelocations(readProjectsFile(projectsPath), searchRoots).changed) return report;
  updateProjectsFile(projectsPath, (current) => {
    const plan = planRelocations(current, searchRoots);
    report = plan.report;
    return plan.changed ? { rows: plan.rows, dismissed: current.dismissed } : null;
  });
  return report;
}

/** {@link createRelocationGate}'s options; both are for tests. */
interface RelocationGateOptions {
  /** The longest a list poll goes without a pass. */
  maxIdleMs?: number;
  now?: () => number;
}

/** Decides, per list poll, whether {@link relocateMovedSites} is worth running. */
interface RelocationGate {
  shouldRun(file: Pick<ProjectsFile, "rows" | "dismissed">): boolean;
}

/** One minute: a sibling folder that appears while a row stays missing is picked up within this. */
const RELOCATION_MAX_IDLE_MS = 60_000;

/**
 * The list poll runs every 4 s while the window is visible, and a pass for a row whose folder is
 * missing re-reads every sibling folder's meta each time. Nothing can have moved unless the rows,
 * which of their folders exist, or the removals changed, so a pass runs only when that picture
 * differs from the last pass's (a folder renamed away is noticed on the very next poll, as before),
 * and otherwise at most once per {@link RELOCATION_MAX_IDLE_MS} — the case where a missing row's
 * folder turns up somewhere new while the row still points at the old path. The first poll always
 * runs.
 *
 * @complexity O(n) `existsSync` per poll — the same checks the list's own `folderMissing` makes.
 */
function createRelocationGate(options: RelocationGateOptions = {}): RelocationGate {
  const maxIdleMs = options.maxIdleMs ?? RELOCATION_MAX_IDLE_MS;
  const now = options.now ?? Date.now;
  let lastPicture: string | null = null;
  let lastRunAt = 0;
  return {
    shouldRun(file) {
      const picture = [...file.rows.map((row) => `${row.siteDir}\u0000${fs.existsSync(row.siteDir) ? 1 : 0}`), "\u0000dismissed", ...file.dismissed].join("\n");
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
