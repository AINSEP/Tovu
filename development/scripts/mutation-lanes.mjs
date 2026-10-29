#!/usr/bin/env node
/**
 * mutation-lanes — sweep risk-ordered targets in isolated copies of committed HEAD.
 *
 * Usage (from any directory; the real repo is located from this script):
 *   node development/scripts/mutation-lanes.mjs --targets=<TARGETS.md> --out=<dir>
 *     [--lanes=2] [--limit=15] [--mutant-timeout=180] [--file-timeout=2700]
 *     [--max-load=14] [--done=<results.tsv>]... [--start-row=18]
 *
 * Suitable for nohup: stdin is never used, and every sweep owns a process group.
 * Edit <out>/lanes.target to resize (zero pauses claiming); create <out>/STOP to
 * drain, or put `now` in STOP to SIGKILL running groups. Timeouts and shutdown
 * also SIGKILL groups; completed mutants are recovered from per-row progress JSONL.
 * Resume with the same out directory: completed files in results.tsv are skipped
 * automatically; STOPPED and plain TIMEOUT rows are retried.
 *
 * Discovery, test ordering, JSON parsing and reports are ported from
 * ADS-memory/.local-artifacts/day-runner/mutate-targets.py. Copies replace its
 * real-tree lock and dirty/scope exclusions; the real-home guard is retained.
 */
import {
  appendFileSync, closeSync, cpSync, existsSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, readlinkSync, rmSync, statfsSync, statSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { homedir, loadavg } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// git archive omits gitignored build output that workspace main/exports point at;
// real-tree tests run against these same built outputs.
const BUILD_OUTPUTS = [
  ...readdirSync(join(REPO, 'packages')).map((name) => join('packages', name, 'dist')),
  'apps/site-chat/dist',
];
const MAX_TESTS = 6;
const COLUMNS = ['row', 'file', 'mutants', 'killed', 'survived', 'inconclusive', 'noop', 'secs', 'note', 'tests', 'lane', 'sha'];
const groups = new Set();
const copies = new Set();
const lanes = [];
const sleepers = new Set();
let config;
let queue = [];
let rowsTotal = 0;
let rowsDone = 0;
let survivorsTotal = 0;
let baseHome;
let stopping = false;
let stopNow = false;
let reason = 'completed';
let fatal;
let cleanupPromise;
const startedAt = new Date().toISOString();

/* ---------- arguments and prior-art discovery ---------- */

function parseOptions() {
  const values = { lanes: '2', limit: '15', 'mutant-timeout': '180', 'file-timeout': '2700', 'max-load': '14', 'start-row': '18' };
  const done = [];
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (!match) throw new Error(`Expected --name=value: ${arg}`);
    const [, name, value] = match;
    if (name === 'done') done.push(resolve(value));
    else if (Object.hasOwn(values, name) || ['targets', 'out'].includes(name)) values[name] = value;
    else throw new Error(`Unknown option: --${name}`);
  }
  if (!values.targets || !values.out) throw new Error('Required: --targets=<TARGETS.md> --out=<dir>');
  for (const name of ['lanes', 'limit', 'mutant-timeout', 'file-timeout', 'max-load', 'start-row']) {
    values[name] = positiveNumber({ name, value: values[name] });
  }
  return { ...values, targets: resolve(values.targets), out: resolve(values.out), done };
}

function positiveNumber({ name, value }) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`--${name} must be positive`);
  if (['lanes', 'limit', 'start-row'].includes(name) && !Number.isSafeInteger(number)) throw new Error(`--${name} must be an integer`);
  return number;
}

function targetRows(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^\|\s*(\d+)\s*\|\s*(T\d)\s*\|\s*`([^`]+)`/);
    if (!match) continue;
    const [, number, tier, path] = match;
    if (isAbsolute(path) || normalize(path).startsWith('..')) throw new Error(`Target must stay inside the copy: ${path}`);
    // Only backticked test paths in later cells override discovery; plain importing-test names do not.
    const explicitTests = [...line.split('|').slice(4).join('|').matchAll(/`([^`]+\.test\.(?:ts|tsx|mjs))`/g)]
      .map(([, test]) => test);
    for (const test of explicitTests) {
      if (isAbsolute(test) || normalize(test).startsWith('..')) throw new Error(`Test must stay inside the copy: ${test}`);
    }
    rows.push({ row: Number(number), tier, path, explicitTests });
  }
  return rows;
}

