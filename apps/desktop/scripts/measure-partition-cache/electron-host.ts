/**
 * @file P11 ST-1a.T — the REAL effects behind the isolated probe: Electron sessions and hidden windows,
 * child relaunches, the loopback server, the disposable root's filesystem, directory measurement and the
 * evidence file. `packaged-entry.ts` wires these into `runCacheProbe` (launcher) or `runProbeStep` (child).
 *
 * This is the composition root, so it is the only probe file that touches Electron or the disk. It is
 * exercised by the packaged Mac run itself (external), not by the fixture tests, which inject fakes for
 * every port defined in `main.ts` and `probe-step.ts`.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { App, BrowserWindow, Session } from "electron";

import { PROBE_ELECTRON_VERSION, runCacheProbe, type EvidenceWriter, type ProbeElectron, type ProbeFs, type ProbeLoopback, type ProbeMeasure } from "./main.ts";
import { ROOT_MARKER, runProbeStep, type PartitionHandle, type ProbeStep, type StepHost, type StepReport } from "./probe-step.ts";
import type { SurvivalObservation } from "./verdict.ts";

export interface ElectronApi {
  readonly app: App;
  readonly BrowserWindow: typeof BrowserWindow;
  readonly session: { fromPartition(partition: string): Session };
}

const MiB = 2 ** 20;
const STEP_ARG = "--probe-step=";
const EVIDENCE_ARG = "--evidence-dir=";
const PLATFORM_ARG = "--expect-platform=";
const REPORT_PREFIX = "TOVU_CACHE_PROBE_STEP_REPORT ";
const CACHEABLE = "public, max-age=31536000, immutable";

// ---- child side: one partition as a hidden window ------------------------------------------------

/** Fetches each 1 MiB body, then runs a matching script twice (the second run, from the HTTP cache, is what makes V8 write Code Cache). */
const fillScript = (urls: readonly string[]) => `(async (urls) => {
  for (const url of urls) {
    await (await fetch(url)).arrayBuffer();
    for (let pass = 0; pass < 2; pass += 1) await new Promise((done) => {
      const script = document.createElement("script");
      script.src = url.replace("/blob/", "/script/") + ".js";
      script.onload = script.onerror = done;
      document.head.append(script);
    });
  }
  return true;
})(${JSON.stringify(urls)})`;
const IDB_OPEN = `const open = indexedDB.open("tovu-probe", 1); open.onupgradeneeded = () => open.result.createObjectStore("kv");`;
const SEED_SCRIPT = `(async () => {
  document.cookie = "tovuProbe=1; max-age=31536000; path=/; SameSite=Lax";
  localStorage.setItem("tovuProbe", "1");
  await new Promise((resolve, reject) => { ${IDB_OPEN} open.onerror = () => reject(open.error); open.onsuccess = () => {
    const tx = open.result.transaction("kv", "readwrite"); tx.objectStore("kv").put("1", "tovuProbe");
    tx.oncomplete = () => { open.result.close(); resolve(true); }; tx.onerror = () => reject(tx.error); }; });
  return true;
})()`;
const READ_SCRIPT = `(async () => {
  const indexedDb = await new Promise((resolve) => { ${IDB_OPEN} open.onerror = () => resolve(false); open.onsuccess = () => {
    const get = open.result.transaction("kv").objectStore("kv").get("tovuProbe");
    get.onsuccess = () => { open.result.close(); resolve(get.result === "1"); }; get.onerror = () => resolve(false); }; });
  return { cookie: document.cookie.split("; ").includes("tovuProbe=1"), localStorage: localStorage.getItem("tovuProbe") === "1", indexedDb };
})()`;

/** Untrusted page output → observation; anything not a boolean is a missing reading. */
function toObservation(value: unknown): SurvivalObservation {
  const record = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const read = (key: string) => (typeof record[key] === "boolean" ? (record[key] as boolean) : null);
  return { cookie: read("cookie"), localStorage: read("localStorage"), indexedDb: read("indexedDb") };
}

