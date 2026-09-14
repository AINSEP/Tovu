/**
 * @file Persisted record of which sites THIS app has spawned a `tovu serve` child for, and the
 * boot-time reconciliation that uses it.
 *
 * Multi-site sharpens a risk `main.js`'s own prior comment already named for the single-site case:
 * "A hard kill of Electron itself (SIGKILL, a crash, a logout) still bypasses [graceful shutdown] and
 * can strand the child. Tovu-Runner answers that with a pid registry and boot-time orphan
 * reconciliation; that machinery belongs with the fleet supervisor, not here, and is reported rather
 * than ported." With N sites open at once, the SAME hard kill strands N children instead of one —
 * this file is that machinery, now that the sites home UI gives good reason to build it: Tovu-Runner's own
 * `project-provisioner.ts:617-871` (~255 lines) cluster (`isProcessAlive`, `isProjectSidecar`,
 * `terminateOrphan`, `reconcile`), reproduced at the size this shell actually needs.
 *
 * **Storage shape, decided and justified (not inherited from `site-dir-store.ts`'s MRU file):**
 * still a flat JSON file in `userData`, for the exact reason `site-dir-store.ts`'s own header gives
 * for its MRU list — one Electron main process, no concurrent writers, no query beyond "read the
 * whole list", so `better-sqlite3` plus its `electron-rebuild` postinstall step would buy nothing at
 * this scale (a handful of rows) that a flat file doesn't already give for free. What DOES change
 * from that file's shape: `recentSiteDirs` is a list of bare path strings (an MRU of folders); this
 * file's rows carry exactly what reconciliation needs to prove identity before killing anything —
 * `{siteDir, port, workspaceId, pid, updatedAt}` — the same fields Tovu-Runner's own
 * `RunnerProjectRow` carries (`last_pid`, `installDir`, `port`), just persisted as JSON instead of a
 * sqlite table. A bare path could never support the identity check below; a row can.
 *
 * **Identity proof before killing**, ported as a SHAPE, not literal code: Tovu-Runner's
 * `isProjectSidecar` (`project-provisioner.ts:701-716`) proves a recovered pid is still the row's own
 * `tovu serve` — never trusted just because a number in a file happens to still name a running
 * process, since the OS could have recycled that pid to something unrelated since the row was
 * written — by checking the live process's argv contains BOTH its install dir and its `--port <n>`
 * flag. That proof is free here with NO new argv marker needed: `tovu-server.js` already spawns
 * `tovu serve <siteDir> --port <port>` (via `--import tsx` or the compiled CLI — either way the same
 * two tokens land in argv), unlike the agent-daemon child one level down inside each `tovu serve`,
 * which had no site-specific argv at all until `daemon-supervisor.ts`'s own `--workspace` fix.
 *
 * **What this deliberately does NOT do**: reopen or reattach a reconciled site. This app holds no
 * live `ChildProcess` reference for a process it did not spawn this boot — no stdout/stderr pipe, no
 * handle {@link import("./tovu-server.js").startTovuServer}'s `stop()` could ever use — so
 * "reclaiming" it would mean fabricating a fake handle around a process the shell cannot actually
 * supervise. Terminating it and leaving the site closed (findable again through "Open Recent",
 * `site-dir-store.ts`'s existing MRU) is the smaller, honest surface this pass actually verified;
 * auto-restoring a full session is a follow-up, not this fix.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REGISTRY_FILE_NAME = "open-sites.json";

/** SIGTERM-to-SIGKILL window for a reconciled orphan — matches `tovu-server.js`'s own
 *  `DEFAULT_STOP_GRACE_MS`, the same grace `serve.ts`'s BR-07 drain gets when this app spawned the
 *  child itself this boot. */
const DEFAULT_TERMINATE_GRACE_MS = 5_000;
const TERMINATE_POLL_MS = 200;

/** One persisted row: everything reconciliation needs to prove identity before killing anything. */
interface SiteProcessRow {
  siteDir: string;
  port: number;
  workspaceId: string;
  pid: number;
  updatedAt: number;
}

/** The registry file's whole shape. */
interface SiteProcessRegistry {
  sites: SiteProcessRow[];
}

/** A raw parsed row, before {@link readRegistry} checks which fields are actually usable. */
interface RawSiteProcessRow {
  siteDir?: unknown;
  pid?: unknown;
  [key: string]: unknown;
}

