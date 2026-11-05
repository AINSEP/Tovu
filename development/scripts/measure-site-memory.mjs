#!/usr/bin/env node
/**
 * @file Measure one idle site's memory: the server, its agent daemon and any helper processes.
 *
 * The before/after harness for the slim-daemon plan (ADR-070,
 * `ADS-memory/.local-artifacts/handoffs/2026-10-26-memory-savings-plan.md` §6). It repeats the
 * baseline's method (`2026-10-26-memory-baseline.md`) so every phase is measured the same way:
 *
 *   node development/scripts/measure-site-memory.mjs --site <dir> --mode compiled|tsx
 *     [--idle-seconds 240] [--idle-minutes N] [--expect-daemon running|parked] [--workload chatting]
 *
 * Long-turn before/after budget (run the same command on each revision, one run at a time):
 *   node development/scripts/measure-site-memory.mjs --site <dir> --mode compiled --workload chatting
 * After warm-up, the server's inspector runs the real Tovu finalizer and SQLite run ledger against
 * a lazy deterministic fake daemon: 8192 text deltas plus 64 tool calls/results, 8 MiB of payload,
 * one replay reconnect and a 15 s quiet tool wait over ~20 minutes. No provider credentials needed.
 * Natural process.memoryUsage readings every 250 ms and after writes gate server peak RSS/heap
 * (512/256 MiB) and peak growth from the warmed baseline (256/128 MiB). Missing/incomplete turns
 * or overruns exit 1. The original tree/forced-GC measurement follows the turn; it is supplementary.
 * Chatting defaults --idle-minutes to 0 so an explicitly demanded daemon cannot park during the
 * fake turn. The fake workload itself never demands a real daemon.
 *
 * 1. Copies the site into a temp dir. SQLite files go through `sqlite3 .backup`, so a running site's
 *    WAL is folded in and its files are never opened for writing. `.agent-runtime/` (the daemon's
 *    pid registry) and sockets are not copied.
 * 2. Uses a fresh HOME and desktop userData, a minimal environment (no inherited secrets) and random
 *    admin and daemon credentials.
 * 3. Starts `tovu serve` with Electron run as node, the way the desktop spawns it. `compiled` first
 *    transpiles `apps/website/src` file by file with esbuild into the temp dir (no source maps, a
 *    `dist/package.json` for `#src/*`); `tsx` runs the TypeScript source with the tsx loader and,
 *    after it, the same `dev-source-maps-off.mjs` preload as the real dev launchers.
 *    `--idle-minutes` sets `TOVU_AGENT_DAEMON_IDLE_MINUTES` for the park phases.
 * 4. Waits `--idle-seconds` of natural idle (default 240: the V8 memory reducer runs within ~4 min).
 * 5. For every process in the server's tree: macOS `footprint`, then over the inspector
 *    `process.memoryUsage()`, the loaded `file:` module count, `HeapProfiler.collectGarbage`, an 8 s
 *    settle, `memoryUsage()` and `footprint` again. No sample is taken unless the server is alive
 *    and the daemon is in the phase's expected state (`--expect-daemon`; default `parked`, meaning
 *    absent, because cold startup and the fake chat do not demand it). Use explicit `running` for
 *    a workload that demands a real daemon. A process whose `footprint` cannot be read
 *    makes the result `complete: false` with null totals and exit code 1; it never counts as zero.
 *    Every node child inherits
 *    `NODE_OPTIONS=--inspect=127.0.0.1:0`; its inspector port is found with `lsof`.
 * 6. Kills every process it started by pid, checks their ports are closed, deletes the temp dir.
 *
 * Attach-only desktop mode (macOS/Windows; never copies, launches, compiles, GCs or stops targets):
 *   node development/scripts/measure-site-memory.mjs --mode desktop --attach desktop.json
 *     --workload idle-after-use|chatting
 * Run once during each real workload. The manifest names app/site roots and every identified PID:
 *   { "groups": [{ "name": "app", "rootPids": [123] }],
 *     "processes": [{ "pid": 123, "family": "main", "budgetMiB": 100 }] }
 * The budget above illustrates the schema, not a proposed main-process limit. Supply measured
 * budgets per PID (including each CLI/helper); all descendants are discovered and require metadata.
 * Include detached servers/daemons/helpers as roots or process entries. Use families main, GPU,
 * network, shell-renderer, site-guest, server, daemon, cli and mcp-helper as appropriate; mark a
 * warm slim daemon `warm-slim-daemon` to enforce W3-C's <=80 MiB gate. No command lines are emitted.
 * Missing PIDs/readings/metadata or a changing tree null the total and fail the run; budget overruns
 * also exit 1. Re-run a changing sample; the harness never freezes or stops target processes.
 *
 * Prints one JSON object on stdout (site mode: MiB; desktop: primary bytes plus MiB budgets).
 * Progress goes to stderr. The original site mode is macOS only.
 * Run one measurement at a time, never during a test batch, and never against a site in use
 * without reason: the copy is read-only for the source, but it does read the whole site.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collectProcessTreePids, listProcessSnapshots, listProcessUsage, parseProcessFootprint as parseFootprint, sampleProcessPrivateMemory } from "@jini-ai/platform/process";

export { parseFootprint };

import { deriveDistImports } from "./emit-dist-package-json.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEBSITE_SRC = path.join(REPO_ROOT, "apps/website/src");
const ELECTRON_BIN = path.join(REPO_ROOT, "apps/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const repoRequire = createRequire(path.join(REPO_ROOT, "package.json"));
/** `cli/commands/serve.ts`'s documented startup line (also parsed by `apps/desktop/src/tovu-server.ts`). */
const BOOT_LINE = /^tovu serve: dir=.+ port=(\d+) /m;
const BOOT_TIMEOUT_MS = 180_000;
const GC_SETTLE_MS = 8_000;
const MB = 1024 * 1024;
const SQLITE_FILE = /\.(db|sqlite)$/;
const SQLITE_SIDECAR = /\.(db|sqlite)-(wal|shm|journal)$/;
const MAPS_OFF = new URL("./dev-source-maps-off.mjs", import.meta.url).href;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message) => process.stderr.write(`measure-site-memory: ${message}\n`);
const toMb = (bytes) => (bytes === null ? null : Math.round((bytes / MB) * 10) / 10);

