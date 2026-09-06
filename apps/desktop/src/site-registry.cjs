/**
 * @file Persisted record of which sites THIS app has spawned a `tovu serve` child for, and the
 * boot-time reconciliation that uses it.
 *
 * Multi-site sharpens a risk `main.cjs`'s own prior comment already named for the single-site case:
 * "A hard kill of Electron itself (SIGKILL, a crash, a logout) still bypasses [graceful shutdown] and
 * can strand the child. Tovu-Runner answers that with a pid registry and boot-time orphan
 * reconciliation; that machinery belongs with the fleet supervisor, not here, and is reported rather
 * than ported." With N sites open at once, the SAME hard kill strands N children instead of one —
 * this file is that machinery, now that there is a fleet-shaped reason to build it: Tovu-Runner's own
 * `project-provisioner.ts:617-871` (~255 lines) cluster (`isProcessAlive`, `isProjectSidecar`,
 * `terminateOrphan`, `reconcile`), reproduced at the size this shell actually needs.
 *
 * **Storage shape, decided and justified (not inherited from `site-dir-store.cjs`'s MRU file):**
 * still a flat JSON file in `userData`, for the exact reason `site-dir-store.cjs`'s own header gives
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
 * flag. That proof is free here with NO new argv marker needed: `tovu-server.cjs` already spawns
 * `tovu serve <siteDir> --port <port>` (via `--import tsx` or the compiled CLI — either way the same
 * two tokens land in argv), unlike the agent-daemon child one level down inside each `tovu serve`,
 * which had no site-specific argv at all until `daemon-supervisor.ts`'s own `--workspace` fix.
 *
 * **What this deliberately does NOT do**: reopen or reattach a reconciled site. This app holds no
 * live `ChildProcess` reference for a process it did not spawn this boot — no stdout/stderr pipe, no
 * handle {@link import("./tovu-server.cjs").startTovuServer}'s `stop()` could ever use — so
 * "reclaiming" it would mean fabricating a fake handle around a process the shell cannot actually
 * supervise. Terminating it and leaving the site closed (findable again through "Open Recent",
 * `site-dir-store.cjs`'s existing MRU) is the smaller, honest surface this pass actually verified;
 * auto-restoring a full session is a follow-up, not this fix.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REGISTRY_FILE_NAME = "open-sites.json";

/** SIGTERM-to-SIGKILL window for a reconciled orphan — matches `tovu-server.cjs`'s own
 *  `DEFAULT_STOP_GRACE_MS`, the same grace `serve.ts`'s BR-07 drain gets when this app spawned the
 *  child itself this boot. */
const DEFAULT_TERMINATE_GRACE_MS = 5_000;
const TERMINATE_POLL_MS = 200;

/** @returns the registry file's path inside Electron's per-user `userData` directory. */
function registryFilePath(userDataDir) {
  return path.join(userDataDir, REGISTRY_FILE_NAME);
}

/**
 * Forgiving read, mirroring `site-dir-store.cjs`'s `readDesktopState` — a corrupt or missing cache
 * must not block launch; it just means nothing is reconciled this boot.
 * @complexity O(n) in file size.
 */
function readRegistry(registryPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const sites = Array.isArray(parsed?.sites) ? parsed.sites : [];
    return { sites: sites.filter((row) => row && typeof row.siteDir === "string" && typeof row.pid === "number") };
  } catch {
    return { sites: [] };
  }
}

/** @complexity O(n) in row count. */
function writeRegistry(registryPath, state) {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(state, null, 2));
}

/**
 * Record (or replace) one open site's row, keyed by `siteDir` — called once `startTovuServer` has
 * actually resolved, so a row is never written for a spawn attempt that failed.
 * @complexity O(n) in row count.
 */
function recordSiteOpened(registryPath, row) {
  const { sites } = readRegistry(registryPath);
  writeRegistry(registryPath, { sites: [row, ...sites.filter((existing) => existing.siteDir !== row.siteDir)] });
}

/**
 * Drop a site's row — called once its `tovu serve` child has been asked to stop deliberately (a
 * window closed, or the whole app quit cleanly), so an ordinary shutdown is never mistaken for a
 * crash and reconciled against on the next launch.
 * @complexity O(n) in row count.
 */
function recordSiteClosed(registryPath, siteDir) {
  const { sites } = readRegistry(registryPath);
  writeRegistry(registryPath, { sites: sites.filter((existing) => existing.siteDir !== siteDir) });
}

/**
 * Whether a pid still names a live process. Signal `0` sends nothing and reads nothing — it only
 * asks the kernel "does this pid exist and can I signal it" — the same check Tovu-Runner's own
 * `isProcessAlive` makes.
 * @complexity O(1).
 */
function isProcessAlive(pid) {
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
function readProcessCommand(pid) {
  try {
    const output = execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
    return output.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Runner's `isProjectSidecar` technique: a pid is only trusted to BE this row's `tovu serve` once
 * its live argv contains both the site dir and its `--port <n>` flag — never taken on faith just
 * because a number in a persisted row happens to still name a running process.
 * @complexity O(1) — two substring checks.
 */
function isServeProcessForSite(commandLine, row) {
  return commandLine.includes(row.siteDir) && commandLine.includes(`--port ${row.port}`);
}

/** @complexity O(1); the caller bounds how many times this is awaited. */
function sleep(ms) {
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
async function terminateOrphan(row, graceMs = DEFAULT_TERMINATE_GRACE_MS) {
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
 * Boot-time orphan reconciliation — the piece `main.cjs`'s own prior comment named as deliberately
 * deferred. Call once, before any window is created: for every row this app persisted before its
 * last exit, prove whether the pid is STILL that row's own `tovu serve` (identity-before-kill, see
 * {@link isServeProcessForSite}), and if so terminate it — a prior run's window is gone, so nothing
 * will ever call that child's own `stop()` again, and a plain SIGTERM here still gives it the same
 * BR-07 graceful drain `serve.ts` runs for any other shutdown signal.
 *
 * Always leaves the registry holding zero rows on return — every row looked at is removed whether it
 * was reconciled or found already gone, so a later boot never re-processes the same entry twice.
 *
 * @returns the rows that were found to be live orphans and terminated — for logging/reporting only.
 * @complexity O(n) in persisted row count; each row's own cost is `terminateOrphan`'s bounded poll.
 */
async function reconcileOrphans(registryPath) {
  const { sites } = readRegistry(registryPath);
  const reconciled = [];

  for (const row of sites) {
    if (isProcessAlive(row.pid) && isServeProcessForSite(readProcessCommand(row.pid) ?? "", row)) {
      reconciled.push(row);
      await terminateOrphan(row);
    }
  }

  writeRegistry(registryPath, { sites: [] });
  return reconciled;
}

module.exports = {
  REGISTRY_FILE_NAME,
  registryFilePath,
  readRegistry,
  writeRegistry,
  recordSiteOpened,
  recordSiteClosed,
  isProcessAlive,
  readProcessCommand,
  isServeProcessForSite,
  terminateOrphan,
  reconcileOrphans,
};
