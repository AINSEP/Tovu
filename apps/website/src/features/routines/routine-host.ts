import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import * as fsPromises from "node:fs/promises";

import { createSqliteRoutineStore } from "@jini-ai/daemon/routines/sqlite";
import type { RoutineDurablePersistence, RoutineService, RoutineStore } from "@jini-ai/daemon";
import type { RoutineAvailability } from "@tovu/contracts/routines";
import { closeSqliteConnection, sqliteKernel, type NativeSqliteDatabase } from "#src/platform/db/kernel/drivers/sqlite";
import { openRoutinesDb, type OpenRoutinesSqlite } from "#src/platform/db/sqlite/routines-db";
import { routinesPaths, type RoutinesPaths } from "./routines-paths.js";

/**
 * @file The routine host's lifecycle edges: open the sidecar, close it in the safe order, and write
 * the desktop beacon. Composition (`assistant-routines.ts`) wires these; nothing here reads env or
 * a singleton, so every boot shape can be tested with fakes.
 */

type Log = (entry: { event: string; error: unknown }) => void;
const defaultLog: Log = (entry) => console.warn("[routines]", entry.event, entry.error);

type SqliteKernelOf = (required: { source: NativeSqliteDatabase }) => unknown;
type CreateStore = (required: { db: NativeSqliteDatabase; scope: string }, optional: { now: () => number; newId: () => string; holderId: string })
  => { store: RoutineStore; persistence: RoutineDurablePersistence };

export interface OpenRoutineSidecarRequired {
  contentDbPath: string;
  openSqlite: OpenRoutinesSqlite;
  /** `@jini-ai/db/migrate`'s runner, injected into Jini's `migrateJiniRoutines` (the `migrate` port). */
  runMigrations: unknown;
  migrate: (required: { kernel: unknown; runMigrations: unknown }, optional: Record<string, never>) => Promise<unknown>;
  /** The mounted workspace: one site's routines never see another's rows. */
  scope: string;
  /** Distinct per boot, so a second window's scheduler is a different lease holder. */
  holderId: string;
  now: () => number;
  newId: () => string;
}

export type OpenRoutineSidecarResult =
  | { ok: true; handle: NativeSqliteDatabase; store: RoutineStore; persistence: RoutineDurablePersistence; paths: RoutinesPaths; close: () => void }
  | { ok: false; availability: Extract<RoutineAvailability, "error">; paths: RoutinesPaths };

/**
 * Opens `<dirname(contentDbPath)>/ops/routines.db` on its own connection and migrates it BEFORE the
 * store sees the handle (the store refuses an unmigrated ledger). A failure degrades routines to
 * `error` availability and leaves the site up: routines are optional, the site is not.
 */
export async function openRoutineSidecar(
  required: OpenRoutineSidecarRequired,
  { log = defaultLog, mkdir = (dir: string) => { mkdirSync(dir, { recursive: true }); }, kernelOf = sqliteKernel as SqliteKernelOf,
    createStore = createSqliteRoutineStore as unknown as CreateStore, closeConnection = (handle: NativeSqliteDatabase) => closeSqliteConnection({ source: handle }) }:
  { log?: Log; mkdir?: (dir: string) => void; kernelOf?: SqliteKernelOf; createStore?: CreateStore; closeConnection?: (handle: NativeSqliteDatabase) => void } = {},
): Promise<OpenRoutineSidecarResult> {
  const { contentDbPath, openSqlite, runMigrations, migrate, scope, holderId, now, newId } = required;
  const paths = routinesPaths({ contentDbPath });
  let handle: NativeSqliteDatabase | undefined;
  try {
    // better-sqlite3 does not create the parent folder; `ops/` may not exist on a fresh site.
    mkdir(paths.dir);
    handle = openRoutinesDb({ filePath: paths.db, openSqlite });
    await migrate({ kernel: kernelOf({ source: handle }), runMigrations }, {});
    const { store, persistence } = createStore({ db: handle, scope }, { now, newId, holderId });
    const owned = handle;
    return { ok: true, handle: owned, store, persistence, paths, close: () => closeConnection(owned) };
  } catch (error) {
    log({ event: "routine-sidecar-open-failed", error });
    if (handle) {
      try { handle.close(); } catch (closeError) { log({ event: "routine-sidecar-close-failed", error: closeError }); }
    }
    return { ok: false, availability: "error", paths };
  }
}