/** Parse the existing site options or `--mode desktop --attach <manifest> --workload <name>`. */
export function parseArgs({ argv }, _options = {}) {
  const options = { site: null, mode: null, idleSeconds: 240, idleMinutes: null, expectDaemon: null };
  const flags = { "--site": (v) => { options.site = path.resolve(v); }, "--mode": (v) => { options.mode = v; },
    "--idle-seconds": (v) => { options.idleSeconds = Number(v); }, "--idle-minutes": (v) => { options.idleMinutes = Number(v); },
    "--expect-daemon": (v) => { options.expectDaemon = v; }, "--attach": (v) => { options.attach = path.resolve(v); },
    "--workload": (v) => { options.workload = v; } };
  for (let i = 0; i < argv.length; i += 2) {
    const apply = flags[argv[i]];
    if (!apply || argv[i + 1] === undefined) throw new Error(`unknown option or missing value: ${argv[i]}`);
    apply(argv[i + 1]);
  }
  return checkOptions({ options });
}

/** Validate parsed options and fill `expectDaemon`'s default. */
function checkOptions({ options }) {
  if (options.mode === "desktop") return checkDesktopOptions({ options });
  if (options.attach) throw new Error("--attach requires --mode desktop");
  if (options.workload && options.workload !== "chatting") throw new Error("site --workload must be chatting");
  return checkSiteOptions({ options });
}

/** Validate the launched-site workload; cold registration and synthetic chat leave the daemon absent. */
function checkSiteOptions({ options }) {
  if (!options.site || !["compiled", "tsx"].includes(options.mode)) throw new Error("usage: --site <dir> --mode compiled|tsx [--idle-seconds N] [--idle-minutes N] [--expect-daemon running|parked]");
  if (!Number.isFinite(options.idleSeconds) || options.idleSeconds < 0) throw new Error("--idle-seconds must be a number ≥ 0");
  if (options.workload === "chatting") options.idleMinutes ??= 0;
  // A park phase waits past the idle limit; cold/synthetic phases never start the daemon at all.
  options.expectDaemon ??= "parked";
  if (!["running", "parked"].includes(options.expectDaemon)) throw new Error("--expect-daemon must be running or parked");
  return options;
}

/** Desktop workload state is prepared by the operator; site lifecycle flags do not apply. */
function checkDesktopOptions({ options }) {
  if (!options.attach || !["idle-after-use", "chatting"].includes(options.workload)) throw new Error("desktop usage: --mode desktop --attach <manifest.json> --workload idle-after-use|chatting");
  if (options.site || options.idleMinutes !== null || options.expectDaemon !== null) throw new Error("desktop mode accepts only attach and workload options");
  return options;
}

/** Site-mode adapter over the same bounded OS reader as desktop mode. */
async function footprintBytes({ pid }) {
  const sample = await sampleProcessPrivateMemory({ pids: [pid] });
  return sample.readings[0]?.bytes ?? null;
}

/** Every live process in `rootPid`'s tree; Jini owns traversal and bounded OS enumeration. */
async function listTree({ rootPid }) {
  const rows = (await listProcessSnapshots({}, { commandLines: false })).map((row) => ({ ...row, name: path.basename(row.command) }));
  const inTree = new Set(collectProcessTreePids(rows, [rootPid]));
  return rows.filter((row) => inTree.has(row.pid));
}

/** "server" for the root, "daemon" for the agent daemon entry, else the executable name. */
function roleOf({ pid, rootPid, name }) {
  if (pid === rootPid) return "server";
  try {
    const args = execFileSync("ps", ["-o", "args=", "-p", String(pid)], { encoding: "utf8" });
    return /agent-daemon-server\.(ts|js)/.test(args) ? "daemon" : name;
  } catch { return name; }
}

