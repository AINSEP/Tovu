#!/usr/bin/env node
/**
 * mutation-sweep — decide whether a guard is load-bearing or carried on faith.
 *
 * The rule this enforces:
 *   A guard is justified by a test that fails without it, or it comes out.
 *
 * How it works: for each guard site in a source file, neutralise that one guard
 * (make its condition constantly false, drop the `??` fallback, ...), run the
 * scoped test suite, and restore. A mutant that SURVIVES means no test noticed
 * the guard was gone — it is dead code or untested. Either way it is unproven.
 *
 * Usage:
 *   node scripts/mutation-sweep.mjs <source-file> [test-target] [options]
 *
 *   node scripts/mutation-sweep.mjs src/assistant/mcp-federation/adapter.stdio.ts
 *   node scripts/mutation-sweep.mjs apps/admin/src/hooks/use-assistant-chats.hooks.ts --all-ifs
 *
 * If <test-target> is omitted the co-located `__tests__` file matching the
 * source basename is used. Runner is chosen by path: apps/admin -> vitest,
 * everything else -> node:test (this repo runs both).
 *
 * Options:
 *   --all-ifs      mutate every `if`, not just ones that look like guards
 *   --optional     also mutate `a?.b` -> `a.b` (a crash counts as killed)
 *   --timeout=<s>  per-mutant timeout, default 120
 *   --limit=<n>    stop after n mutants
 *   --priority     spend a capped run on the riskiest guard sites first
 *   --json         emit machine-readable results
 *   --progress=<path>  append each result as JSONL (truncated when the sweep loop starts)
 *   --preload=<module>  repeatable; node:test only (ignored by vitest), for setup such as test-home isolation
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, basename, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { classifyMutationTestResult } from './mutation-sweep-result.mjs';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));
const opt = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : dflt;
};

const SRC = positional[0];
if (!SRC || !existsSync(SRC)) {
  console.error('usage: node scripts/mutation-sweep.mjs <source-file> [test-target]');
  process.exit(2);
}
const ALL_IFS = flags.has('--all-ifs');
const OPTIONAL = flags.has('--optional');
const PRIORITY = flags.has('--priority');
const TIMEOUT = Number(opt('timeout', 120)) * 1000;
const LIMIT = Number(opt('limit', Infinity));
const JSON_OUT = flags.has('--json');
const PROGRESS = opt('progress', null);
const PRELOADS = argv.filter((a) => a.startsWith('--preload=')).map((a) => a.slice('--preload='.length));

/* ---------- locate the test target ---------- */

function findTest(srcPath) {
  const stem = basename(srcPath, extname(srcPath));
  const dir = dirname(srcPath);
  // Tests may sit beside the file or one/two levels up (src/assistant/__tests__
  // holds the tests for src/assistant/mcp-federation/*).
  const dirs = [dir, dirname(dir), dirname(dirname(dir))];
  const candidates = dirs.flatMap((d) => [join(d, '__tests__'), join(d, '__tests__', 'unit'), join(d, '__tests__', 'integration'), d]);
  return candidates.flatMap((directory) => matchingTests({ directory, stem }));
}

function matchingTests({ directory, stem }, _options = {}) {
  if (!existsSync(directory)) return [];
  const found = [];
  for (const f of readdirSync(directory)) {
    if (!/\.test\.(ts|tsx)$/.test(f)) continue;
    const base = f.replace(/\.test\.(ts|tsx)$/, '');
    // Token overlap, not substring: `adapter.stdio.ts` must match
    // `mcp-federation.stdio-adapter.test.ts`, where the words are reversed.
    const toks = (s) => new Set(s.toLowerCase().split(/[.\-_]/).filter((t) => t.length >= 3 &&
      !['test', 'unit', 'src', 'the', 'index'].includes(t)));
    const st = toks(stem), bt = toks(base);
    if (st.size && [...st].every((t) => bt.has(t))) found.push(join(directory, f));
  }
  return found;
}

const tests = positional.length > 1 ? positional.slice(1) : findTest(SRC);
if (tests.length === 0) {
  console.error(`no test file found for ${SRC} — pass one explicitly.`);
  console.error('A source file with guards and no test is already an answer: every guard in it is unproven.');
  process.exit(3);
}