function readResults(path) {
  if (!existsSync(path)) return [];
  const [header, ...lines] = readFileSync(path, 'utf8').trimEnd().split('\n');
  const columns = header.split('\t');
  return lines.filter(Boolean).map((line) => Object.fromEntries(line.split('\t').map((value, i) => [columns[i], value])));
}

function completed(record) {
  return record.mutants !== undefined && record.mutants.trim() !== ''
    && !/ERROR|SKIPPED-|BASELINE-RED|NO-JSON|STOPPED|TIMEOUT(?!-PARTIAL\b)/.test(record.note || '');
}

/** Port the relative-import index once, using tracked tests and real-tree source resolution. */
async function testIndex() {
  const tracked = await command({ cmd: 'git', args: ['ls-files', '-z', '*.test.ts', '*.test.tsx', '*.test.mjs'] });
  const index = new Map();
  for (const test of tracked.stdout.split('\0').filter((p) => p && !p.includes('/node_modules/'))) {
    let text;
    try { text = readFileSync(join(REPO, test), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const specs = text.matchAll(/(?:from|import\(|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g);
    for (const [, spec] of specs) indexImport({ index, test, spec });
  }
  return index;
}

function indexImport({ index, test, spec }) {
  const base = normalize(join(dirname(test), spec));
  const stem = base.replace(/\.(js|mjs|ts|tsx)$/, '');
  const candidates = [base, `${stem}.ts`, `${stem}.tsx`, `${stem}.mjs`, `${stem}/index.ts`, `${stem}/index.tsx`];
  const source = candidates.find((candidate) => isFile(join(REPO, candidate)));
  if (!source) return;
  if (!index.has(source)) index.set(source, []);
  index.get(source).push(test);
}

function isFile(path) {
  try { return statSync(path).isFile(); }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false; throw error; }
}

function testsFor({ path, explicitTests = [], index }) {
  if (explicitTests.length) return explicitTests;
  const stem = basename(path).split('.')[0];
  // Stable sort and insertion-ordered deduplication match the Python runner's ordering.
  return [...new Set(index.get(path) || [])].sort((a, b) =>
    Number(!a.includes(stem)) - Number(!b.includes(stem)) || a.length - b.length).slice(0, MAX_TESTS);
}

/* ---------- subprocess groups and interruptible waits ---------- */

function pause(ms) {
  return new Promise((resolveWait) => {
    const finish = () => { clearTimeout(timer); sleepers.delete(finish); resolveWait(); };
    const timer = setTimeout(finish, ms);
    sleepers.add(finish);
  });
}

function signalGroup(group, signal) {
  try { process.kill(-group.child.pid, signal); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

/** Track helpers as well as sweeps so shutdown also covers an interrupted extraction. */
function launch({ cmd, args, cwd = REPO, env = process.env, stdio = ['ignore', 'pipe', 'pipe'], captureStdout = true, duringCleanup = false }) {
  if (stopNow && !duringCleanup) throw new Error('Runner is stopping immediately');
  const child = spawn(cmd, args, { cwd, env, stdio, detached: true });
  const group = { child, stdout: '', stderr: '', error: null, duringCleanup };
  groups.add(group);
  captureGroupOutput({ child, group, captureStdout });
  group.closed = new Promise((resolveChild) => {
    child.on('error', (error) => { group.error = error; });
    child.on('close', (code, signal) => resolveChild({ code, signal, stdout: group.stdout, stderr: group.stderr, error: group.error }));
  });
  return group;
}

function captureGroupOutput({ child, group, captureStdout }, _options = {}) {
  if (captureStdout) {
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (data) => { group.stdout += data; });
  }
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (data) => { group.stderr += data; });
}

/** Kill the tracked group even if its leader exits while descendants remain alive. */
function stopGroup(group) {
  if (group.termination) return group.termination;
  group.termination = (async () => {
    // node --test traps SIGTERM and exits 1, which the synchronous sweep would score as a kill.
    // The lane copy is disposable: prepareFile rewrites the target from git before each file,
    // and the sweep clears its own stale tmpdir lock. Kill helpers the same way.
    if (group.child.pid) signalGroup(group, 'SIGKILL');
    await group.closed;
    groups.delete(group);
  })();
  return group.termination;
}

async function command(input, { allowFailure = false } = {}) {
  const group = launch(input);
  const result = await group.closed;
  await stopGroup(group);
  if (result.error) throw result.error;
  if (result.code !== 0 && !allowFailure) throw new Error(`${input.cmd} ${input.args.join(' ')}: ${result.stderr.trim() || result.signal || result.code}`);
  return result;
}

function requestStop(message, immediate = false) {
  stopping = true;
  reason = message;
  stopNow ||= immediate;
  for (const finish of sleepers) finish();
  if (stopNow) for (const group of groups) {
    if (group.duringCleanup) continue; // repeated signals must not interrupt copy removal
    void stopGroup(group).catch((error) => { fatal ||= error; console.error(error.message); });
  }
}

function fail(error) {
  fatal ||= error;
  requestStop(`error: ${error.message}`, true);
}

/* ---------- isolated committed copies ---------- */

async function removeCopy(repo) {
  rmSync(join(dirname(repo), 'copy.tar'), { force: true });
  if (!existsSync(repo)) return;
  if (!lstatSync(repo).isSymbolicLink()) {
    await command({ cmd: 'chmod', args: ['-R', 'u+w', repo], duringCleanup: true });
  }
  // rm does not follow the dependency symlinks into the real checkout.
  rmSync(repo, { recursive: true, force: true });
}

async function extractCopy({ repo, sha }) {
  await removeCopy(repo);
  if (stopNow) throw new Error('Runner is stopping immediately');
  mkdirSync(repo, { recursive: true });
  const archive = join(dirname(repo), 'copy.tar');
  // bsdtar can exit at end-of-archive before git writes trailing padding, causing EPIPE on a pipe.
  await command({ cmd: 'git', args: ['archive', '--format=tar', '-o', archive, sha] });
  await command({ cmd: 'tar', args: ['-xf', archive, '-C', repo] });
  rmSync(archive, { force: true });
  linkDependencies(repo);
  for (const path of BUILD_OUTPUTS) {
    const source = join(REPO, path);
    const destination = join(repo, path);
    if (existsSync(source) && !existsSync(destination)) cpSync(source, destination, { recursive: true });
  }
}

function linkWorkspaceScope({ real, copy }) {
  mkdirSync(copy, { recursive: true });
  for (const entry of readdirSync(real)) {
    const source = join(real, entry);
    const target = readlinkSync(source);
    if (isAbsolute(target)) throw new Error(`Expected relative @tovu workspace link: ${source}`);
    // A mutated workspace file must be the one the tests import. Preserve each link's own
    // relative target inside the copy rather than resolving it into the real checkout.
    symlinkSync(target, join(copy, entry));
  }
}

function linkDependencies(repo) {
  const real = join(REPO, 'node_modules');
  const copy = join(repo, 'node_modules');
  mkdirSync(copy, { recursive: true });
  for (const entry of readdirSync(real)) {
    if (entry === '@tovu') linkWorkspaceScope({ real: join(real, entry), copy: join(copy, entry) });
    else symlinkSync(join(real, entry), join(copy, entry)); // includes .bin and other dot entries
  }
  for (const app of ['admin', 'desktop', 'site-chat']) {
    const source = join(REPO, 'apps', app, 'node_modules');
    if (!existsSync(source)) continue;
    mkdirSync(join(repo, 'apps', app), { recursive: true });
    symlinkSync(source, join(repo, 'apps', app, 'node_modules'));
  }
}

async function prepareFile({ lane, path }) {
  const sha = (await command({ cmd: 'git', args: ['rev-parse', 'HEAD'] })).stdout.trim();
  if (lane.sha !== sha) {
    await extractCopy({ repo: lane.repo, sha });
    lane.sha = sha;
    writeFileSync(join(lane.dir, 'sha'), `${sha}\n`);
  }
  // A SIGKILLed sweep may leave a mutant in this copy even when HEAD has not changed.
  const source = await command({ cmd: 'git', args: ['show', `${sha}:${path}`] }, { allowFailure: true });
  if (source.code !== 0) return false;
  const destination = join(lane.repo, path);
  // Refuse a symlink target that could redirect the write into the real checkout.
  const realPath = resolve(lane.repo, path);
  if (!realPath.startsWith(`${lane.repo}/`)) throw new Error(`Unsafe target: ${path}`);
  let parent = destination;
  while (parent !== lane.repo) {
    if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new Error(`Symlink in target path: ${parent}`);
    parent = dirname(parent);
  }
  writeFileSync(destination, source.stdout);
  return true;
}

/* ---------- home guard, load/disk gates and operator controls ---------- */

function listing(path) {
  try { return readdirSync(path).filter((name) => !name.startsWith('.')).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

function homeSnap() {
  const home = homedir();
  const sites = join(home, 'Library/Application Support/Tovu/sites.json');
  let names = [];
  if (existsSync(sites)) names = JSON.parse(readFileSync(sites, 'utf8')).entries.map((site) => site.name ?? '?').sort();
  // Site NAMES, not the file hash: the owner's running desktop app rewrites sites.json (status,
  // timestamps) on its own, which is not a test leak.
  return { names, keys: listing(join(home, '.tovu/site-keys')).length, documents: listing(join(home, 'Documents/Tovu')) };
}

function checkHome(row) {
  const after = homeSnap();
  if (JSON.stringify(after) === JSON.stringify(baseHome)) return;
  const running = lanes.filter((lane) => lane.state === 'running').map(({ index, row, path, sha }) => ({ index, row, path, sha }));
  writeFileSync(join(config.out, 'ALERT-HOME'), JSON.stringify({ row, before: baseHome, after, running }, null, 2));
  writeFileSync(join(config.out, 'STOP'), 'now\n');
  requestStop('real home changed', true);
}

function laneTarget() {
  const value = readFileSync(join(config.out, 'lanes.target'), 'utf8').trim();
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('lanes.target must contain a nonnegative integer');
  return Number(value);
}

function checkStop() {
  const path = join(config.out, 'STOP');
  if (!existsSync(path)) return;
  const now = readFileSync(path, 'utf8').trim() === 'now';
  if (!stopping || (now && !stopNow)) requestStop(now ? 'STOP now' : 'STOP', now);
}

function diskAvailable() {
  const stats = statfsSync(config.out, { bigint: true });
  const free = stats.bavail * stats.bsize;
  if (free >= 20n * 1024n ** 3n) return true;
  writeFileSync(join(config.out, 'ALERT-DISK'), `${new Date().toISOString()} free=${free} bytes; minimum=20 GiB\n`);
  requestStop('disk space below 20 GiB');
  return false;
}

function gated({ lane, state, message }) {
  lane.state = state;
  if (Date.now() - lane.lastGateLog < 60_000) return;
  lane.lastGateLog = Date.now();
  console.log(`lane ${lane.index}: ${message}`);
  writeStatus();
}

async function claim(lane) {
  while (!stopping && queue.length) {
    checkStop();
    if (stopping) break;
    if (lane.index >= laneTarget()) {
      gated({ lane, state: 'idle', message: 'waiting for lanes.target' });
      await pause(60_000);
      continue;
    }
    const load = loadavg()[0];
    if (load > config['max-load']) {
      gated({ lane, state: 'gated', message: `load ${load.toFixed(2)} > ${config['max-load']}` });
      await pause(30_000);
      continue;
    }
    if (!diskAvailable()) break;
    // No await between gates and shift: only one lane can claim this row.
    return queue.shift();
  }
  return null;
}

function writeStatus() {
  const status = {
    lanes: lanes.map(({ index, state, row, path, startedAt }) => ({ index, state, row, path, startedAt })),
    rowsDone, rowsTotal, survivorsTotal, startedAt, pid: process.pid,
  };
  writeFileSync(join(config.out, 'lanes-status.json'), `${JSON.stringify(status, null, 2)}\n`);
}

/* ---------- sweep execution and prior-art reports ---------- */

async function runSweep({ lane, row, tests }) {
  const log = join(config.out, 'logs', `${row.row}.log`);
  const err = join(config.out, 'logs', `${row.row}.err`);
  const progress = join(config.out, 'logs', `${row.row}.progress.jsonl`);
  // Baseline can be killed before the sweep loop truncates progress; never recover an older run.
  writeFileSync(progress, '');
  const stdout = openSync(log, 'w');
  const stderr = openSync(err, 'w');
  const env = { ...process.env, TSX_TSCONFIG_PATH: 'apps/site-chat/tsconfig.json', GIT_CEILING_DIRECTORIES: join(config.out, 'lanes') };
  delete env.TOVU_ADMIN_PASSWORD;
  // Lanes must never use the owner's real home; suites missing the isolation import would
  // otherwise be BASELINE-RED and never swept. The helper only redirects HOME/app-data env
  // to a temp dir; it does not change what any test asserts.
  const preload = './apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.ts';
  const preloads = existsSync(join(lane.repo, preload)) ? [`--preload=${preload}`] : [];
  let group;
  try {
    // Use current checkout tooling while source, tests and dependencies resolve inside the lane.
    group = launch({ cmd: process.execPath, args: [join(REPO, 'development/scripts/mutation-sweep.mjs'), row.path, ...tests, ...preloads,
      '--json', '--priority', `--limit=${config.limit}`, `--timeout=${config['mutant-timeout']}`, `--progress=${progress}`],
    cwd: lane.repo, env, stdio: ['ignore', stdout, stderr] });
  } finally { closeSync(stdout); closeSync(stderr); }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void stopGroup(group).catch(fail);
  }, config['file-timeout'] * 1000);
  try {
    const result = await group.closed;
    await stopGroup(group);
    if (result.error) throw result.error;
    const note = timedOut ? 'TIMEOUT' : stopNow ? 'STOPPED' : result.code === 4 ? 'BASELINE-RED' : `rc=${result.code ?? result.signal}`;
    return { note, stdout: readFileSync(log, 'utf8'), progress };
  } finally { clearTimeout(timer); }
}

function parseSweep(stdout) {
  const start = stdout.indexOf('{\n  "file"');
  if (start < 0) return null;
  try {
    const data = JSON.parse(stdout.slice(start));
    return Array.isArray(data.results) ? data : null;
  } catch { return null; }
}

/** Recover completed result lines; a hard kill may leave the last JSONL append incomplete. */
function readProgress({ path }, options = {}) {
  const lines = readFileSync(path, 'utf8').split('\n').slice(0, -1);
  const results = lines.filter(Boolean).map((line) => JSON.parse(line));
  return results.length ? { results, partial: true } : null;
}

function appendFindings({ row, tests, sha, results, verdict, file }) {
  const matches = results.filter((result) => result.verdict === verdict);
  if (!matches.length) return;
  const lines = matches.map((result) => `- line ${result.line} (${result.op}): \`${String(result.before || '').trim().slice(0, 200)}\`\n`);
  appendFileSync(join(config.out, file), `\n## row ${row.row} (${row.tier}) ${row.path} (sha ${sha})\ntests: ${tests.join(' ')}\n${lines.join('')}`);
}

function recordResult({ lane, row, tests, secs, note, data }) {
  const record = { row: row.row, file: row.path, secs, note, tests: tests.join(' '), lane: lane.index, sha: lane.sha || '' };
  if (data) {
    const count = (verdict) => data.results.filter((result) => result.verdict === verdict).length;
    Object.assign(record, { mutants: data.results.length, killed: count('killed'), survived: count('SURVIVED'), inconclusive: count('INCONCLUSIVE'), noop: count('no-op') });
    survivorsTotal += record.survived;
    const findings = { row, tests, sha: lane.sha, results: data.results };
    appendFindings({ ...findings, verdict: 'SURVIVED', file: 'SURVIVORS.md' });
    appendFindings({ ...findings, verdict: 'INCONCLUSIVE', file: 'INCONCLUSIVE.md' });
  }
  const line = `${COLUMNS.map((column) => String(record[column] ?? '').replace(/[\t\r\n]/g, ' ')).join('\t')}\n`;
  // Whole rows are single synchronous appends: async lanes cannot interleave their fields.
  appendFileSync(join(config.out, 'results.tsv'), line);
  appendFileSync(join(lane.dir, 'results.tsv'), line);
  rowsDone++;
  console.log(`lane ${lane.index} row ${row.row} ${row.path}: ${record.mutants ?? '-'} mutants, ${record.survived ?? '-'} survived, ${note} (${secs}s)`);
}

function sweepOutcome({ result }, _options = {}) {
  let note = result.note;
  let data = parseSweep(result.stdout);
  if (!data && (note === 'TIMEOUT' || note === 'STOPPED')) data = readProgress({ path: result.progress });
  if (data?.results.length && note === 'TIMEOUT') note = 'TIMEOUT-PARTIAL';
  if (!data) {
    const tail = result.stdout.trim().split('\n').at(-1) || '';
    note += ` NO-JSON ${tail.slice(0, 120)}`;
  }
  return { note, data };
}

async function sweepRow({ lane, row, index }) {
  const start = Date.now();
  const tests = testsFor({ path: row.path, explicitTests: row.explicitTests, index });
  let note = 'NO-TESTS';
  let data = null;
  writeFileSync(join(config.out, 'logs', `${row.row}.log`), '');
  writeFileSync(join(config.out, 'logs', `${row.row}.err`), '');
  try {
    const present = await prepareFile({ lane, path: row.path });
    if (!present) note = 'MISSING';
    else if (tests.length) {
      const result = await runSweep({ lane, row, tests });
      ({ note, data } = sweepOutcome({ result }));
    }
  } finally {
    // Check even when setup/execution fails; publishing a row must not bypass the guard.
    try { checkHome(row); }
    catch (error) { fail(error); throw error; } // Guard failures are runner failures, not row errors.
  }
  recordResult({ lane, row, tests, secs: Math.floor((Date.now() - start) / 1000), note, data });
}

/* ---------- lanes, status and shutdown ---------- */

function createLane(index) {
  const dir = join(config.out, 'lanes', `lane-${index}`);
  const repo = join(dir, 'repo');
  copies.add(repo);
  mkdirSync(dir, { recursive: true });
  ensureHeader(join(dir, 'results.tsv'));
  return { index, dir, repo, sha: null, state: 'idle', row: null, path: null, startedAt: null, lastGateLog: 0 };
}

async function workLane({ lane, index }) {
  let consecutiveErrors = 0;
  try {
    for (let row = await claim(lane); row; row = await claim(lane)) {
      Object.assign(lane, { state: 'running', row: row.row, path: row.path, startedAt: new Date().toISOString() });
      writeStatus();
      const start = Date.now();
      try {
        await sweepRow({ lane, row, index });
        consecutiveErrors = 0;
      } catch (error) {
        if (stopping) throw error;
        const note = `ERROR ${String(error.message ?? error).slice(0, 120)}`;
        recordResult({ lane, row, tests: testsFor({ path: row.path, explicitTests: row.explicitTests, index }),
          secs: Math.floor((Date.now() - start) / 1000), note, data: null });
        lane.sha = null;
        if (++consecutiveErrors >= 3) throw error;
      }
      Object.assign(lane, { state: 'idle', row: null, path: null, startedAt: null });
      writeStatus();
    }
  } catch (error) { fail(error); }
  finally { lane.state = 'done'; writeStatus(); }
}

function startWorkers({ index, target, tasks }, _options = {}) {
  // Increasing lanes.target can add workers beyond the initial --lanes value.
  while (queue.length && lanes.length < target) {
    const lane = createLane(lanes.length);
    lanes.push(lane);
    tasks.push(workLane({ lane, index }));
  }
}

async function runLanes(index) {
  const tasks = [];
  let lastStatus = 0;
  while (queue.length || lanes.some((lane) => lane.state !== 'done')) {
    checkStop();
    const target = stopping ? 0 : laneTarget();
    startWorkers({ index, target, tasks });
    if (stopping && lanes.every((lane) => lane.state === 'done')) break;
    if (Date.now() - lastStatus >= 60_000) { writeStatus(); lastStatus = Date.now(); }
    await pause(1000);
  }
  await Promise.all(tasks);
  if (fatal) throw fatal;
}

function ensureHeader(path) {
  if (!existsSync(path) || statSync(path).size === 0) writeFileSync(path, `${COLUMNS.join('\t')}\n`);
}

async function initialize() {
  config = parseOptions();
  mkdirSync(join(config.out, 'logs'), { recursive: true });
  mkdirSync(join(config.out, 'lanes'), { recursive: true });
  // Include stale copies from an interrupted earlier run, even if today's lane count shrank.
  for (const entry of readdirSync(join(config.out, 'lanes'))) {
    if (/^lane-\d+$/.test(entry)) copies.add(join(config.out, 'lanes', entry, 'repo'));
  }
  writeFileSync(join(config.out, 'runner.pid'), `${process.pid}\n`);
  writeFileSync(join(config.out, 'lanes.target'), `${config.lanes}\n`);
  ensureHeader(join(config.out, 'results.tsv'));
  baseHome = homeSnap();
  const rows = targetRows(readFileSync(config.targets, 'utf8'));
  const previous = [...config.done, join(config.out, 'results.tsv')].flatMap(readResults).filter(completed);
  const done = new Set(previous.map((record) => record.file));
  rowsTotal = rows.length;
  rowsDone = rows.filter((row) => done.has(row.path)).length;
  survivorsTotal = readResults(join(config.out, 'results.tsv')).reduce((total, record) => total + Number(record.survived || 0), 0);
  const pending = rows.filter((row) => !done.has(row.path));
  queue = [...pending.filter((row) => row.row >= config['start-row']), ...pending.filter((row) => row.row < config['start-row'])];
  writeStatus();
  return testIndex();
}

async function removeCopies({ errors }, _options = {}) {
  for (const repo of copies) {
    try { await removeCopy(repo); }
    catch (error) { errors.push(`${repo}: ${error.message}`); }
  }
}

function cleanup() {
  cleanupPromise ||= (async () => {
    stopping = true;
    stopNow = true; // no worker may launch another child while cleanup drains the tracked groups
    for (const finish of sleepers) finish();
    const errors = [];
    const killed = await Promise.allSettled([...groups].map(stopGroup));
    for (const result of killed) if (result.status === 'rejected') errors.push(result.reason.message);
    await removeCopies({ errors });
    if (config) {
      for (const lane of lanes) lane.state = 'done';
      writeStatus();
      writeFileSync(join(config.out, 'lanes-exit.txt'), `${new Date().toISOString()} ${reason}\n${errors.join('\n')}${errors.length ? '\n' : ''}`);
    }
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  })();
  return cleanupPromise;
}

// Preserve nohup's ignored SIGHUP; installing a handler would re-enable it on shell exit.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => requestStop(signal, true));
}
// An uncaught callback failure may strand an awaited operation; clean up independently of it.
function emergencyExit(error) {
  fail(error);
  void cleanup().finally(() => process.exit(1));
}
process.on('uncaughtException', emergencyExit);
process.on('unhandledRejection', (error) => emergencyExit(error instanceof Error ? error : new Error(String(error))));

try {
  const index = await initialize();
  await runLanes(index);
} catch (error) {
  console.error(error.stack || error);
  if (!stopping) reason = `error: ${error.message}`;
  process.exitCode = 1;
} finally {
  await cleanup();
}
