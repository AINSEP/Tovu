#!/usr/bin/env node
/**
 * @file Opt-in idle-CPU check: launch Tovu, leave it alone, and fail if it keeps burning CPU.
 *
 * Owner request, 2026-09-29, after another Electron app on this Mac was found redrawing constantly
 * while idle. The static half of the guard is `check-idle-motion.ts` (runs in the root suite); this
 * is the live half. It is NOT part of any default suite: it launches a real app and takes ~45s.
 *
 * Two modes:
 *
 *   node development/scripts/measure-idle-cpu.mjs
 *     Launches the desktop app through Playwright's `_electron` driver with a THROWAWAY
 *     `TOVU_DESKTOP_USER_DATA_DIR`, so it never touches the owner's running app or its data
 *     (no single-instance lock; separate userData is what makes a second instance safe). Measures
 *     the Electron process tree: main, GPU, renderer, utility helpers.
 *
 *   node development/scripts/measure-idle-cpu.mjs --admin-url http://127.0.0.1:<port>/admin/
 *     Opens the admin a site server is serving (find the port with
 *     `lsof -nP -iTCP -sTCP:LISTEN | grep -i electron`) in a headless Chromium, signs in
 *     (`TOVU_IDLE_ADMIN_USER`/`TOVU_IDLE_ADMIN_PASSWORD`, default `admin`/`tovu-dev`), optionally
 *     goes to `--path <admin route>`, then measures the Chromium process tree.
 *
 * Options: `--idle <seconds>` (default 30), `--settle <seconds>` (default 10, time after load
 * before measuring), `--max <percent>` (default 3: average CPU of the whole tree, as a percent of
 * one core). Exit code 1 when the average is above `--max`.
 *
 * CPU comes from `ps` cumulative CPU time sampled at the start and end of the idle window, so the
 * number is this app's own time even on a busy machine. The page's main-thread task time over the
 * same window (CDP `Performance.getMetrics` → `TaskDuration`) is printed alongside, because a
 * constant redraw shows up there even when the GPU process is where most of the cost lands.
 *
 * Every browser/Electron instance it opens is closed in a `finally`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { _electron as electron, chromium } from "playwright";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DESKTOP_DIR = path.join(REPO_ROOT, "apps/desktop");
const ELECTRON_BIN = path.join(DESKTOP_DIR, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");

function parseArgs(argv) {
  const options = { idle: 30, settle: 10, max: 3, adminUrl: null, path: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--idle") options.idle = Number(value);
    else if (flag === "--settle") options.settle = Number(value);
    else if (flag === "--max") options.max = Number(value);
    else if (flag === "--admin-url") options.adminUrl = value;
    else if (flag === "--path") options.path = value;
    else throw new Error(`unknown option ${flag}`);
    i += 1;
  }
  return options;
}

/** `ps` TIME ("[[dd-]hh:]mm:ss.ss") → seconds. */
export function parseCpuTime(text) {
  const [days, rest] = text.includes("-") ? text.split("-") : ["0", text];
  return rest.split(":").reduce((total, part) => total * 60 + Number(part), 0) + Number(days) * 86400;
}

/** Every process in `rootPid`'s tree with its name and cumulative CPU seconds. */
function sampleTree(rootPid) {
  const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,time=,comm="], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/))
    .filter(Boolean)
    .map(([, pid, ppid, time, comm]) => ({ pid: Number(pid), ppid: Number(ppid), cpu: parseCpuTime(time), name: path.basename(comm) }));
  const inTree = new Set([rootPid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of rows) {
      if (!inTree.has(row.pid) && inTree.has(row.ppid)) {
        inTree.add(row.pid);
        grew = true;
      }
    }
  }
  return new Map(rows.filter((row) => inTree.has(row.pid)).map((row) => [row.pid, row]));
}

async function taskSeconds(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return metrics.find((m) => m.name === "TaskDuration")?.value ?? 0;
}

async function measure(rootPid, cdp, options) {
  await new Promise((resolve) => setTimeout(resolve, options.settle * 1000));
  const before = sampleTree(rootPid);
  const taskBefore = await taskSeconds(cdp);
  const started = Date.now();
  await new Promise((resolve) => setTimeout(resolve, options.idle * 1000));
  const after = sampleTree(rootPid);
  const taskAfter = await taskSeconds(cdp);
  const wall = (Date.now() - started) / 1000;

  const perProcess = [...after.values()].map((row) => ({
    pid: row.pid,
    name: row.name,
    percent: ((row.cpu - (before.get(row.pid)?.cpu ?? 0)) / wall) * 100,
  }));
  const total = perProcess.reduce((sum, row) => sum + row.percent, 0);
  return { wall, total, perProcess, pageMainThreadPercent: ((taskAfter - taskBefore) / wall) * 100 };
}

async function measureDesktop(options) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-idle-cpu-"));
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: ["."],
    cwd: DESKTOP_DIR,
    env: { ...process.env, TOVU_DESKTOP_USER_DATA_DIR: userData },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("load");
    const cdp = await window.context().newCDPSession(window);
    await cdp.send("Performance.enable");
    return await measure(app.process().pid, cdp, options);
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

async function measureAdmin(options) {
  const server = await chromium.launchServer({ headless: true });
  try {
    const browser = await chromium.connect(server.wsEndpoint());
    const page = await browser.newPage();
    await page.goto(options.adminUrl, { waitUntil: "load" });
    const password = page.locator('input[type="password"]');
    if (await password.count()) {
      await page.locator("form input").first().fill(process.env.TOVU_IDLE_ADMIN_USER ?? "admin");
      await password.fill(process.env.TOVU_IDLE_ADMIN_PASSWORD ?? "tovu-dev");
      await password.press("Enter");
      await page.waitForLoadState("networkidle").catch(() => {});
    }
    if (options.path) await page.goto(new URL(options.path, options.adminUrl).href, { waitUntil: "load" });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    return await measure(server.process().pid, cdp, options);
  } finally {
    await server.close().catch(() => {});
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = options.adminUrl ? `admin at ${options.adminUrl}${options.path ?? ""}` : "desktop app (throwaway userData)";
  console.log(`idle-cpu: ${target}; settle ${options.settle}s, idle ${options.idle}s, max ${options.max}%`);
  const result = options.adminUrl ? await measureAdmin(options) : await measureDesktop(options);
  for (const row of result.perProcess.sort((a, b) => b.percent - a.percent)) {
    console.log(`  ${row.percent.toFixed(2).padStart(6)}%  ${row.pid}  ${row.name}`);
  }
  console.log(`idle-cpu: total ${result.total.toFixed(2)}% of one core over ${result.wall.toFixed(1)}s; page main thread ${result.pageMainThreadPercent.toFixed(2)}%`);
  const pass = result.total <= options.max;
  console.log(pass ? "idle-cpu: PASS" : `idle-cpu: FAIL (above ${options.max}%)`);
  process.exitCode = pass ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
}