/** The server's tree with each process's role: the real `listProcesses` port of `measureTree`. */
async function listProcesses({ rootPid }) {
  return (await listTree({ rootPid })).map((row) => ({ pid: row.pid, name: row.name, role: roleOf({ ...row, rootPid }) }));
}

function listeningPorts({ pid }) {
  try {
    return execFileSync("lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-Fn"], { encoding: "utf8" })
      .split("\n").filter((line) => line.startsWith("n")).map((line) => Number(line.slice(line.lastIndexOf(":") + 1)));
  } catch { return []; }
}

/** The process's inspector WebSocket URL: the one listening port that answers `/json/list`. */
async function inspectorUrl({ pid }) {
  for (const port of listeningPorts({ pid })) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1_000) });
      const [target] = await response.json();
      if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    } catch { /* not the inspector port */ }
  }
  return null;
}

/** Minimal Chrome DevTools Protocol client over the global WebSocket (Node ≥ 22). */
async function openCdp({ url }) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error(`inspector ${url} refused`)); });
  const pending = new Map();
  const listeners = new Set();
  let nextId = 0;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.id === undefined) { for (const listener of listeners) listener(message); return; }
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (message) => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)));
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { send, listeners, close: () => socket.close() };
}

async function memoryUsage({ cdp }) {
  const { result } = await cdp.send("Runtime.evaluate", { expression: "JSON.stringify(process.memoryUsage())", returnByValue: true });
  const usage = JSON.parse(result.value);
  return { rss: toMb(usage.rss), heapTotal: toMb(usage.heapTotal), heapUsed: toMb(usage.heapUsed), external: toMb(usage.external) };
}

/** Loaded `file:` scripts: `Debugger.enable` replays `scriptParsed` for every script already compiled. */
async function moduleCount({ cdp }) {
  const urls = new Set();
  const listener = (message) => { if (message.method === "Debugger.scriptParsed" && message.params.url.startsWith("file:")) urls.add(message.params.url); };
  cdp.listeners.add(listener);
  await cdp.send("Debugger.enable");
  await cdp.send("Debugger.disable");
  cdp.listeners.delete(listener);
  return urls.size;
}

/** Natural numbers for one process, then a forced GC; the after-GC read happens once all have settled. */
async function measureNatural({ process: proc, ports }) {
  const footprintNatural = toMb(await ports.readFootprint({ pid: proc.pid }));
  const url = await ports.inspectorUrl({ pid: proc.pid });
  if (!url) return { ...proc, cdp: null, footprint: { natural: footprintNatural }, heap: null, modules: null };
  const cdp = await openCdp({ url });
  const natural = await memoryUsage({ cdp });
  const modules = await moduleCount({ cdp });
  await cdp.send("HeapProfiler.collectGarbage");
  return { ...proc, cdp, footprint: { natural: footprintNatural }, heap: { natural }, modules };
}

async function measureAfterGc({ sample, ports }) {
  const { cdp, ...rest } = sample;
  const footprint = { ...rest.footprint, afterGc: toMb(await ports.readFootprint({ pid: rest.pid })) };
  if (!cdp) return { ...rest, footprint };
  const afterGc = await memoryUsage({ cdp });
  cdp.close();
  return { ...rest, heap: { ...rest.heap, afterGc }, footprint };
}

/** Refuse to sample a tree whose server is gone (an empty tree would total zero) or whose daemon state is wrong for the phase. */
function assertSampleable({ processes, rootPid, expectDaemon }) {
  if (!processes.some((proc) => proc.pid === rootPid && proc.role === "server")) throw new Error(`server ${rootPid} is not running; no sample taken`);
  const daemonRunning = processes.some((proc) => proc.role === "daemon");
  if (daemonRunning !== (expectDaemon === "running")) throw new Error(`expected the daemon ${expectDaemon}, but it is ${daemonRunning ? "running" : "absent"}; no sample taken`);
}

const REAL_TREE_PORTS = { listProcesses, readFootprint: footprintBytes, inspectorUrl, sleep };

/**
 * Footprint (and, over the inspector, heap and module count) for every process in the server's tree.
 * Throws before sampling unless the server is alive and the daemon matches `expectDaemon`.
 * Any unreadable footprint is listed in `missing`, makes `complete` false and nulls the totals.
 */
export async function measureTree({ rootPid, expectDaemon }, optional = {}) {
  const ports = { ...REAL_TREE_PORTS, ...optional };
  const processes = await ports.listProcesses({ rootPid });
  assertSampleable({ processes, rootPid, expectDaemon });
  const samples = [];
  for (const proc of processes) samples.push(await measureNatural({ process: proc, ports }));
  await ports.sleep(GC_SETTLE_MS);
  const measured = [];
  for (const sample of samples) measured.push(await measureAfterGc({ sample, ports }));
  const missing = measured.flatMap((row) => ["natural", "afterGc"].filter((key) => row.footprint[key] === null).map((key) => `${row.role} ${row.pid} footprint.${key}`));
  const total = (key) => (missing.length > 0 ? null : Math.round(measured.reduce((sum, row) => sum + row.footprint[key], 0) * 10) / 10);
  return { complete: missing.length === 0, missing, processCount: measured.length, totalFootprint: { natural: total("natural"), afterGc: total("afterGc") }, processes: measured };
}

