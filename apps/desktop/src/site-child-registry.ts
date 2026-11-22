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
import { createChildRegistry, createChildProcessInspection } from "@jini-ai/sidecar/supervisor/node";
import { resolveOnPath } from "@jini-ai/agent-runtime";
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

/** Reuse this launch's existing nonce. No site authority is stored in the discovery record.
 * The suffix deliberately differs from a site-process row file, so orphan-row readers ignore it. */
export function agentServiceRegistryPath({ registryDir }: { registryDir: string }, _optional = {}): string {
  return path.join(registryDir, `${OWN_INSTANCE_ID}.agent-daemon`);
}

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
function registryDirPath({ userDataDir }: { userDataDir: string }, _optional = {}): string {
  return path.join(userDataDir, REGISTRY_DIR_NAME);
}

/** @returns where pre-2026-09-20 builds kept their single shared file: beside `registryDir`. */
function legacyRegistryFilePath({ registryDir }: { registryDir: string }, _optional = {}): string {
  return path.join(path.dirname(registryDir), LEGACY_REGISTRY_FILE_NAME);
}

/** @returns one instance's own file inside `registryDir` — this process's unless a test names another. */
function instanceFilePath({ registryDir }: { registryDir: string }, { instanceId = OWN_INSTANCE_ID }: { instanceId?: string } = {}): string {
  return path.join(registryDir, `${instanceId}.json`);
}

/** Whether a parsed row has the two fields every reader keys on. Other fields are trusted as written.
 *  @complexity O(1). */
function isUsableRow({ row }: { row: unknown }, _optional = {}): boolean {
  return typeof row === "object" && row !== null && typeof (row as RawSiteProcessRow).siteDir === "string" && typeof (row as RawSiteProcessRow).pid === "number";
}

/**
 * Read ONE registry file. Malformed ROWS inside a well-formed file are dropped (they cannot be
 * reconciled or matched anyway); a malformed FILE is `unreadable`, never an empty list — see
 * {@link RegistryFileRead}. Launch is still never blocked: callers decide what unreadable means.
 * @complexity O(n) in file size.
 */
function readRegistryFile({ filePath }: { filePath: string }, _optional = {}): RegistryFileRead {
  const read = readJsonFile({ filePath });
  if (read.state !== "ok") return read.state === "missing" ? { state: "missing" } : { state: "unreadable" };
  const sites = (read.value as { sites?: unknown } | null)?.sites;
  if (!Array.isArray(sites)) return { state: "unreadable" };
  return { state: "ok", sites: sites.filter((row) => isUsableRow({ row })) as SiteProcessRow[] };
}

/**
 * Every row any instance has recorded — each instance's own file plus the legacy shared file — for
 * readers that must see sibling instances (the delete guard's `liveForeignServers`).
 *
 * A file that vanishes between the listing and the read was deleted by a booting instance because
 * its owner is gone, so it is correctly skipped. An unreadable one is listed in `unreadable` instead.
 * @complexity O(total file size) across every instance file.
 */
function readRegistry({ registryDir }: { registryDir: string }, _optional = {}): RegistrySnapshot {
  const { rows, unreadable } = siteChildRegistry.read({ registryDir });
  return { sites: rows, unreadable };
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
function writeRegistry({ filePath, state }: { filePath: string; state: WritableSiteProcessRegistry }, _optional = {}): void {
  writeJsonFileAtomic({ filePath, value: state });
}

/**
 * Whether `row`'s pid is still alive AND still that row's own `tovu serve` — alive alone is not
 * enough, since the OS is free to have reassigned that number to something unrelated.
 * @complexity O(1) beyond one `ps` call.
 */
function isLiveServeRow(row: ServeIdentityRow): boolean {
  if (!siteChildProcess.isProcessAlive({ pid: row.pid })) return false;
  return isServeProcessForSite({ commandLine: siteChildProcess.readProcessCommand({ pid: row.pid }) ?? "", row });
}

/** The real `ps`, stdout as text; throws when `ps` exits non-zero (a gone pid). @complexity O(1). */
function runPsArgvOnly({ args }: { args: string[] }, _optional = {}): string {
  const command = resolveOnPath({ bin: 'ps' });
  if (command === null) throw new Error('ps executable is unavailable.');
  return execFileSync(command, args, { encoding: "utf8" });
}

/**
 * Runner's `isProjectSidecar` technique: a pid is only trusted to BE this row's `tovu serve` once
 * its live argv contains the complete site dir and its `--port <n>` flag — never taken on faith just
 * because a number in a persisted row happens to still name a running process.
 * @complexity O(n) in command-line length.
 */
function isServeProcessForSite({ commandLine, row }: { commandLine: string; row: Pick<ServeIdentityRow, "siteDir" | "port"> }, _optional = {}): boolean {
  const siteDir = row.siteDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${siteDir}(?=\\s|$)`).test(commandLine)
    && new RegExp(`(?:^|\\s)--port\\s+${row.port}(?=\\s|$)`).test(commandLine);
}

export {
  REGISTRY_DIR_NAME, LEGACY_REGISTRY_FILE_NAME, registryDirPath, legacyRegistryFilePath,
  instanceFilePath, readRegistryFile, readRegistry, writeRegistry, isLiveServeRow,
  isServeProcessForSite,
};
export type { SiteProcessRow };

export const siteChildProcess = createChildProcessInspection({ runPs: runPsArgvOnly });

export const siteChildRegistry = createChildRegistry<SiteProcessRow>({
  instanceId: OWN_INSTANCE_ID,
  legacyPath: legacyRegistryFilePath,
  parseInstanceName: ({ name }) => {
    const match = INSTANCE_FILE_PATTERN.exec(name);
    return match ? { instanceId: name.slice(0, -".json".length), ownerPid: Number(match[1]) } : null;
  },
  keyOf: ({ row }) => row.siteDir,
  storage: {
    instancePath: ({ registryDir, instanceId }) => instanceFilePath({ registryDir }, { instanceId }),
    read: ({ filePath }) => {
      const read = readRegistryFile({ filePath });
      return read.state === "ok" ? { state: "ok", rows: read.sites } : read;
    },
    write: ({ filePath, rows }) => writeRegistry({ filePath, state: { sites: rows } }),
    quarantine: ({ filePath }) => quarantineUnreadableFile({ filePath, notice: REGISTRY_QUARANTINE_NOTICE }),
    removeDeadFile: ({ filePath, ownerPid }) => {
      // A dangling link still owns a directory entry; Node 24.2's rmSync leaves it behind.
      if (fs.lstatSync(filePath, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(filePath);
      else fs.rmSync(filePath, { force: true });
      fs.rmSync(tempPathFor({ filePath }, { pid: ownerPid }), { force: true });
    },
  },
  processes: {
    isAlive: siteChildProcess.isProcessAlive,
    isOrphan: siteChildProcess.isOrphanedProcess,
    isLiveRow: ({ row }) => isLiveServeRow(row),
    signal: ({ pid, signal }) => { process.kill(pid, signal); },
  },
  report: (event) => {
    if (event.type === "list-failed") console.error(`tovu desktop: could not list ${event.registryDir}; orphans recorded there are not reconciled this boot.`);
    else console.error(`tovu desktop: site-process registry file ${event.filePath} is unreadable; its owner (pid ${event.ownerPid}) is still running, so it is left untouched.`);
  },
});
