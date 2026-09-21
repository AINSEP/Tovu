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
 * **Storage shape: one JSON file PER APP INSTANCE, each with exactly one writer (2026-09-20).**
 * `userData/site-processes/<electron pid>-<nonce>.json`. It used to be one shared `open-sites.json`,
 * justified by `site-dir-store.ts`'s "one Electron main process, no concurrent writers" — a premise
 * that was never true here: nothing stops two instances running at once (the owner runs several on
 * purpose, and ruled out a single-instance lock), and every write was an unlocked read-modify-write
 * of the whole file. Two instances therefore lost each other's rows, and boot-time reconciliation —
 * whose read-to-write gap spans every orphan's SIGTERM grace window — wiped any row a sibling recorded
 * in the meantime. Splitting the file removes that race by construction instead of guarding it: an
 * instance only ever rewrites its OWN file, and another instance's file is only ever deleted once its
 * owner pid is gone (the nonce means a recycled pid can never name a dead instance's file as its own).
 * Every write is temp-file + `fsync` + `rename`, so a reader sees the old file or the new one, never
 * half of one — and an unreadable file is reported as unreadable, never read as an empty list (see
 * {@link readRegistryFile}). Those two mechanisms, and moving an unreadable file aside rather than
 * writing over it, now live in `durable-json-file.ts`: the same bug was found in `tracked-sites.ts`
 * and `site-dir-store.ts` the same day, and a second and third copy of this code here is how the
 * three would drift. Still flat JSON rather than `better-sqlite3`: a handful of rows, no query
 * beyond "read them all". Each row carries exactly what reconciliation needs to prove identity before
 * killing anything — `{siteDir, port, workspaceId, pid, updatedAt}`, the same fields Tovu-Runner's own
 * `RunnerProjectRow` carries (`last_pid`, `installDir`, `port`). A bare path could never support the
 * identity check below; a row can.
 *
 * **Identity proof before killing**, ported as a SHAPE, not literal code: Tovu-Runner's
 * `isProjectSidecar` (`project-provisioner.ts:701-716`) proves a recovered pid is still the row's own
 * `tovu serve` — never trusted just because a number in a file happens to still name a running
 * process, since the OS could have recycled that pid to something unrelated since the row was
 * written — by checking the live process's argv contains BOTH its install dir and its `--port <n>`
 * flag. That proof is free here with NO new argv marker needed: `tovu-server.ts` already spawns
 * `tovu serve <siteDir> --port <port>` (via `--import tsx` or the compiled CLI — either way the same
 * two tokens land in argv), unlike the agent-daemon child one level down inside each `tovu serve`,
 * which had no site-specific argv at all until `daemon-supervisor.ts`'s own `--workspace` fix.
 *
 * **What this deliberately does NOT do**: reopen or reattach a reconciled site. This app holds no
 * live `ChildProcess` reference for a process it did not spawn this boot — no stdout/stderr pipe, no
 * handle {@link import("./tovu-server.ts").startTovuServer}'s `stop()` could ever use — so
 * "reclaiming" it would mean fabricating a fake handle around a process the shell cannot actually
 * supervise. Terminating it and leaving the site closed (findable again through "Open Recent",
 * `site-dir-store.ts`'s existing MRU) is the smaller, honest surface this pass actually verified;
 * auto-restoring a full session is a follow-up, not this fix.
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

import { readJsonFile, writeJsonFileAtomic, tempPathFor, quarantineUnreadableFile } from "./durable-json-file.ts";
import type { QuarantineNotice } from "./durable-json-file.ts";

/** The directory inside `userData` holding one registry file per running app instance. */
const REGISTRY_DIR_NAME = "site-processes";

/** The single shared file every build before 2026-09-20 wrote, next to {@link REGISTRY_DIR_NAME}.
 *  Still READ — reconciliation must reap a crashed older build's orphans, and the delete guard must
 *  see a still-running older build's sites — but never rewritten: older builds are its writers, and
 *  writing a file this build does not own is the race this layout removes. The one exception is an
 *  unreadable copy, moved aside at boot (see {@link reconcileLegacyFile}). */
const LEGACY_REGISTRY_FILE_NAME = "open-sites.json";

/** `<owner pid>-<nonce>.json`. Temp (`.<pid>.tmp`) and quarantined (`.corrupt-<ms>`) files never match. */
const INSTANCE_FILE_PATTERN = /^(\d+)-[0-9a-f]+\.json$/;

/** This process's own file stem. The nonce keeps a pid the OS recycled from a crashed instance from
 *  ever adopting that instance's file as its own. */
const OWN_INSTANCE_ID = `${process.pid}-${randomBytes(4).toString("hex")}`;

/** SIGTERM-to-SIGKILL window for a reconciled orphan — matches `tovu-server.ts`'s own
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

/**
 * What {@link readRegistryFile} found in one file. `unreadable` is deliberately its own state and
 * never folded into an empty list: an empty list is a valid registry, while an unreadable file (torn,
 * not JSON, not our shape, or an I/O error) holds rows nobody can know. Folding the two together is
 * how a torn file used to be read as `[]` and the next write persisted that, dropping every row.
 */
type RegistryFileRead = { state: "ok"; sites: SiteProcessRow[] } | { state: "missing" } | { state: "unreadable" };

/** {@link readRegistry}'s answer across every instance's file plus the legacy one. */
interface RegistrySnapshot {
  sites: SiteProcessRow[];
  /** Paths that exist but could not be read — their rows are UNKNOWN, not absent. */
  unreadable: string[];
}

/** One instance's file, as {@link listInstanceFiles} found it. */
interface InstanceFile {
  filePath: string;
  instanceId: string;
  ownerPid: number;
}

/** A raw parsed row, before {@link readRegistryFile} checks which fields are actually usable. */
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

/** @returns the registry DIRECTORY inside Electron's per-user `userData` directory — the value every
 *  `registryDir` parameter below takes. */
function registryDirPath(userDataDir: string): string {
  return path.join(userDataDir, REGISTRY_DIR_NAME);
}

/** @returns where pre-2026-09-20 builds kept their single shared file: beside `registryDir`. */
function legacyRegistryFilePath(registryDir: string): string {
  return path.join(path.dirname(registryDir), LEGACY_REGISTRY_FILE_NAME);
}

/** @returns one instance's own file inside `registryDir` — this process's unless a test names another. */
function instanceFilePath(registryDir: string, instanceId: string = OWN_INSTANCE_ID): string {
  return path.join(registryDir, `${instanceId}.json`);
}

/** Whether a parsed row has the two fields every reader keys on. Other fields are trusted as written.
 *  @complexity O(1). */
function isUsableRow(row: unknown): boolean {
  return typeof row === "object" && row !== null && typeof (row as RawSiteProcessRow).siteDir === "string" && typeof (row as RawSiteProcessRow).pid === "number";
}

/**
 * Read ONE registry file. Malformed ROWS inside a well-formed file are dropped (they cannot be
 * reconciled or matched anyway); a malformed FILE is `unreadable`, never an empty list — see
 * {@link RegistryFileRead}. Launch is still never blocked: callers decide what unreadable means.
 * @complexity O(n) in file size.
 */
function readRegistryFile(filePath: string): RegistryFileRead {
  const read = readJsonFile(filePath);
  if (read.state !== "ok") return read.state === "missing" ? { state: "missing" } : { state: "unreadable" };
  const sites = (read.value as { sites?: unknown } | null)?.sites;
  if (!Array.isArray(sites)) return { state: "unreadable" };
  return { state: "ok", sites: sites.filter(isUsableRow) as SiteProcessRow[] };
}

/**
 * Every instance file in `registryDir`. A missing directory is simply "no instance has written yet".
 * @returns the files, or `null` when the directory exists but cannot be listed — its rows are
 *   unknown, which each caller must treat as such rather than as "none".
 * @complexity O(n) in directory entries.
 */
function listInstanceFiles(registryDir: string): InstanceFile[] | null {
  let names: string[];
  try {
    names = fs.readdirSync(registryDir);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? [] : null;
  }
  return names.flatMap((name) => {
    const match = INSTANCE_FILE_PATTERN.exec(name);
    return match ? [{ filePath: path.join(registryDir, name), instanceId: name.slice(0, -".json".length), ownerPid: Number(match[1]) }] : [];
  });
}

/**
 * Every row any instance has recorded — each instance's own file plus the legacy shared file — for
 * readers that must see sibling instances (the delete guard's `liveForeignServers`).
 *
 * A file that vanishes between the listing and the read was deleted by a booting instance because
 * its owner is gone, so it is correctly skipped. An unreadable one is listed in `unreadable` instead.
 * @complexity O(total file size) across every instance file.
 */
function readRegistry(registryDir: string): RegistrySnapshot {
  const files = listInstanceFiles(registryDir);
  const snapshot: RegistrySnapshot = { sites: [], unreadable: files === null ? [registryDir] : [] };
  for (const filePath of [...(files ?? []).map((file) => file.filePath), legacyRegistryFilePath(registryDir)]) {
    const read = readRegistryFile(filePath);
    if (read.state === "ok") snapshot.sites.push(...read.sites);
    else if (read.state === "unreadable") snapshot.unreadable.push(filePath);
  }
  return snapshot;
}

/**
 * A row as {@link writeRegistry} accepts it — every field `unknown`, so a test proving
 * {@link readRegistryFile}'s own filtering can write deliberately malformed rows (a missing `siteDir`, a
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

/**
 * How a quarantined registry file is announced. The mechanism — and the message's shape — is shared
 * with every other durable store in this app (`durable-json-file.ts`); only these two sentences are
 * the registry's own.
 */
const REGISTRY_QUARANTINE_NOTICE: QuarantineNotice = {
  label: "site-process registry file",
  consequence: "site processes it listed cannot be reconciled automatically.",
};

/**
 * Atomically replace one registry file. The mechanism (temp file, `fsync`, `rename`) is
 * `durable-json-file.ts`'s {@link writeJsonFileAtomic} — this is the registry-typed doorway to it,
 * kept so every caller and test still names the registry rather than a generic writer.
 *
 * A crash can leave a `.tmp` behind; the next write by that pid truncates it, and
 * {@link reconcileInstanceFile} removes a dead owner's.
 * @complexity O(n) in row count.
 */
function writeRegistry(filePath: string, state: WritableSiteProcessRegistry): void {
  writeJsonFileAtomic(filePath, state);
}

/**
 * This instance's own rows, for a read-modify-write of its own file.
 *
 * An unreadable own file is moved aside and the write proceeds from empty, rather than refusing the
 * write: the caller is recording a child it has just spawned or just stopped, and refusing would leave
 * that child with no crash-recovery row (or a stale one) — the very thing the registry exists to
 * prevent — while throwing from `startSiteBackend` would strand a started server with no handle.
 * The unreadable bytes survive aside either way. With atomic writes this takes outside damage.
 *
 * @returns the rows, or `null` when the unreadable file could not be moved aside: do not write.
 * @complexity O(n) in file size.
 */
function readOwnRowsForUpdate(filePath: string): SiteProcessRow[] | null {
  const read = readRegistryFile(filePath);
  if (read.state === "ok") return read.sites;
  if (read.state === "missing") return [];
  return quarantineUnreadableFile(filePath, REGISTRY_QUARANTINE_NOTICE) ? [] : null;
}

/** {@link recordSiteOpened}'s own options. */
interface RecordSiteOpenedOptions {
  isLiveRow?: (row: SiteProcessRow) => boolean;
  /** Test seam: whose file to update. Defaults to this process's own. */
  instanceId?: string;
}

/**
 * Record one open site's row in THIS instance's own file — called once `startTovuServer` has actually
 * resolved, so a row is never written for a spawn attempt that failed.
 *
 * **Refuse-not-replace (D-07).** This used to drop every existing row with the same `siteDir`
 * unconditionally, which — back when every instance shared one file — let instance B opening a site
 * instance A had open erase A's row. Since 2026-09-20 a sibling's rows live in the sibling's own
 * file, so this can no longer touch them at all. The rule still matters inside one instance: a
 * window's `closed` handler drops its `openSites` entry before that child's `stop()` has finished
 * draining, so the same site can be reopened while its previous child is still alive, and that
 * child's row must survive until its own `recordSiteClosed`, or a hard kill mid-drain strands it.
 *
 * A row is only displaced once it is PROVEN dead — the same identity proof
 * ({@link isServeProcessForSite}) reconciliation makes before it kills anything, so a pid the OS
 * recycled to something unrelated never counts as "still live" and rows cannot accumulate. Two rows
 * for one `siteDir` in this file therefore mean exactly what they say: this instance really has two
 * `tovu serve` children over that site, the old one still stopping.
 *
 * @param options.isLiveRow test seam — the "is this row's process still its own live `tovu serve`"
 *   predicate. Defaults to {@link isLiveServeRow}, which really asks the OS.
 * @complexity O(n) in row count, times one `ps` call per same-`siteDir` row (in practice zero or one).
 */
function recordSiteOpened(registryDir: string, row: SiteProcessRow, options: RecordSiteOpenedOptions = {}): void {
  const isLiveRow = options.isLiveRow ?? isLiveServeRow;
  const filePath = instanceFilePath(registryDir, options.instanceId);
  const sites = readOwnRowsForUpdate(filePath);
  if (sites === null) return;
  const retained = sites.filter((existing) => existing.siteDir !== row.siteDir || isLiveRow(existing));
  writeRegistry(filePath, { sites: [row, ...retained] });
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
  /** Test seam: whose file to update. Defaults to this process's own. */
  instanceId?: string;
}

/**
 * Drop a site's row from THIS instance's own file — called once its `tovu serve` child has been asked
 * to stop deliberately (a window closed, or the whole app quit cleanly), so an ordinary shutdown is
 * never mistaken for a crash and reconciled against on the next launch.
 *
 * @param options.pid drop only the row carrying this pid. Every caller that HAS a pid passes it,
 *   and they all do — this is only ever called about a child the caller is holding a handle to.
 *   It matters because {@link recordSiteOpened} can legitimately leave two rows for one `siteDir` in
 *   this file (a still-stopping child plus its replacement): closing by `siteDir` alone would wipe the
 *   other one too. Omitting it keeps the original drop-every-row-for-this-site behaviour, so a future
 *   caller that genuinely means "forget this site entirely" still has that, and no existing call site
 *   changed meaning silently.
 * @complexity O(n) in row count.
 */
function recordSiteClosed(registryDir: string, siteDir: string, options: RecordSiteClosedOptions = {}): void {
  const filePath = instanceFilePath(registryDir, options.instanceId);
  const sites = readOwnRowsForUpdate(filePath);
  if (sites === null) return;
  const isDoomed = (existing: SiteProcessRow) => existing.siteDir === siteDir && (options.pid === undefined || existing.pid === options.pid);
  writeRegistry(filePath, { sites: sites.filter((existing) => !isDoomed(existing)) });
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
 * Measured on macOS 2026-09-06 against `tovu-server.ts`'s exact `detached: true` spawn shape:
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
 * Reads every OTHER instance's file (this process has written none yet at boot) plus the legacy
 * shared file, and REWRITES NONE of them. That is the 2026-09-20 fix: this used to rewrite the one
 * shared file with only the rows it kept, AFTER awaiting every orphan's SIGTERM grace window, so any
 * row a live sibling recorded during those seconds was silently dropped. Now:
 * - every row gets the same per-row proof as before, so a live sibling's child ({@link isOrphanedProcess})
 *   is never killed, whichever file names it;
 * - a file is deleted only once its OWNER pid is gone, since nothing will ever write it again —
 *   which also stops a later boot re-processing its rows. A live owner's file is left byte-for-byte
 *   as its owner wrote it; that owner drops its own rows as it closes sites;
 * - a pid the OS recycled keeps a dead owner's file around (fails toward keeping it), but its
 *   orphans are still reaped, because the parentage proof is per row, not per file.
 *
 * @param options.instanceId test seam: whose file counts as this process's own and is skipped.
 * @returns the rows that were found to be live orphans and terminated — for logging/reporting only.
 * @complexity O(n) in persisted row count across all files; each row's own cost is
 *   `terminateOrphan`'s bounded poll.
 */
async function reconcileOrphans(registryDir: string, options: { instanceId?: string } = {}): Promise<SiteProcessRow[]> {
  const ownInstanceId = options.instanceId ?? OWN_INSTANCE_ID;
  const files = listInstanceFiles(registryDir);
  if (files === null) console.error(`tovu desktop: could not list ${registryDir}; orphans recorded there are not reconciled this boot.`);

  const reconciled: SiteProcessRow[] = [];
  for (const file of files ?? []) {
    if (file.instanceId === ownInstanceId) continue;
    reconciled.push(...(await reconcileInstanceFile(file)));
  }
  reconciled.push(...(await reconcileLegacyFile(legacyRegistryFilePath(registryDir))));
  return reconciled;
}

/**
 * Terminate every row in `sites` that is still its own `tovu serve` AND a proven orphan. Rows whose
 * process is gone, recycled, or still parented by a live sibling instance are left alone.
 * @returns the rows terminated.
 * @complexity O(n) in `sites`; each orphan's cost is `terminateOrphan`'s bounded poll.
 */
async function reconcileRows(sites: SiteProcessRow[]): Promise<SiteProcessRow[]> {
  const reconciled: SiteProcessRow[] = [];
  for (const row of sites) {
    if (!isProcessAlive(row.pid)) continue;
    if (!isServeProcessForSite(readProcessCommand(row.pid) ?? "", row)) continue;
    if (!isOrphanedProcess(row.pid)) continue;
    reconciled.push(row);
    await terminateOrphan(row);
  }
  return reconciled;
}

/**
 * {@link reconcileOrphans} for one other instance's file. Deleted (with any temp file a crash left) only
 * when its owner pid is gone; an unreadable one is moved aside under the same condition, and
 * otherwise left for its live owner, whose next write moves it aside itself.
 * @complexity see {@link reconcileRows}.
 */
async function reconcileInstanceFile(file: InstanceFile): Promise<SiteProcessRow[]> {
  const ownerGone = !isProcessAlive(file.ownerPid);
  const read = readRegistryFile(file.filePath);
  if (read.state === "unreadable") {
    if (ownerGone) quarantineUnreadableFile(file.filePath, REGISTRY_QUARANTINE_NOTICE);
    else console.error(`tovu desktop: site-process registry file ${file.filePath} is unreadable; its owner (pid ${file.ownerPid}) is still running, so it is left untouched.`);
    return [];
  }
  const reconciled = read.state === "ok" ? await reconcileRows(read.sites) : [];
  if (ownerGone) {
    fs.rmSync(file.filePath, { force: true });
    fs.rmSync(tempPathFor(file.filePath, file.ownerPid), { force: true });
  }
  return reconciled;
}

/**
 * {@link reconcileOrphans} for the pre-2026-09-20 shared file: its orphans are reaped, the file itself
 * is never rewritten (see {@link LEGACY_REGISTRY_FILE_NAME}). An unreadable one — a torn write by an
 * older build — is moved aside so its bytes survive and it stops tripping readers.
 * @complexity see {@link reconcileRows}.
 */
async function reconcileLegacyFile(legacyPath: string): Promise<SiteProcessRow[]> {
  const read = readRegistryFile(legacyPath);
  if (read.state === "unreadable") {
    quarantineUnreadableFile(legacyPath, REGISTRY_QUARANTINE_NOTICE);
    return [];
  }
  return read.state === "ok" ? reconcileRows(read.sites) : [];
}

export {
  REGISTRY_DIR_NAME,
  LEGACY_REGISTRY_FILE_NAME,
  registryDirPath,
  legacyRegistryFilePath,
  instanceFilePath,
  readRegistryFile,
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