const isAdmin = SRC.startsWith('apps/admin');
const vitestPackage = isAdmin ? resolve('apps/admin/node_modules/vitest/package.json') : null;
const vitestBin = isAdmin ? JSON.parse(readFileSync(vitestPackage, 'utf8')).bin : null;
const vitestCLI = isAdmin ? resolve(dirname(vitestPackage), typeof vitestBin === 'string' ? vitestBin : vitestBin.vitest) : null;
function runTests() {
  // Vitest defaults to a worker per core and boots a fresh jsdom in each. A sweep reboots the
  // whole pool once per mutant, so on a wide scope that is dozens of jsdom instances alive at
  // once — enough to exhaust memory on a laptop. One forked worker, no file parallelism.
  const r = isAdmin
    // spawnSync's timeout kills only its direct child. Through npm, vitest's grandchild kept
    // the pipe open and a "120 s" mutant ran for many minutes. Run the CLI directly instead.
    ? spawnSync(process.execPath, [vitestCLI, 'run',
        // NOT `--poolOptions.forks.singleFork` — vitest 4 (apps/admin is on 4.1.10) rejects it
        // with `CACError: Unknown option`. `--no-file-parallelism` achieves the same serialisation.
        '--pool=forks', '--no-file-parallelism', '--maxWorkers=1',
        ...tests.map((t) => t.replace('apps/admin/', ''))],
        { cwd: 'apps/admin', encoding: 'utf8', timeout: TIMEOUT })
    // Match npm test's module mocks support; one test worker bounds each lane's resource use.
    : spawnSync(process.execPath, ['--import', 'tsx', ...PRELOADS.flatMap((module) => ['--import', module]), '--test', '--test-concurrency=1',
        '--experimental-test-module-mocks', ...tests], { encoding: 'utf8', timeout: TIMEOUT });
  const tail = `${r.stdout || ''}${r.stderr || ''}`.trimEnd().split('\n').slice(-60).join('\n');
  // A signal killing the test child is not evidence a test caught the mutant.
  // The synchronous loop must notice the interruption itself.
  const interrupted = Boolean(r.signal) && r.error?.code !== 'ETIMEDOUT';
  return { ...classifyMutationTestResult(r), tail, interrupted };
}

/* ---------- generate mutants ---------- */

const GUARDISH = /!|Ref\.current|\b(disposed|mounted|aborted|cancell?ed|stale|pending|inFlight|missing|fresh)\b|===|!==|==|\?/;

function addGuardMutant({ line, i, trimmed, out }, _options = {}) {
  // 1. neutralise a guard: `if (cond)` -> `if (false)` so the guard never fires
  const ifm = line.match(/^(\s*(?:\}\s*else\s+)?if\s*\()(.+?)(\)\s*(?:\{|return|continue|break|throw|$).*)$/);
  // An `if` that short-circuits IS a guard whatever its condition looks like. Testing the
  // condition's shape instead missed `if (result.allowed) return;` — an inverted-phrasing
  // authorization check with no `!` or comparison in it, i.e. exactly what this hunts.
  const shortCircuits = ifm && /^\)\s*(return|continue|break|throw)/.test(ifm[3]);
  if (ifm && (ALL_IFS || shortCircuits || GUARDISH.test(ifm[2]))) {
    out.push({ line: i + 1, op: 'guard-never-fires', before: trimmed, priority: shortCircuits ? 0 : 1,
      mutate: (ls) => { ls[i] = ifm[1] + 'false' + ifm[3]; } });
  }
}

function addNullishMutant({ line, i, trimmed, out }, _options = {}) {
  // 2. drop a nullish fallback: `a ?? b` -> `a`
  if (/\?\?/.test(line) && !/\?\?=/.test(line)) {
    const fallback = line.slice(line.indexOf('??') + 2);
    const bareLiteral = /^\s*(?:\[\]|\{\}|''|""|``|null|undefined|0|false|true)\s*(?:\/\*.*?\*\/\s*)*(?=$|[;,)\]}]|\/\/)/.test(fallback);
    out.push({ line: i + 1, op: 'drop-nullish-default', before: trimmed, priority: bareLiteral ? 3 : 2,
      mutate: (ls) => { ls[i] = line.replace(/\s*\?\?\s*(?:\[\]|\{\}|''|""|`.*?`|null|undefined|0|false|true|[\w.]+(?:\([^)]*\))?)/, ''); } });
  }
}