const validPid = (pid) => Number.isSafeInteger(pid) && pid > 0;
const validBudget = (budget) => Number.isFinite(budget) && budget > 0;

function checkDesktopGroup(group) {
  if (typeof group?.name !== "string" || !group.name.trim()) throw new Error("desktop groups require a name");
  if (!Array.isArray(group.rootPids) || !group.rootPids.length || !group.rootPids.every(validPid)) throw new Error("desktop groups require positive rootPids");
}

/** Validate operator-provided identities; budgets/classification may be absent for a discovery run. */
function checkDesktopManifest({ groups, processes, workload }) {
  if (!["idle-after-use", "chatting"].includes(workload)) throw new Error("desktop workload must be idle-after-use or chatting");
  if (!Array.isArray(groups) || !groups.length) throw new Error("desktop groups must contain app/site roots");
  groups.forEach(checkDesktopGroup);
  if (!Array.isArray(processes) || !processes.every((row) => validPid(row?.pid))) throw new Error("desktop processes require positive PIDs");
  if (new Set(processes.map((row) => row.pid)).size !== processes.length) throw new Error("duplicate desktop PID metadata");
}

function desktopBudget({ family, budgetMiB }) {
  if (family === "warm-slim-daemon") return Math.min(budgetMiB ?? 80, 80);
  return budgetMiB;
}

/** Attach-only row: never infer an identity or turn RSS into the primary memory reading. */
function desktopRow({ pid, snapshots, usage, metadata, memberships, readings }) {
  const { family = null, budgetMiB = null } = metadata.get(pid) ?? {};
  const { ppid = null, command = "" } = snapshots.get(pid) ?? {};
  const { name = command, rssBytes = null } = usage.get(pid) ?? {};
  const bytes = readings.get(pid);
  return { pid, ppid, name, family,
    groups: memberships.filter((group) => group.pids.has(pid)).map((group) => group.name),
    primaryBytes: Number.isFinite(bytes) && bytes >= 0 ? bytes : null, rssBytes,
    budgetMiB: desktopBudget({ family, budgetMiB }),
  };
}

/** Null aggregate budgets/readings when a member is unavailable; planning targets are never gates. */
function desktopFamilyBudgets({ processes }) {
  const families = new Map();
  for (const row of processes) {
    const family = families.get(row.family) ?? { family: row.family, budgetMiB: 0, primaryBytes: 0 };
    family.budgetMiB = validBudget(row.budgetMiB) && family.budgetMiB !== null ? family.budgetMiB + row.budgetMiB : null;
    family.primaryBytes = row.primaryBytes !== null && family.primaryBytes !== null ? family.primaryBytes + row.primaryBytes : null;
    families.set(row.family, family);
  }
  return [...families.values()];
}

/**
 * Sample the union of app/site trees and explicitly identified detached PIDs. Unknown descendants,
 * absent expected PIDs, missing budgets and unreadable primary data make complete=false and total=null.
 * A second identity snapshot rejects churn during sampling. Ports only enumerate and sample;
 * this path owns no target lifecycle, inspector or GC connection.
 * @example await measureDesktop({ ...manifest, workload: "chatting" })
 * @complexity Bounded identity/usage snapshots plus one private-memory sample; tree traversal is delegated
 * to Jini for each group and the union. Sequential footprint probes are capped at 512 unique PIDs.
 */
export async function measureDesktop(input, optional = {}) {
  checkDesktopManifest(input);
  const ports = { listSnapshots: listProcessSnapshots, listUsage: listProcessUsage, sampleMemory: sampleProcessPrivateMemory, platform: process.platform, ...optional };
  const identities = await ports.listSnapshots({ platform: ports.platform }, { commandLines: false });
  const usages = await ports.listUsage({ platform: ports.platform });
  const metadata = new Map(input.processes.map((row) => [row.pid, row]));
  const roots = [...input.groups.flatMap((group) => group.rootPids), ...metadata.keys()];
  const pids = collectProcessTreePids(identities, roots);
  const sample = await ports.sampleMemory({ pids, platform: ports.platform });
  const after = await ports.listSnapshots({ platform: ports.platform }, { commandLines: false });
  const allIdentities = [...identities, ...after];
  const memberships = input.groups.map((group) => ({ name: group.name, pids: new Set(collectProcessTreePids(allIdentities, group.rootPids)) }));
  const allPids = [...new Set([...pids, ...collectProcessTreePids(after, roots)])];
  const liveBefore = new Set(identities.map((row) => row.pid));
  const liveAfter = new Set(after.map((row) => row.pid));
  const usage = new Map(usages.map((row) => [row.pid, row]));
  const snapshots = new Map(allIdentities.map((row) => [row.pid, row]));
  const readings = new Map(sample.readings.map((row) => [row.pid, row.bytes]));
  const processes = allPids.map((pid) => desktopRow({ pid, snapshots, usage, metadata, memberships, readings }));
  const missing = processes.flatMap((row) => {
    const reasons = [];
    if (!liveBefore.has(row.pid) || !liveAfter.has(row.pid)) reasons.push(`${row.pid} not in both live snapshots`);
    if (row.primaryBytes === null) reasons.push(`${row.pid} ${sample.metric} unreadable`);
    if (typeof row.family !== "string" || !row.family.trim() || !validBudget(row.budgetMiB)) reasons.push(`${row.pid} family/budget unavailable`);
    return reasons;
  });
  return { mode: "desktop", workload: input.workload, metric: sample.metric, complete: missing.length === 0, missing,
    duplicatePidCount: processes.length - new Set(processes.map((row) => row.pid)).size, processCount: processes.length,
    totalPrimaryBytes: missing.length ? null : processes.reduce((sum, row) => sum + row.primaryBytes, 0), processes,
    withinBudgets: missing.length ? null : processes.every((row) => row.primaryBytes <= row.budgetMiB * MB),
    budgets: { families: desktopFamilyBudgets({ processes }) },
    gatesMiB: { warmSlimDaemon: 80 }, planningTargetsMiB: { sharedElectron: [600, 900], server: [180, 300], guest: [250, 450] } };
}