export interface CloseRoutineHostRequired {
  service: Pick<RoutineService, "quiesce" | "drainActive" | "stop">;
  persistence: Pick<RoutineDurablePersistence, "listInFlight" | "markInterrupted">;
  holderId: string;
  now: () => number;
  /** Closes the borrowed connection. Runs LAST, after timers are fenced and the lease is released. */
  close: () => void;
  drainTimeoutMs?: number;
}

interface Timers { setTimeout: (callback: () => void, ms: number) => unknown; clearTimeout: (handle: unknown) => void }
const MAX_DRAIN_MS = 2_000;

/** Races the service's own drain against an injected timer so a stuck run can never hold shutdown open. */
async function boundedDrain(service: CloseRoutineHostRequired["service"], timeoutMs: number, timers: Timers): Promise<void> {
  let handle: unknown;
  const timeout = new Promise<void>((resolve) => { handle = timers.setTimeout(resolve, timeoutMs); });
  try {
    await Promise.race([service.drainActive({}, { timeoutMs }).then(() => undefined), timeout]);
  } finally {
    timers.clearTimeout(handle);
  }
}

/**
 * Shutdown order matters: quiesce first so no new slot is claimed, drain active runs for at most two
 * seconds, interrupt only THIS boot's leftovers (a passive window must never interrupt the owner's
 * live run; `markInterrupted` also expires their waiting approvals), stop and release the lease so a
 * peer can take over at once, and close the DB last because every earlier step still writes to it.
 */
export async function closeRoutineHost(
  required: CloseRoutineHostRequired,
  { timers = { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout) }, log = defaultLog }: { timers?: Timers; log?: Log } = {},
): Promise<void> {
  const { service, persistence, holderId, now, close, drainTimeoutMs = MAX_DRAIN_MS } = required;
  const step = async (event: string, run: () => unknown) => {
    try { await run(); } catch (error) { log({ event, error }); }
  };
  try {
    await step("routine-quiesce-failed", () => service.quiesce({}, {}));
    await step("routine-drain-failed", () => boundedDrain(service, Math.min(drainTimeoutMs, MAX_DRAIN_MS), timers));
    await step("routine-interrupt-failed", () => {
      const runIds = persistence.listInFlight({}, {}).filter((run) => run.holderId === holderId).map((run) => run.id);
      if (runIds.length > 0) persistence.markInterrupted({ runIds, now: now(), holderId }, {});
    });
    await step("routine-stop-failed", () => service.stop({}, { releaseLease: true }));
  } finally {
    close();
  }
}

export interface BeaconFs {
  mkdir: (dir: string, options: { recursive: true }) => Promise<unknown>;
  writeFile: (file: string, text: string) => Promise<unknown>;
  rename: (from: string, to: string) => Promise<unknown>;
  rm: (file: string) => Promise<unknown>;
}

const nodeBeaconFs: BeaconFs = {
  mkdir: (dir, options) => fsPromises.mkdir(dir, options),
  writeFile: (file, text) => fsPromises.writeFile(file, text, "utf8"),
  rename: (from, to) => fsPromises.rename(from, to),
  rm: (file) => fsPromises.rm(file, { force: true }),
};

/**
 * Writes `{ v:1, enabled, updatedAt }` via temp file + rename so the desktop reader never sees a torn
 * file. The beacon is a hint written after a commit: a failure is a diagnostic only, because throwing
 * here would misreport a write the store already committed.
 */
export async function writeRoutineBeacon(
  { path, enabled, now, fs = nodeBeaconFs }: { path: string; enabled: number; now: () => number; fs?: BeaconFs },
  { log = defaultLog }: { log?: Log } = {},
): Promise<{ ok: boolean }> {
  const temp = `${path}.tmp`;
  try {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(temp, JSON.stringify({ v: 1, enabled, updatedAt: now() }));
    await fs.rename(temp, path);
    return { ok: true };
  } catch (error) {
    log({ event: "routine-beacon-write-failed", error });
    await fs.rm(temp).catch(() => undefined);
    return { ok: false };
  }
}