async function openPartition({ electron, partition, origin }: { electron: ElectronApi; partition: string; origin: string }): Promise<PartitionHandle> {
  const ses = electron.session.fromPartition(partition);
  const win = new electron.BrowserWindow({ show: false, webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await win.loadURL(`${origin}/page`);
  const run = (source: string): Promise<unknown> => win.webContents.executeJavaScript(source, true);
  return {
    fetchCacheable: async ({ urls }) => { await run(fillScript(urls)); },
    seedStorage: async () => { await run(SEED_SCRIPT); },
    readStorage: async () => toObservation(await run(READ_SCRIPT)),
    clearCache: () => ses.clearCache(),
    clearCodeCaches: () => ses.clearCodeCaches({}),
    // Negative control ONLY: `runCacheProbe` sends `clear-storage` to its dedicated pair inside the disposable root.
    clearStorageData: () => ses.clearStorageData(),
    close: async () => { ses.flushStorageData(); await ses.cookies.flushStore(); win.destroy(); },
  };
}

/** The child's {@link StepHost}. `readMarker` is synchronous so the marker check lands before `ready`. */
export function electronStepHost({ electron }: { electron: ElectronApi }, _optional: Record<string, never> = {}): StepHost {
  const { app } = electron;
  // Closing the last hidden window must not end the process before the report is written.
  app.on("window-all-closed", () => {});
  return {
    readMarker: ({ root }) => { try { return readFileSync(path.join(root, ROOT_MARKER), "utf8"); } catch { return null; } },
    appendSwitch: (name, value) => app.commandLine.appendSwitch(name, value),
    setPath: (name, value) => app.setPath(name, value),
    whenReady: async () => { await app.whenReady(); },
    openPartition: ({ partition, origin }) => openPartition({ electron, partition, origin }),
  };
}

// ---- launcher side: relaunches, loopback server, disposable root ---------------------------------

function parseReport(output: string, code: number | null): StepReport {
  const line = output.split("\n").find((candidate) => candidate.startsWith(REPORT_PREFIX));
  if (!line) return { ok: false, reason: `child exited ${code} without a report`, storage: {} };
  try { return JSON.parse(line.slice(REPORT_PREFIX.length)) as StepReport; } catch { return { ok: false, reason: "unreadable child report", storage: {} }; }
}

/** Each step is a fresh process of this same packaged executable: a real relaunch. @complexity O(1) per step. */
export function childLauncher({ executable }: { executable: string }, { timeoutMs = 180_000 }: { timeoutMs?: number } = {}): ProbeElectron["launch"] {
  return ({ step }) => new Promise<StepReport>((resolve) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, [`${STEP_ARG}${Buffer.from(JSON.stringify(step)).toString("base64url")}`], { env, stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); resolve({ ok: false, reason: error.message, storage: {} }); });
    child.on("exit", (code) => { clearTimeout(timer); resolve(parseReport(output, code)); });
  });
}

/** Deterministic, distinct, incompressible-looking 1 MiB body per id. */
function blobBody(id: string): Buffer {
  const seed = createHash("sha256").update(id).digest();
  const body = Buffer.alloc(MiB);
  for (let offset = 0; offset < MiB; offset += seed.length) createHash("sha256").update(seed).update(String(offset)).digest().copy(body, offset);
  return body;
}
const scriptBody = (id: string) => `// ${id}\n` + Array.from({ length: 3000 }, (_, i) => `function f${i}(x){return x*${i}+${i}%7;}`).join("\n");

function sendBody(res: http.ServerResponse, { type, body, cache }: { type: string; body: string | Buffer; cache: string }): void {
  res.writeHead(200, { "content-type": type, "cache-control": cache, "content-length": Buffer.byteLength(body) });
  res.end(body);
}

function serveProbe(req: http.IncomingMessage, res: http.ServerResponse): void {
  const remote = req.socket.remoteAddress ?? "";
  if (remote !== "127.0.0.1" && remote !== "::ffff:127.0.0.1") { res.writeHead(403).end(); return; }
  const { pathname } = new URL(req.url ?? "/", "http://127.0.0.1");
  const blob = /^\/blob\/([\w-]+)$/.exec(pathname);
  const script = /^\/script\/([\w-]+)\.js$/.exec(pathname);
  if (pathname === "/page") sendBody(res, { type: "text/html", body: "<!doctype html><title>probe</title>", cache: "no-store" });
  else if (blob) sendBody(res, { type: "application/octet-stream", body: blobBody(blob[1]!), cache: CACHEABLE });
  else if (script) sendBody(res, { type: "text/javascript", body: scriptBody(script[1]!), cache: CACHEABLE });
  else res.writeHead(404).end();
}

/** Bound to 127.0.0.1 only, on one port for the whole run, so storage origins stay stable across relaunches. */
export const loopbackServer: ProbeLoopback = {
  start: () => new Promise((resolve, reject) => {
    const server = http.createServer(serveProbe);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); }) });
    });
  }),
};

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