/**
 * The fields {@link isServeProcessForSite}, {@link isLiveServeRow} and {@link terminateOrphan} need
 * to prove a pid is still its row's own `tovu serve` — a subset of {@link SiteProcessRow}, since
 * none of them touch `workspaceId` or `updatedAt`.
 */
interface ServeIdentityRow {
  siteDir: string;
  port: number;
  pid: number;
}

/** @returns the registry file's path inside Electron's per-user `userData` directory. */
function registryFilePath(userDataDir: string): string {
  return path.join(userDataDir, REGISTRY_FILE_NAME);
}

/**
 * Forgiving read, mirroring `site-dir-store.ts`'s `readDesktopState` — a corrupt or missing cache
 * must not block launch; it just means nothing is reconciled this boot.
 * @complexity O(n) in file size.
 */
function readRegistry(registryPath: string): SiteProcessRegistry {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8")) as { sites?: unknown };
    const sites: unknown[] = Array.isArray(parsed?.sites) ? parsed.sites : [];
    return {
      // Kept as one expression (not restructured into a block body, and the predicate cast to the
      // array result rather than the callback's own return type) to match the pre-batch shape
      // token-for-token once types are stripped — every `as` here is pure type syntax, erased
      // entirely, leaving plain `row.siteDir`/`row.pid` reads and a bare `.filter(...)` call exactly
      // as before. A `row is SiteProcessRow` predicate on the callback itself would force its return
      // to be exactly `boolean`, which `row && ...` on an `unknown` row is not.
      sites: sites.filter((row) => row && typeof (row as RawSiteProcessRow).siteDir === "string" && typeof (row as RawSiteProcessRow).pid === "number") as SiteProcessRow[]
    };
  } catch {
    return { sites: [] };
  }
}

/**
 * A row as {@link writeRegistry} accepts it — every field `unknown`, so a test proving
 * {@link readRegistry}'s own filtering can write deliberately malformed rows (a missing `siteDir`, a
 * non-numeric `pid`) straight through this same function rather than reaching for a second, raw
 * `fs.writeFileSync` just for that.
 */
interface WritableSiteProcessRow {
  siteDir?: unknown;
  port?: unknown;
  workspaceId?: unknown;
  pid?: unknown;
  updatedAt?: unknown;
}

/** {@link writeRegistry}'s own parameter shape. */
interface WritableSiteProcessRegistry {
  sites: WritableSiteProcessRow[];
}

/** @complexity O(n) in row count. */
function writeRegistry(registryPath: string, state: WritableSiteProcessRegistry): void {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(state, null, 2));
}

/** {@link recordSiteOpened}'s own options. */
interface RecordSiteOpenedOptions {
  isLiveRow?: (row: SiteProcessRow) => boolean;
}

/**
 * Record one open site's row — called once `startTovuServer` has actually resolved, so a row is
 * never written for a spawn attempt that failed.
 *
 * **Refuse-not-replace, and that is the D-07 fix.** This used to drop every existing row with the
 * same `siteDir` unconditionally. `isOrphanedProcess`'s own doc already established that two
 * Electron instances can run at once (there is no `requestSingleInstanceLock`), and
 * {@link reconcileOrphans} was taught to RETAIN a live sibling's row — but the write path was left
 * on the old rule, so instance B opening a site instance A already has open erased A's row. A's
 * child was then supervised only by A's in-memory map: hard-kill A and nothing on disk named that
 * process, so no later boot could ever reconcile it. The reap arm was fixed and the record arm was
 * not; this is the sibling.
 *
 * A row is only displaced once it is PROVEN dead — the same identity proof
 * ({@link isServeProcessForSite}) reconciliation makes before it kills anything, so a pid the OS
 * recycled to something unrelated never counts as "still live" and rows cannot accumulate. Two rows
 * for one `siteDir` therefore mean exactly what they say: two `tovu serve` children really are
 * running over that site's `content.db`. That is its own problem (two sqlite writers), but recording
 * it truthfully is strictly better than recording one of them and losing the other.
 *
 * @param options.isLiveRow test seam — the "is this row's process still its own live `tovu serve`"
 *   predicate. Defaults to {@link isLiveServeRow}, which really asks the OS.
 * @complexity O(n) in row count, times one `ps` call per same-`siteDir` row (in practice zero or one).
 */
function recordSiteOpened(registryPath: string, row: SiteProcessRow, options: RecordSiteOpenedOptions = {}): void {
  const isLiveRow = options.isLiveRow ?? isLiveServeRow;
  const { sites } = readRegistry(registryPath);
  const retained = sites.filter((existing) => existing.siteDir !== row.siteDir || isLiveRow(existing));
  writeRegistry(registryPath, { sites: [row, ...retained] });
}