function mutants(source) {
  const lines = source.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;

    addGuardMutant({ line, i, trimmed, out });
    addNullishMutant({ line, i, trimmed, out });

    // 3. remove optional chaining: `a?.b` -> `a.b` (throwing counts as killed)
    if (OPTIONAL && /\w\?\./.test(line)) {
      out.push({ line: i + 1, op: 'drop-optional-chain', before: trimmed, priority: 4,
        mutate: (ls) => { ls[i] = line.replace(/(\w)\?\./g, '$1.'); } });
    }
  });
  return out;
}

/* ---------- sweep ---------- */

// Refuse to start on a file git already reports as dirty. Two reasons, both load-bearing:
// a concurrent sweep on the same file would have each process restore from its own idea of
// "the original", and — worse — starting on an ALREADY-mutated file makes the mutant the
// baseline, so the final restore writes the mutation back permanently. Both have happened.
const dirty = spawnSync('git', ['diff', '--quiet', '--', SRC], { encoding: 'utf8' });
if (dirty.status === 1) {
  console.error(`REFUSING TO SWEEP: ${SRC} has uncommitted changes.`);
  console.error('Either another sweep is mid-mutant on it, or it holds work that would become');
  console.error('the restore baseline. Commit/stash it, or wait for the other sweep to finish.');
  process.exit(5);
}

// The git check above cannot detect a CONCURRENT sweep: the other process restores the file
// between mutants, so it reads clean at almost any given instant. Only an exclusive lock is
// sound. Kept in tmpdir rather than beside the source so it can never be committed.
const LOCK = join(tmpdir(), `mutation-sweep-${resolve(SRC).replace(/[^\w]/g, '_')}.lock`);
if (existsSync(LOCK)) {
  const holder = Number(readFileSync(LOCK, 'utf8'));
  let alive = false;
  try { process.kill(holder, 0); alive = true; } catch { alive = false; }
  if (alive) {
    console.error(`REFUSING TO SWEEP: another sweep (pid ${holder}) already holds ${SRC}.`);
    console.error('Two sweeps on one file each restore from their own baseline and corrupt it.');
    process.exit(6);
  }
  unlinkSync(LOCK); // stale lock from a hard-killed run
}
writeFileSync(LOCK, String(process.pid));

const original = readFileSync(SRC, 'utf8');
const generated = mutants(original);
if (PRIORITY) generated.sort((a, b) => a.priority - b.priority); // stable: retain source order within each class
const all = generated.slice(0, LIMIT);

const results = [];
let survived = 0;
let inconclusive = 0;
let sweepStarted = false;
let interrupted = false;

/** Emit one JSON shape for both completed and interrupted sweeps. */
function printJsonResults({ partial = false }, options = {}) {
  const noop = results.filter((r) => r.verdict === 'no-op').length;
  console.log(JSON.stringify(
    { file: SRC, tests, total: all.length, survived, inconclusive, noop, results,
      ...(partial ? { partial: true } : {}) }, null, 2));
}

// `finally` does NOT run when the process is signalled, and an abandoned sweep leaves the source
// mutated on disk — a real incident this session: an agent was killed mid-mutant and left a
// `?? null` silently dropped from a live write path. Restore on every exit path there is.
let restored = false;
const restore = () => {
  if (restored) return;
  restored = true;
  writeFileSync(SRC, original);
  try { unlinkSync(LOCK); } catch { /* already gone */ }
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    restore();
    if (JSON_OUT && sweepStarted) printJsonResults({ partial: true });
    process.exit(130);
  });
}
process.on('uncaughtException', (err) => { restore(); throw err; });
process.on('exit', restore);