export const nodeProbeFs: ProbeFs = {
  // `mkdtemp` creates a new, uniquely named directory or fails: the root is exclusive to this run.
  makeExclusiveDir: ({ parent, prefix }) => mkdtemp(path.join(parent, prefix)),
  identity: async ({ path: target }) => { try { const info = await stat(target); return `${info.dev}:${info.ino}`; } catch { return null; } },
  writeMarker: ({ root, token }) => writeFile(path.join(root, ROOT_MARKER), token, { flag: "wx" }),
  readMarker: async ({ root }) => { try { return await readFile(path.join(root, ROOT_MARKER), "utf8"); } catch { return null; } },
  removeDir: ({ path: target }) => rm(target, { recursive: true, force: true }),
  randomToken: () => randomBytes(16).toString("hex"),
};

async function treeBytes(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await treeBytes(full);
    // Symlinks and special files are not cache bytes.
    else total += entry.isFile() ? (await lstat(full)).size : 0;
  }
  return total;
}

/** Apparent bytes of every file under a directory; null when the directory does not exist. @complexity O(files). */
export const nodeMeasure: ProbeMeasure = {
  dirBytes: async ({ path: target }) => { try { return await treeBytes(target); } catch (error) { if (isMissing(error)) return null; throw error; } },
};

export function fileEvidenceWriter({ dir }: { dir: string }, _optional: Record<string, never> = {}): EvidenceWriter {
  return {
    write: async ({ fileName, record }) => {
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, fileName);
      await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
      return file;
    },
  };
}

// ---- boot ----------------------------------------------------------------------------------------

async function runChild({ electron, encoded }: { electron: ElectronApi; encoded: string }): Promise<void> {
  let report: StepReport;
  try {
    const step = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ProbeStep;
    report = await runProbeStep({ host: electronStepHost({ electron }), step });
  } catch (error) {
    report = { ok: false, reason: error instanceof Error ? error.message : String(error), storage: {} };
  }
  process.stdout.write(`${REPORT_PREFIX}${JSON.stringify(report)}\n`);
  // A graceful quit flushes Local Storage / IndexedDB; a refused step never opened a profile worth flushing.
  if (report.ok) electron.app.quit();
  else electron.app.exit(1);
}

const argValue = (argv: readonly string[], prefix: string) => argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);

async function runLauncher({ electron, argv }: { electron: ElectronApi; argv: readonly string[] }): Promise<void> {
  const { app } = electron;
  // The launcher opens no window, but Electron still initialises a profile at `ready`: keep it throwaway too.
  const scratch = mkdtempSync(path.join(os.tmpdir(), "tovu-cache-probe-launcher-"));
  app.setPath("userData", path.join(scratch, "userData"));
  app.setPath("sessionData", path.join(scratch, "session"));
  const evidenceDir = argValue(argv, EVIDENCE_ARG) ?? path.join(process.cwd(), "plans", "evidence");
  const electronPort: ProbeElectron = { version: process.versions.electron ?? "unknown", platform: `${process.platform}-${process.arch}`, isPackaged: app.isPackaged, launch: childLauncher({ executable: process.execPath }) };
  try {
    const result = await runCacheProbe(
      { electron: electronPort, loopback: loopbackServer, appPaths: { tempDir: os.tmpdir() }, fs: nodeProbeFs, measure: nodeMeasure, evidenceWriter: fileEvidenceWriter({ dir: evidenceDir }) },
      { expected: { electronVersion: PROBE_ELECTRON_VERSION, platform: argValue(argv, PLATFORM_ARG) ?? "darwin-arm64" } },
    );
    process.stdout.write(`${JSON.stringify({ verdict: result.verdict, evidenceFile: result.evidenceFile, reasons: result.record.reasons }, null, 2)}\n`);
    app.exit(0);
  } catch (error) {
    process.stderr.write(`partition-cache probe failed: ${error instanceof Error ? error.stack : String(error)}\n`);
    app.exit(1);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Packaged entry dispatch: a `--probe-step=` argument makes this process one child relaunch; otherwise
 * it is the launcher. Both paths apply their profile paths synchronously, before `ready`.
 */
export function bootProbe({ electron, argv }: { electron: ElectronApi; argv: readonly string[] }, _optional: Record<string, never> = {}): void {
  const encoded = argValue(argv, STEP_ARG);
  if (encoded !== undefined) void runChild({ electron, encoded });
  else void runLauncher({ electron, argv });
}