/**
 * Whether `row`'s pid is still alive AND still that row's own `tovu serve` — alive alone is not
 * enough, since the OS is free to have reassigned that number to something unrelated.
 * @complexity O(1) beyond one `ps` call.
 */
function isLiveServeRow(row: ServeIdentityRow): boolean {
  if (!isProcessAlive(row.pid)) return false;
  return isServeProcessForSite(readProcessCommand(row.pid) ?? "", row);
}

/** {@link recordSiteClosed}'s own options. */
interface RecordSiteClosedOptions {
  pid?: number;
}

/**
 * Drop a site's row — called once its `tovu serve` child has been asked to stop deliberately (a
 * window closed, or the whole app quit cleanly), so an ordinary shutdown is never mistaken for a
 * crash and reconciled against on the next launch.
 *
 * @param options.pid drop only the row carrying this pid. Every caller that HAS a pid passes it,
 *   and they all do — this is only ever called about a child the caller is holding a handle to.
 *   It matters because {@link recordSiteOpened} can now legitimately leave two rows for one
 *   `siteDir` (a live sibling instance's, plus this one): closing by `siteDir` alone would wipe the
 *   sibling's row too and reintroduce D-07 from the close side. Omitting it keeps the original
 *   drop-every-row-for-this-site behaviour, so a future caller that genuinely means "forget this
 *   site entirely" still has that, and no existing call site changed meaning silently.
 * @complexity O(n) in row count.
 */
function recordSiteClosed(registryPath: string, siteDir: string, options: RecordSiteClosedOptions = {}): void {
  const { sites } = readRegistry(registryPath);
  const isDoomed = (existing: SiteProcessRow) => existing.siteDir === siteDir && (options.pid === undefined || existing.pid === options.pid);
  writeRegistry(registryPath, { sites: sites.filter((existing) => !isDoomed(existing)) });
}

/**
 * Whether a pid still names a live process. Signal `0` sends nothing and reads nothing — it only
 * asks the kernel "does this pid exist and can I signal it" — the same check Tovu-Runner's own
 * `isProcessAlive` makes.
 * @complexity O(1).
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a live process's own argv — `ps -o command=`, deliberately NEVER `ps eww`/`pgrep -fl`. Both
 * of those dump a process's ENVIRONMENT, which can hold live secrets, and are banned in this
 * codebase for exactly that reason. `ps`'s plain `command=` column is argv only, never env, so
 * nothing sensitive can leak through this call.
 *
 * @returns the command line, or `null` once the pid is gone (a race between {@link isProcessAlive}
 *   and this call, or the row's pid was never real).
 * @complexity O(1); one subprocess call.
 */
function readProcessCommand(pid: number): string | null {
  try {
    const output = execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
    return output.trim() || null;
  } catch {
    return null;
  }
}

/**
 * A live process's parent pid, read the same argv-only way as {@link readProcessCommand} (`ps`'s
 * plain `ppid=` column is a number, never environment, so nothing sensitive can leak through it).
 *
 * @returns the parent pid, or `null` once the pid is gone or `ps` prints something unparseable.
 * @complexity O(1); one subprocess call.
 */