/** Dispatch before entering the site lifecycle; attach cannot reach copy/build/GC/cleanup code. */
export async function runMeasurement({ options }, optional = {}) {
  const ports = { measureSite, measureDesktop, readManifest: ({ file }) => JSON.parse(fs.readFileSync(file, "utf8")), ...optional };
  if (options.mode === "desktop") return ports.measureDesktop({ ...ports.readManifest({ file: options.attach }), workload: options.workload });
  return ports.measureSite(options);
}

function walkFiles({ dir }, { skipDir = () => false } = {}) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return skipDir(entry.name) ? [] : walkFiles({ dir: full }, { skipDir });
    return entry.isFile() ? [full] : [];
  });
}

/** Copy a site without opening its SQLite files for writing: `.backup` each one, copy the rest. */
function copySite({ site, into }) {
  fs.cpSync(site, into, { recursive: true, filter: (source) => {
    const stat = fs.lstatSync(source);
    if (stat.isSocket() || stat.isFIFO()) return false;
    return path.basename(source) !== ".agent-runtime" && !SQLITE_FILE.test(source) && !SQLITE_SIDECAR.test(source);
  } });
  for (const source of walkFiles({ dir: site }, { skipDir: (name) => name === ".agent-runtime" }).filter((file) => SQLITE_FILE.test(file))) {
    const target = path.join(into, path.relative(site, source));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    execFileSync("sqlite3", [source, `.backup '${target.replaceAll("'", "''")}'`]);
  }
}

/**
 * Per-file esbuild transpile of `apps/website/src` into `<into>/dist`, laid out like `npm run build`'s
 * dist (`dist/src`, `dist/package.json`, `dist/content`) so path lookups relative to compiled files hold.
 * @returns the compiled CLI entry.
 */
async function compileServer({ into }) {
  const { build } = await import(pathToFileURL(repoRequire.resolve("esbuild")).href);
  const files = walkFiles({ dir: WEBSITE_SRC }, { skipDir: (name) => name === "__tests__" }).filter((file) => !file.endsWith(".test.ts"));
  const outSrc = path.join(into, "dist/src");
  await build({ entryPoints: files.filter((file) => file.endsWith(".ts")), outdir: outSrc, outbase: WEBSITE_SRC,
    format: "esm", platform: "node", target: "es2022", bundle: false, sourcemap: false, logLevel: "error" });
  for (const file of files.filter((entry) => !entry.endsWith(".ts"))) {
    fs.mkdirSync(path.dirname(path.join(outSrc, path.relative(WEBSITE_SRC, file))), { recursive: true });
    fs.copyFileSync(file, path.join(outSrc, path.relative(WEBSITE_SRC, file)));
  }
  const rootPackage = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const { rootDir } = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tsconfig.json"), "utf8")).compilerOptions;
  fs.writeFileSync(path.join(into, "dist/package.json"), JSON.stringify({ private: true, type: rootPackage.type, imports: deriveDistImports(rootPackage.imports, rootDir) }));
  fs.symlinkSync(path.join(REPO_ROOT, "content"), path.join(into, "dist/content"));
  fs.symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(into, "node_modules"));
  fs.symlinkSync(path.join(REPO_ROOT, "package.json"), path.join(into, "package.json"));
  return path.join(outSrc, "cli/main.js");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer().once("error", reject);
    server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}

/** A minimal environment: nothing inherited but PATH/LANG, so no ambient secret or site selection leaks in. */
function serveEnv({ temp, siteCopy }, { idleMinutes = null } = {}) {
  return {
    PATH: process.env.PATH, LANG: process.env.LANG ?? "en_US.UTF-8", TMPDIR: temp,
    HOME: path.join(temp, "home"), TOVU_DESKTOP_USER_DATA_DIR: path.join(temp, "profile"),
    ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: "--inspect=127.0.0.1:0",
    TOVU_SITE_DIR: siteCopy, TOVU_HOST: "127.0.0.1",
    TOVU_ADMIN_USER: "admin", TOVU_ADMIN_PASSWORD: randomBytes(32).toString("hex"),
    ...(idleMinutes === null ? {} : { TOVU_AGENT_DAEMON_IDLE_MINUTES: String(idleMinutes) }),
  };
}