if (!JSON_OUT) {
  console.log(`sweeping ${SRC}`);
  console.log(`tests:   ${tests.join(', ')}`);
  console.log(`runner:  ${isAdmin ? 'vitest' : 'node:test'}`);
  console.log(`mutants: ${all.length}\n`);
}

// Baseline first — a red suite makes every mutant look "killed".
const base = runTests();
if (base.interrupted) {
  console.error('BASELINE INTERRUPTED');
  process.exit(130);
}
if (!base.pass) {
  console.error(`BASELINE FAILS (${base.why}). Fix the suite before sweeping; otherwise every mutant reports killed.`);
  console.error(base.tail);
  process.exit(4);
}
if (!JSON_OUT) console.log('baseline: green\n');

sweepStarted = true;
try {
  if (PROGRESS) writeFileSync(PROGRESS, '');
  for (const [n, m] of all.entries()) {
    const ls = original.split('\n');
    m.mutate(ls);
    const mutated = ls.join('\n');
    if (mutated === original) {
      results.push({ ...m, verdict: 'no-op', mutate: undefined });
      if (PROGRESS) appendFileSync(PROGRESS, `${JSON.stringify(results.at(-1))}\n`);
      continue;
    }
    writeFileSync(SRC, mutated);
    const r = runTests();
    interrupted = r.interrupted;
    const why = interrupted ? 'interrupted' : r.why;
    // Three outcomes, not two. INCONCLUSIVE means the run told us nothing about the guard:
    // the mutant did not compile, the suite hung, or it was interrupted. None proves a test caught it.
    const verdict = interrupted ? 'INCONCLUSIVE'
      : r.pass ? 'SURVIVED'
      : r.why === 'invalid-mutant' || r.why === 'timeout' ? 'INCONCLUSIVE'
      : 'killed';
    if (verdict === 'SURVIVED') survived++;
    if (verdict === 'INCONCLUSIVE') inconclusive++;
    results.push({ line: m.line, op: m.op, before: m.before, verdict, why });
    if (PROGRESS) appendFileSync(PROGRESS, `${JSON.stringify(results.at(-1))}\n`);
    if (!JSON_OUT) {
      const tag = { SURVIVED: 'SURVIVED    ', INCONCLUSIVE: 'INCONCLUSIVE', killed: 'killed      ' }[verdict];
      console.log(`[${String(n + 1).padStart(3)}/${all.length}] ${tag} ${SRC}:${m.line}  (${m.op})`);
      if (verdict !== 'killed') console.log(`             ${m.before}  ${verdict === 'INCONCLUSIVE' ? `[${why}]` : ''}`);
    }
    if (interrupted) break;
  }
} finally {
  restore(); // normal path; signals and uncaught throws are covered by the handlers above
}

if (interrupted) {
  if (JSON_OUT) printJsonResults({ partial: true });
  else console.log('Sweep interrupted.');
  process.exit(130);
}

if (JSON_OUT) {
  printJsonResults({});
} else {
  const noop = results.filter((r) => r.verdict === 'no-op').length;
  const ran = results.filter((r) => r.verdict !== 'no-op').length;
  console.log(`\n${survived}/${ran} SURVIVED — unproven, either dead code or untested.`);
  if (survived) {
    console.log('\nEach survivor is a decision: write the test that fails without it, or delete it.');
    for (const r of results.filter((x) => x.verdict === 'SURVIVED')) console.log(`  ${SRC}:${r.line}  ${r.before}`);
  }
  // Reported loudly and separately: these are NOT kills. Counting them as kills is how a sweep
  // fabricates a clean score, and it is the failure mode an external audit caught here.
  if (inconclusive) {
    console.log(`\n${inconclusive} INCONCLUSIVE — the mutant did not compile, or the suite hung.`);
    console.log('These prove nothing about the guard. Treat them as unswept, not as killed.');
    for (const r of results.filter((x) => x.verdict === 'INCONCLUSIVE')) {
      console.log(`  ${SRC}:${r.line}  [${r.why}]  ${r.before}`);
    }
  }
  if (noop) console.log(`\n${noop} mutant site(s) produced no textual change and were not run.`);
}
process.exit(0);
