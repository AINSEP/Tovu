/**
 * @file The read-modify-write race on the two `userData` files every app instance SHARES —
 * `desktop-projects.json` (`tracked-sites.ts`) and `desktop-state.json` (`site-dir-store.ts`) —
 * proven with a real second process, because one process's synchronous code cannot interleave with
 * itself. Several instances at once is the normal case here (the owner runs them on purpose, and
 * ruled out a single-instance lock), and the `tovu-desktop add-site` CLI and the MCP bridge write the
 * projects list from their own processes too.
 *
 * The child runs the store's own writer with `fs.writeFileSync` held open at the moment it persists
 * its change — after it has read the file, before its write lands — and says so through a sentinel
 * file. This process then makes its own change. Without cross-process exclusion the child's write
 * lands last and erases this process's; with it, this process waits its turn and both survive.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

import { sitesFilePath, readTrackedSites, readDismissedSites, trackSite } from "./tracked-sites.ts";
import { stateFilePath, readDesktopState, rememberSiteDir } from "./site-dir-store.ts";

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));

/** How long the child holds its write open once it has signalled — long enough that this process's
 *  own write certainly runs inside that window. */
const STALL_MS = 400;

/** Runs in the child: hold the first `fs.writeFileSync` whose data carries the child's own value (the
 *  store persisting the child's change), signal through the sentinel, then let the write complete. */
const CHILD_SCRIPT = `
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const [modulePath, exportName, filePath, value, sentinelPath, stallMs] = process.argv.slice(1);
const realWriteFileSync = fs.writeFileSync;
let stalled = false;
fs.writeFileSync = (target, data, ...rest) => {
  if (!stalled && String(data).includes(value)) {
    stalled = true;
    realWriteFileSync(sentinelPath, "writing");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(stallMs));
  }
  return realWriteFileSync(target, data, ...rest);
};
const store = await import(pathToFileURL(modulePath).href);
store[exportName](filePath, value);
`;

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-store-race-"));
}

/** Resolves once `sentinelPath` exists; rejects if the child exits first or never gets there. */
async function waitForSentinel(sentinelPath: string, child: ChildProcess, stderr: () => string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(sentinelPath)) {
    if (child.exitCode !== null) throw new Error(`the other process exited before reaching its write: ${stderr()}`);
    if (Date.now() > deadline) throw new Error(`the other process never reached its write: ${stderr()}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** One store write run in another process, and held open at the point it persists. */
interface OtherProcessWrite {
  moduleFile: string;
  exportName: string;
  filePath: string;
  value: string;
}

/** Run `ownWrite` in THIS process while another process is midway through `other`'s write, then wait
 *  for that process to finish. */
async function whileAnotherProcessWrites(other: OtherProcessWrite, ownWrite: () => void): Promise<void> {
  const sentinelPath = path.join(path.dirname(other.filePath), "other-process-is-writing");
  const args = [path.join(SRC_DIR, other.moduleFile), other.exportName, other.filePath, other.value, sentinelPath, String(STALL_MS)];
  const child = spawn(process.execPath, ["--no-warnings", "--input-type=module", "-e", CHILD_SCRIPT, ...args], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr!.setEncoding("utf8");
  child.stderr!.on("data", (chunk: string) => (stderr += chunk));
  const exited = once(child, "exit");

  await waitForSentinel(sentinelPath, child, () => stderr);
  ownWrite();
  const [code] = await exited;
  assert.equal(code, 0, `the other process failed: ${stderr}`);
}

test("desktop-projects.json: a project another process adds while this one is writing is not lost", async () => {
  const projectsPath = sitesFilePath(tempDir());

  await whileAnotherProcessWrites({ moduleFile: "tracked-sites.ts", exportName: "trackSite", filePath: projectsPath, value: "/sites/child" }, () => {
    trackSite(projectsPath, "/sites/parent");
  });

  assert.deepEqual(
    readTrackedSites(projectsPath).map(({ siteDir, origin }) => ({ siteDir, origin })),
    [
      { siteDir: "/sites/child", origin: "adopted" },
      { siteDir: "/sites/parent", origin: "adopted" },
    ],
  );
  assert.deepEqual(readDismissedSites(projectsPath), []);
});

test("desktop-state.json: a recent site another process remembers while this one is writing is not lost", async () => {
  const statePath = stateFilePath(tempDir());

  await whileAnotherProcessWrites({ moduleFile: "site-dir-store.ts", exportName: "rememberSiteDir", filePath: statePath, value: "/sites/child" }, () => {
    rememberSiteDir(statePath, "/sites/parent");
  });

  assert.deepEqual(readDesktopState(statePath), { recentSiteDirs: ["/sites/parent", "/sites/child"] });
});