/**
 * `tovu serve` argv for Electron-as-node. tsx mode imports maps-off AFTER tsx (tsx turns source maps
 * on as it registers), exactly as the dev launchers do, so the harness measures T5's saving.
 * Both preloads are file URLs: a bare `C:\` path is read as a URL scheme on Windows.
 */
export function serverLaunchArgs({ entry, mode, siteCopy, port }, { resolveTsx = () => repoRequire.resolve("tsx") } = {}) {
  const loader = mode === "tsx" ? ["--import", pathToFileURL(resolveTsx()).href, "--import", MAPS_OFF] : [];
  return ["--optimize-for-size", ...loader, entry, "serve", siteCopy, "--port", String(port)];
}

/** Spawn `tovu serve`; `ready` resolves once its boot line is printed. The caller owns stopping `child`. */
function startServer({ entry, mode, env, siteCopy, port, logFile }) {
  const child = spawn(ELECTRON_BIN, serverLaunchArgs({ entry, mode, siteCopy, port }), { cwd: env.HOME, env, stdio: ["ignore", "pipe", "pipe"] });
  const output = fs.createWriteStream(logFile);
  let stdout = "";
  child.stderr.pipe(output);
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no boot line within ${BOOT_TIMEOUT_MS / 1000}s`)), BOOT_TIMEOUT_MS);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited (${code}) before booting`)); });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      output.write(chunk);
      if (BOOT_LINE.test(stdout)) { clearTimeout(timer); resolve(); }
    });
  });
  return { child, ready };
}

function isAlive({ pid }) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** SIGTERM every pid, SIGKILL survivors after 10 s, then report any port still listening. */
async function stopAll({ pids, ports }) {
  for (const pid of pids) { try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ } }
  for (let waited = 0; waited < 10_000 && pids.some((pid) => isAlive({ pid })); waited += 250) await sleep(250);
  for (const pid of pids.filter((pid) => isAlive({ pid }))) { try { process.kill(pid, "SIGKILL"); } catch { /* raced exit */ } }
  await sleep(500);
  const stillListening = ports.filter((port) => {
    try { return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim() !== ""; } catch { return false; }
  });
  return { survivors: pids.filter((pid) => isAlive({ pid })), stillListening };
}

/** Delete the temp dir. Installed agent-plugin packages are read-only (content-addressed), so
 *  directories are made writable first; symlinks (the compiled tree's links into the repo) are not followed. */
function removeTree({ dir }) {
  const unlock = (current) => {
    fs.chmodSync(current, fs.statSync(current).mode | 0o700);
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) if (entry.isDirectory()) unlock(path.join(current, entry.name));
  };
  unlock(dir);
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}

/** Copy the site, build the entry for the mode, and start the server; `started` records its pid and port. */
async function launch({ temp, options, started }) {
  const siteCopy = path.join(temp, "site");
  log(`copying ${options.site}`);
  copySite({ site: options.site, into: siteCopy });
  for (const dir of ["home", "profile"]) fs.mkdirSync(path.join(temp, dir));
  log(options.mode === "compiled" ? "transpiling apps/website/src" : "using tsx");
  const entry = options.mode === "compiled" ? await compileServer({ into: temp }) : path.join(WEBSITE_SRC, "cli/main.ts");
  started.entry = entry;
  const port = await freePort();
  started.ports.add(port);
  const { child, ready } = startServer({ entry, mode: options.mode, env: serveEnv({ temp, siteCopy }, options), siteCopy, port, logFile: path.join(temp, "serve.log") });
  started.root = child.pid;
  started.pids.add(child.pid);
  await ready;
  log(`server pid ${child.pid} on 127.0.0.1:${port}; idling ${options.idleSeconds}s`);
  return child;
}

/** Add every process now in the server's tree, and the ports it listens on, to what must be stopped. */
async function recordTree({ started }) {
  if (started.root === null) return;
  for (const row of await listTree({ rootPid: started.root })) {
    started.pids.add(row.pid);
    for (const port of listeningPorts({ pid: row.pid })) started.ports.add(port);
  }
}

async function cleanUp({ temp, started }) {
  await recordTree({ started });
  const stopped = await stopAll({ pids: [...started.pids], ports: [...started.ports] });
  if (stopped.survivors.length > 0 || stopped.stillListening.length > 0) {
    log(`WARNING: survivors [${stopped.survivors.join(",")}], ports still listening [${stopped.stillListening.join(",")}]`);
  }
  removeTree({ dir: temp });
  log(`stopped ${started.pids.size} process(es), checked ports [${[...started.ports].join(",")}], deleted ${temp}`);
}

