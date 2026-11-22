/**
 * @file A tracked project whose folder was renamed or moved heals itself. Found by the owner on the
 * 0.1.6 dmg: `sites/tovu-com` was renamed to `sites/tovu-dev` (commit bc015d6c5), and the Projects
 * screen kept a card for a folder that no longer existed. The owner's rule is that nobody should
 * have to fix that by hand, so {@link relocateMovedSites} runs from the list poll whenever something
 * could have moved (`@jini-ai/platform/fs`’s relocation gate):
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
import { reconcileDirectoryRelocations } from "@jini-ai/platform/fs";
import { orFallbackSync } from "@jini-ai/core/errors/idioms";
import { classifySiteDirSafely } from "./site-dir-store.ts";
import fs from "node:fs";
import path from "node:path";

import { SITE_ORIGIN, readProjectsFile, updateProjectsFile } from "./tracked-sites.ts";
import type { TrackedSiteRow, WritableTrackedRow } from "./tracked-sites.ts";

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

/**
 * The id a site folder carries in its own `.site-meta.json` — `siteId`, else `siteKeyId`.
 *
 * @returns the id, or `null` when the folder is absent, unreadable, holds no meta file, holds one
 *   that is not JSON, or holds neither id as a non-empty string.
 * @complexity O(1) — one file read.
 */
function readRelocationId({ siteDir }: { siteDir: string }, _optional = {}): string | null {
  return orFallbackSync({ work: () => {
    const meta = JSON.parse(fs.readFileSync(path.join(siteDir, SITE_META_FILE), "utf8")) as { siteId?: unknown; siteKeyId?: unknown } | null;
    const id = [meta?.siteId, meta?.siteKeyId].find((candidate): candidate is string => typeof candidate === "string" && candidate !== "");
    return id ?? null;
  }, fallback: null, step: "site-relocation-marker" });
}

/**
 * `row` pointed at `siteDir` — the same card, so its `createdAt` stays, but always `adopted` and
 * without `siteId` (see this file's header on why a moved folder is never erasable).
 *
 * @complexity O(1).
 */
function movedRow({ row, siteDir, relocationId }: { row: TrackedSiteRow; siteDir: string; relocationId: string | null | undefined }, _optional = {}): WritableTrackedRow {
  const next: WritableTrackedRow = { siteDir, createdAt: row.createdAt, origin: SITE_ORIGIN.adopted };
  return typeof relocationId === "string" ? { ...next, relocationId } : next;
}

/**
 * Heal every tracked row whose folder moved, and record ids on rows whose folder is present — see
 * this file's header for the rules.
 *
 * Planned once WITHOUT the lock, and only when that finds something to do is it planned again inside
 * `updateProjectsFile`'s cross-process lock and written. The list poll runs it whenever
 * `@jini-ai/platform/fs`’s relocation gate says something could have moved, and the ordinary answer — nothing to
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
  const report = reconcileDirectoryRelocations<WritableTrackedRow, TrackedSiteRow>({
    read: () => readProjectsFile({ projectsPath }),
    update: ({ change }) => updateProjectsFile({ projectsPath, change }),
    directoryOf: ({ row }) => row.siteDir,
    recordedIdentityOf: ({ row }) => row.siteId,
    relocationIdentityOf: ({ row }) => row.relocationId,
    classifyDirectory: ({ directory }) => classifySiteDir({ dir: directory }),
    eligibleClassification: "site",
    readIdentity: ({ directory }) => readRelocationId({ siteDir: directory }),
    stamp: ({ row, identity }) => ({ ...row, relocationId: identity }),
    move: ({ row, directory, identity }) => movedRow({ row, siteDir: directory, relocationId: identity }),
  }, { searchRoots });
  const log = options.report ?? console.info;
  for (const { from, to } of report.moved) log(`tovu desktop: healed moved site ${from} → ${to}.`);
  for (const from of report.merged) log(`tovu desktop: removed stale duplicate site card ${from}; its valid twin is already tracked.`);
  return report;
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
function repointTrackedSite({ projectsPath, fromDir, toDir }: { projectsPath: string; fromDir: string; toDir: string }, _optional = {}): WritableTrackedRow[] {
  let tracked = false;
  const next = updateProjectsFile({ projectsPath, change: (current) => {
    tracked = current.rows.some((row) => row.siteDir === fromDir);
    if (!tracked || fromDir === toDir) return null;
    const merge = current.rows.some((row) => row.siteDir === toDir);
    const rows = current.rows.flatMap((row) => {
      if (row.siteDir !== fromDir) return [row];
      return merge ? [] : [movedRow({ row, siteDir: toDir, relocationId: readRelocationId({ siteDir: toDir }) })];
    });
    return { rows, dismissed: current.dismissed.filter((dir) => dir !== toDir) };
  } });
  if (!tracked) throw new Error(`This app is not tracking a site at ${fromDir}, so there is nothing to locate.`);
  return next.rows;
}

export { readRelocationId, relocateMovedSites, repointTrackedSite };
export type { RelocationReport };