function readProcessParentPid(pid: number): number | null {
  try {
    const parsed = Number.parseInt(execFileSync("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8" }).trim(), 10);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Whether `pid`'s own parent is gone — the property that separates a real ORPHAN from a live
 * sibling instance's perfectly healthy child.
 *
 * This distinction became load-bearing when {@link reconcileOrphans} moved above `main.ts`'s
 * boot-mode split so the sites home UI reaps orphans too. Nothing prevents two Electron instances running
 * at once (there is no `requestSingleInstanceLock`), and the identity proof above cannot help: a
 * live sibling's child matches its own row's argv EXACTLY, by construction. Without this check the
 * second instance's boot would SIGTERM every site the first instance has open.
 *
 * Parentage rather than a persisted owner-pid field on purpose. A field only protects rows written
 * by a build that has the field, so the very first launch after shipping it would still reap the
 * children of an instance already running from the previous build — the one case that matters most.
 * Parentage is a property of the running process, so it protects rows of every vintage immediately.
 *
 * Measured on macOS 2026-09-06 against `tovu-server.js`'s exact `detached: true` spawn shape:
 * `detached` makes the child a process-GROUP leader and leaves its parent unchanged, so its ppid is
 * the Electron main pid while that process lives and becomes `1` (launchd) the moment it dies.
 *
 * Fails CLOSED in the only direction that matters: anything other than a confirmed reparent-to-
 * launchd reads as "not an orphan" and is left running. Leaking a stray process costs a port and
 * some memory; killing a live sibling's server costs whatever that site was doing.
 *
 * @complexity O(1) beyond {@link readProcessParentPid}'s own subprocess call.
 */
function isOrphanedProcess(pid: number): boolean {
  return readProcessParentPid(pid) === 1;
}

/**
 * Runner's `isProjectSidecar` technique: a pid is only trusted to BE this row's `tovu serve` once
 * its live argv contains both the site dir and its `--port <n>` flag — never taken on faith just
 * because a number in a persisted row happens to still name a running process.
 * @complexity O(1) — two substring checks.
 */
function isServeProcessForSite(commandLine: string, row: Pick<ServeIdentityRow, "siteDir" | "port">): boolean {
  return commandLine.includes(row.siteDir) && commandLine.includes(`--port ${row.port}`);
}

/** @complexity O(1); the caller bounds how many times this is awaited. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Terminate one confirmed orphan: SIGTERM, poll for real exit, then — only if it is STILL alive AND
 * STILL identifiable as this row's own process — escalate to SIGKILL. Re-identifying before
 * escalating (not just before the FIRST signal) is the same discipline as Runner's own
 * `terminateOrphan` (`project-provisioner.ts:724-747`): a pid the OS reassigned to something
 * unrelated during the poll window must never be killed on this row's authority.
 *
 * @complexity O(graceMs / TERMINATE_POLL_MS) — a bounded poll loop, not recursion or unbounded I/O.
 */
async function terminateOrphan(row: ServeIdentityRow, graceMs: number = DEFAULT_TERMINATE_GRACE_MS): Promise<void> {
  try {
    process.kill(row.pid, "SIGTERM");
  } catch {
    return; // already gone
  }

  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(row.pid)) return;
    await sleep(TERMINATE_POLL_MS);
  }

  if (isProcessAlive(row.pid) && isServeProcessForSite(readProcessCommand(row.pid) ?? "", row)) {
    try {
      process.kill(row.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/**
 * Boot-time orphan reconciliation — the piece `main.js`'s own prior comment named as deliberately
 * deferred. Call once, before any window is created: for every row this app persisted before its
 * last exit, prove whether the pid is STILL that row's own `tovu serve` (identity-before-kill, see
 * {@link isServeProcessForSite}), and if so terminate it — a prior run's window is gone, so nothing
 * will ever call that child's own `stop()` again, and a plain SIGTERM here still gives it the same
 * BR-07 graceful drain `serve.ts` runs for any other shutdown signal.
 *
 * Returns holding only the rows belonging to a LIVE SIBLING instance ({@link isOrphanedProcess}).
 * Everything else is removed — reconciled or found already gone — so a later boot never re-processes
 * the same entry twice. **This is a deliberate change from the previous "always zero rows on
 * return"**: wiping a sibling's rows would leave its children unreapable if IT were later hard
 * killed, converting a protected process into a permanent leak. Two instances writing this flat file
 * can still race (there is no lock, and never was), but a racing write now loses at most a row the
 * sibling can rewrite, instead of every row unconditionally.
 *
 * @returns the rows that were found to be live orphans and terminated — for logging/reporting only.
 * @complexity O(n) in persisted row count; each row's own cost is `terminateOrphan`'s bounded poll.
 */
async function reconcileOrphans(registryPath: string): Promise<SiteProcessRow[]> {
  const { sites } = readRegistry(registryPath);
  const reconciled: SiteProcessRow[] = [];
  const stillSupervised: SiteProcessRow[] = [];

  for (const row of sites) {
    if (!isProcessAlive(row.pid)) continue;
    if (!isServeProcessForSite(readProcessCommand(row.pid) ?? "", row)) continue;
    if (!isOrphanedProcess(row.pid)) {
      stillSupervised.push(row);
      continue;
    }
    reconciled.push(row);
    await terminateOrphan(row);
  }

  writeRegistry(registryPath, { sites: stillSupervised });
  return reconciled;
}

export {
  REGISTRY_FILE_NAME,
  registryFilePath,
  readRegistry,
  writeRegistry,
  recordSiteOpened,
  recordSiteClosed,
  isLiveServeRow,
  isProcessAlive,
  readProcessCommand,
  readProcessParentPid,
  isOrphanedProcess,
  isServeProcessForSite,
  terminateOrphan,
  reconcileOrphans,
};