/**
 * Executed INSIDE the measured server via the existing inspector, never in the profiler process.
 * Only the daemon is fake: the host finalizer and ledger write a disposable real SQLite database.
 * Helpers stay inside this function so its source can cross the inspector without a new fixture.
 * @complexity O(frames + checkpoint projection work); O(retained run events) in the finalizer.
 */
async function chatTurnInServer({ urls, dbFile }) {
  const { createAssistantRunFinalizer } = await import(urls.finalizer);
  const { createChatRunLedger } = await import(urls.ledger);
  const { openChatDb } = await import(urls.database);
  const db = openChatDb({ filePath: dbFile });
  const ledger = createChatRunLedger({ store: db });
  const runId = "memory-budget-run";
  const encoder = new TextEncoder();
  const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const encode = (kind, payload) => encoder.encode(`event: ${kind}\ndata: ${JSON.stringify({ runId, kind, payload })}\n\n`);
  let checkpoints = 0;
  let writeFailures = 0;
  let timer;
  let samples = 0;
  let peak = { rss: 0, heapUsed: 0 };
  const sample = () => {
    const { rss, heapUsed } = process.memoryUsage();
    peak = { rss: Math.max(peak.rss, rss), heapUsed: Math.max(peak.heapUsed, heapUsed) };
    samples += 1;
    return { rss, heapUsed };
  };
  function seed(messageId) {
    db.prepare("INSERT OR IGNORE INTO ai_chats (id, scope_id, owner_kind, owner_id, created_at, updated_at) VALUES ('memory-budget', 'memory-budget', 'user', 'memory-budget', 0, 0)").run();
    db.prepare("INSERT INTO ai_chat_messages (id, conversation_id, role, content, run_id, run_status, position, created_at) VALUES (?, 'memory-budget', 'assistant', '', ?, 'running', ?, 0)").run(messageId, runId, messageId === "warmup" ? 0 : 1);
  }
  /** Real writes, with counters and natural samples; omit recovery only because no attempt is dispatched. */
  async function run(messageId, daemon) {
    seed(messageId);
    const finalizer = createAssistantRunFinalizer({
      ledger: {
        ...ledger, durable: undefined,
        async checkpoint(progress, optional) {
          try {
            const written = await ledger.checkpoint(progress, optional);
            if (written) checkpoints += 1;
            else writeFailures += 1;
            sample();
            return written;
          } catch (error) { writeFailures += 1; throw error; }
        },
      },
      daemon, reconnectDelayMs: 0,
    }, {});
    finalizer.watch({ principalId: "memory-budget", conversationId: "memory-budget", message: {
      id: messageId, role: "assistant", content: "", runId, runStatus: "running", events: [],
    } });
    await finalizer.idle();
  }
  /** 64 batches: 128 unique 768-byte deltas, then a 16 KiB tool input and result. */
  function payloadAt(index) {
    const batch = Math.floor(index / 130);
    const offset = index % 130;
    const id = `tool-${batch}`;
    if (offset === 128) return { type: "tool_use", id, name: "read_fixture", input: { body: `input-${batch}:`.padEnd(16_384, "i") } };
    if (offset === 129) return { type: "tool_result", toolUseId: id, content: `result-${batch}:`.padEnd(16_384, "r"), isError: false };
    return { type: "text_delta", delta: `batch ${batch}, delta ${offset}: `.padEnd(768, String.fromCharCode(97 + batch % 26)) };
  }
  let connections = 0;
  let emitted = 0;
  let wireBytes = 0;
  const totalFrames = 64 * 130;
  const daemon = {
    runStatus: async () => 200,
    async openEvents() {
      const connection = ++connections;
      let next = 0;
      return new Response(new ReadableStream({
        async pull(controller) {
          if (connection === 1 && next === totalFrames / 2) { controller.close(); return; }
          if (next === totalFrames) { controller.enqueue(encode("end", { status: "succeeded", code: 0 })); controller.close(); return; }
          const replay = next < emitted;
          if (!replay) await pause(1_200_000 / totalFrames);
          // A quiet tool wait must let the existing trailing checkpoint flush naturally.
          if (!replay && next === 48 * 130 + 129) await pause(15_000);
          const frame = encode("agent", payloadAt(next));
          if (!replay) { emitted += 1; wireBytes += frame.byteLength; }
          next += 1;
          controller.enqueue(frame);
        },
      }, { highWaterMark: 0 }), { headers: { "content-type": "text/event-stream" } });
    },
  };
  try {
    await run("warmup", { runStatus: async () => 200, openEvents: async () => new Response(new Blob([
      encode("agent", { type: "text_delta", delta: "warmup" }), encode("end", { status: "succeeded", code: 0 }),
    ])) });
    checkpoints = 0;
    samples = 0;
    peak = { rss: 0, heapUsed: 0 };
    const baseline = sample();
    const startedAt = Date.now();
    timer = setInterval(sample, 250);
    await run("long-turn", daemon);
    const end = sample();
    const saved = db.prepare("SELECT run_status AS status, length(content) AS contentBytes, length(events_json) AS eventsBytes FROM ai_chat_messages WHERE id = 'long-turn'").get();
    const toolResults = db.prepare("SELECT count(*) AS count FROM ai_chat_messages, json_each(events_json) WHERE ai_chat_messages.id = 'long-turn' AND json_extract(json_each.value, '$.kind') = 'tool_result'").get().count;
    const complete = saved.status === "succeeded" && saved.contentBytes >= 6 * 1024 * 1024 && saved.eventsBytes >= 8 * 1024 * 1024
      && toolResults === 64 && connections === 2 && emitted === totalFrames && checkpoints > 1 && writeFailures === 0;
    return { complete, memoryUnit: "bytes", baseline, peak, end, samples, elapsedMs: Date.now() - startedAt, checkpoints, writeFailures,
      connections, emitted, wireBytes, saved, toolResults, execArgv: process.execArgv, runtime: process.version };
  } finally {
    clearInterval(timer);
    db.close();
  }
}

