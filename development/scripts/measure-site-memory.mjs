#!/usr/bin/env node
/**
 * @file Measure one idle site's memory: the server, its agent daemon and any helper processes.
 *
 * The before/after harness for the slim-daemon plan (ADR-070,
 * `ADS-memory/.local-artifacts/handoffs/2026-10-26-memory-savings-plan.md` §6). It repeats the
 * baseline's method (`2026-10-26-memory-baseline.md`) so every phase is measured the same way:
 *
 *   node development/scripts/measure-site-memory.mjs --site <dir> --mode compiled|tsx
 *     [--idle-seconds 240] [--idle-minutes N] [--expect-daemon running|parked]
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
 *    and the daemon is in the phase's expected state (`--expect-daemon`; default `parked` when the
 *    idle wait outlasts `--idle-minutes`, else `running`). A process whose `footprint` cannot be read
 *    makes the result `complete: false` with null totals and exit code 1; it never counts as zero.
 *    Every node child inherits
 *    `NODE_OPTIONS=--inspect=127.0.0.1:0`; its inspector port is found with `lsof`.
 * 6. Kills every process it started by pid, checks their ports are closed, deletes the temp dir.
 *
 * Prints one JSON object on stdout (MB values); progress goes to stderr. macOS only.
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

/** `--site <dir> --mode compiled|tsx [--idle-seconds N] [--idle-minutes N] [--expect-daemon running|parked]` → options. */
export function parseArgs({ argv }, _options = {}) {
  const options = { site: null, mode: null, idleSeconds: 240, idleMinutes: null, expectDaemon: null };
  const flags = { "--site": (v) => { options.site = path.resolve(v); }, "--mode": (v) => { options.mode = v; },
    "--idle-seconds": (v) => { options.idleSeconds = Number(v); }, "--idle-minutes": (v) => { options.idleMinutes = Number(v); },
    "--expect-daemon": (v) => { options.expectDaemon = v; } };
  for (let i = 0; i < argv.length; i += 2) {
    const apply = flags[argv[i]];
    if (!apply || argv[i + 1] === undefined) throw new Error(`unknown option or missing value: ${argv[i]}`);
    apply(argv[i + 1]);
  }
  return checkOptions({ options });
}

/** Validate parsed options and fill `expectDaemon`'s default. */
function checkOptions({ options }) {
  if (!options.site || !["compiled", "tsx"].includes(options.mode)) throw new Error("usage: --site <dir> --mode compiled|tsx [--idle-seconds N] [--idle-minutes N] [--expect-daemon running|parked]");
  if (!Number.isFinite(options.idleSeconds) || options.idleSeconds < 0) throw new Error("--idle-seconds must be a number ≥ 0");
  // A park phase waits past the idle limit, so the daemon should have exited by the time we sample.
  options.expectDaemon ??= options.idleMinutes > 0 && options.idleSeconds > options.idleMinutes * 60 ? "parked" : "running";
  if (!["running", "parked"].includes(options.expectDaemon)) throw new Error("--expect-daemon must be running or parked");
  return options;
}

/** `footprint -p` → bytes, or `null` when the process is gone. Parses "Footprint: 187 MB". */
export function parseFootprint({ text }, _options = {}) {
  const match = /Footprint:\s+([\d.]+)\s+(B|KB|MB|GB)\b/.exec(text);
  if (!match) return null;
  return Number(match[1]) * { B: 1, KB: 1024, MB, GB: 1024 * MB }[match[2]];
}

function footprintBytes({ pid }) {
  try { return parseFootprint({ text: execFileSync("footprint", ["-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) }); } catch { return null; }
}

/** Every live process in `rootPid`'s tree (pid, ppid, executable name). `ps` argv only, never env. */
function listTree({ rootPid }) {
  const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,comm="], { encoding: "utf8" }).split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
    .map(([, pid, ppid, comm]) => ({ pid: Number(pid), ppid: Number(ppid), name: path.basename(comm) }));
  const inTree = new Set([rootPid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const row of rows) if (!inTree.has(row.pid) && inTree.has(row.ppid)) { inTree.add(row.pid); grew = true; }
  }
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
function listProcesses({ rootPid }) {
  return listTree({ rootPid }).map((row) => ({ pid: row.pid, name: row.name, role: roleOf({ ...row, rootPid }) }));
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
  const footprintNatural = toMb(ports.readFootprint({ pid: proc.pid }));
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
  const footprint = { ...rest.footprint, afterGc: toMb(ports.readFootprint({ pid: rest.pid })) };
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
  const processes = ports.listProcesses({ rootPid });
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
    TOVU_AGENT_DAEMON_TOKEN: randomBytes(32).toString("hex"),
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
  return [...loader, entry, "serve", siteCopy, "--port", String(port)];
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
function recordTree({ started }) {
  if (started.root === null) return;
  for (const row of listTree({ rootPid: started.root })) {
    started.pids.add(row.pid);
    for (const port of listeningPorts({ pid: row.pid })) started.ports.add(port);
  }
}

async function cleanUp({ temp, started }) {
  recordTree({ started });
  const stopped = await stopAll({ pids: [...started.pids], ports: [...started.ports] });
  if (stopped.survivors.length > 0 || stopped.stillListening.length > 0) {
    log(`WARNING: survivors [${stopped.survivors.join(",")}], ports still listening [${stopped.stillListening.join(",")}]`);
  }
  removeTree({ dir: temp });
  log(`stopped ${started.pids.size} process(es), checked ports [${[...started.ports].join(",")}], deleted ${temp}`);
}

async function measureSite(options) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-measure-memory-"));
  const started = { root: null, pids: new Set(), ports: new Set() };
  try {
    const child = await launch({ temp, options, started });
    await sleep(options.idleSeconds * 1000);
    recordTree({ started });
    const result = await measureTree({ rootPid: child.pid, expectDaemon: options.expectDaemon });
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
  if (process.platform !== "darwin") {
    console.error("measure-site-memory: macOS only (it reads `footprint` and `lsof`).");
    process.exitCode = 2;
    return;
  }
  const options = parseArgs({ argv: process.argv.slice(2) });
  const result = await measureSite(options);
  console.log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    console.error(`measure-site-memory: INCOMPLETE, footprint unreadable for ${result.missing.join(", ")}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