/**
 * Run the turn on the live server and apply natural RSS/heap peak and growth gates, in MiB.
 * Import or inspector errors fail the measurement; they must never become a zero reading.
 * @complexity O(1) profiler memory: only the server's compact summary crosses the inspector.
 */
async function measureChatTurn({ started, temp }) {
  const url = await inspectorUrl({ pid: started.root });
  if (!url) throw new Error("chat-turn workload requires the server inspector");
  const cdp = await openCdp({ url });
  const extension = path.extname(started.entry);
  const moduleUrl = (relative) => new URL(`../${relative}${extension}`, pathToFileURL(started.entry)).href;
  const input = { dbFile: path.join(temp, "chat-workload.db"), urls: {
    finalizer: moduleUrl("server/runtime/composition/modules/assistant-run-finalizer"),
    ledger: moduleUrl("assistant/persistence/run-ledger"), database: moduleUrl("platform/db/sqlite/chat-db"),
  } };
  log("running ~20 minute deterministic chat turn in the server (8 MiB, 64 tools, one reconnect)");
  const progress = setInterval(() => log("chat-turn measurement is still running"), 30_000);
  let timeout;
  try {
    const result = await Promise.race([
      cdp.send("Runtime.evaluate", { expression: `(${chatTurnInServer.toString()})(${JSON.stringify(input)})`, awaitPromise: true, returnByValue: true }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("chat-turn workload exceeded 30 minutes")), 1_800_000); }),
    ]);
    if (result.exceptionDetails) throw new Error(`chat-turn workload failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    const turn = result.result.value;
    const budgetsMiB = { rssPeak: 512, heapPeak: 256, rssGrowth: 256, heapGrowth: 128 };
    const readingsMiB = { rssPeak: turn.peak.rss / MB, heapPeak: turn.peak.heapUsed / MB,
      rssGrowth: (turn.peak.rss - turn.baseline.rss) / MB, heapGrowth: (turn.peak.heapUsed - turn.baseline.heapUsed) / MB };
    return { ...turn, budgetsMiB, readingsMiB, withinBudgets: Object.entries(budgetsMiB).every(([key, limit]) => readingsMiB[key] <= limit) };
  } finally {
    clearInterval(progress);
    clearTimeout(timeout);
    cdp.close();
  }
}

async function measureSite(options) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-measure-memory-"));
  const started = { root: null, pids: new Set(), ports: new Set() };
  try {
    const child = await launch({ temp, options, started });
    await sleep(options.idleSeconds * 1000);
    const chatTurn = options.workload === "chatting" ? await measureChatTurn({ started, temp }) : undefined;
    await recordTree({ started });
    const result = await measureTree({ rootPid: child.pid, expectDaemon: options.expectDaemon });
    if (chatTurn) return { mode: options.mode, workload: options.workload, idleSeconds: options.idleSeconds, ...result, chatTurn,
      complete: result.complete && chatTurn.complete, missing: [...result.missing, ...(chatTurn.complete ? [] : ["chat turn did not persist all expected progress"])],
      withinBudgets: chatTurn.withinBudgets };
    return { mode: options.mode, idleSeconds: options.idleSeconds, idleMinutes: options.idleMinutes, expectDaemon: options.expectDaemon, ...result };
  } catch (error) {
    // The temp dir (and its log) is deleted below, so show the end of the server log now.
    const logFile = path.join(temp, "serve.log");
    if (fs.existsSync(logFile)) log(`server log tail:\n${fs.readFileSync(logFile, "utf8").slice(-3_000)}`);
    throw error;
  } finally {
    await cleanUp({ temp, started });
  }
}

async function main() {
  const options = parseArgs({ argv: process.argv.slice(2) });
  if (options.mode !== "desktop" && process.platform !== "darwin") {
    console.error("measure-site-memory: macOS only (it reads `footprint` and `lsof`).");
    process.exitCode = 2;
    return;
  }
  const result = await runMeasurement({ options });
  console.log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    console.error(`measure-site-memory: INCOMPLETE: ${result.missing.join(", ")}`);
    process.exitCode = 1;
  }
  if (result.withinBudgets === false) { console.error("measure-site-memory: process budget exceeded"); process.exitCode = 1; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
