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
 *   --json         emit machine-readable results
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, basename, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

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
const TIMEOUT = Number(opt('timeout', 120)) * 1000;
const LIMIT = Number(opt('limit', Infinity));
const JSON_OUT = flags.has('--json');

/* ---------- locate the test target ---------- */

function findTest(srcPath) {
  const stem = basename(srcPath, extname(srcPath));
  const dir = dirname(srcPath);
  // Tests may sit beside the file or one/two levels up (src/assistant/__tests__
  // holds the tests for src/assistant/mcp-federation/*).
  const dirs = [dir, dirname(dir), dirname(dirname(dir))];
  const candidates = dirs.flatMap((d) => [join(d, '__tests__'), join(d, '__tests__', 'unit'), join(d, '__tests__', 'integration'), d]);
  const found = [];
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    for (const f of readdirSync(c)) {
      if (!/\.test\.(ts|tsx)$/.test(f)) continue;
      const base = f.replace(/\.test\.(ts|tsx)$/, '');
      // Token overlap, not substring: `adapter.stdio.ts` must match
      // `mcp-federation.stdio-adapter.test.ts`, where the words are reversed.
      const toks = (s) => new Set(s.toLowerCase().split(/[.\-_]/).filter((t) => t.length >= 3 &&
        !['test', 'unit', 'src', 'the', 'index'].includes(t)));
      const st = toks(stem), bt = toks(base);
      if (st.size && [...st].every((t) => bt.has(t))) found.push(join(c, f));
    }
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
function runTests() {
  // Vitest defaults to a worker per core and boots a fresh jsdom in each. A sweep reboots the
  // whole pool once per mutant, so on a wide scope that is dozens of jsdom instances alive at
  // once — enough to exhaust memory on a laptop. One forked worker, no file parallelism.
  const r = isAdmin
    ? spawnSync('npm', ['--prefix', 'apps/admin', 'run', 'test', '--',
        // NOT `--poolOptions.forks.singleFork` — vitest 4 (apps/admin is on 4.1.10) rejects it
        // with `CACError: Unknown option`. `--no-file-parallelism` achieves the same serialisation.
        '--pool=forks', '--no-file-parallelism',
        ...tests.map((t) => t.replace('apps/admin/', ''))],
        { encoding: 'utf8', timeout: TIMEOUT })
    : spawnSync('node', ['--import', 'tsx', '--test', ...tests], { encoding: 'utf8', timeout: TIMEOUT });
  if (r.error && r.error.code === 'ETIMEDOUT') return { pass: false, why: 'timeout' };
  if (r.status === 0) return { pass: true, why: 'pass' };

  // A nonzero exit is NOT automatically proof that a test observed the guard. The mutation may
  // simply not have compiled — the `??`-dropping regex can emit `a ?? new Foo()` -> `a Foo()` —
  // and a transform error exits nonzero exactly like a real assertion failure. Scoring those as
  // "killed" is how a sweep manufactures a clean result. Separate them.
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const invalid = /SyntaxError|Transform failed|Expected ["']|Unexpected (token|end of)|ERR_[A-Z_]*SYNTAX|esbuild|Parse error|Cannot find (name|module)|TS\d{4}:/i.test(out);
  return { pass: false, why: invalid ? 'invalid-mutant' : 'fail' };
}

/* ---------- generate mutants ---------- */

const GUARDISH = /!|Ref\.current|\b(disposed|mounted|aborted|cancell?ed|stale|pending|inFlight|missing|fresh)\b|===|!==|==|\?/;

function mutants(source) {
  const lines = source.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;

    // 1. neutralise a guard: `if (cond)` -> `if (false)` so the guard never fires
    const ifm = line.match(/^(\s*(?:\}\s*else\s+)?if\s*\()(.+?)(\)\s*(?:\{|return|continue|break|throw|$).*)$/);
    // An `if` that short-circuits IS a guard whatever its condition looks like. Testing the
    // condition's shape instead missed `if (result.allowed) return;` — an inverted-phrasing
    // authorization check with no `!` or comparison in it, i.e. exactly what this hunts.
    const shortCircuits = ifm && /^\)\s*(return|continue|break|throw)/.test(ifm[3]);
    if (ifm && (ALL_IFS || shortCircuits || GUARDISH.test(ifm[2]))) {
      out.push({ line: i + 1, op: 'guard-never-fires', before: trimmed,
        mutate: (ls) => { ls[i] = ifm[1] + 'false' + ifm[3]; } });
    }

    // 2. drop a nullish fallback: `a ?? b` -> `a`
    if (/\?\?/.test(line) && !/\?\?=/.test(line)) {
      out.push({ line: i + 1, op: 'drop-nullish-default', before: trimmed,
        mutate: (ls) => { ls[i] = line.replace(/\s*\?\?\s*(?:\[\]|\{\}|''|""|`.*?`|null|undefined|0|false|true|[\w.]+(?:\([^)]*\))?)/, ''); } });
    }

    // 3. remove optional chaining: `a?.b` -> `a.b` (throwing counts as killed)
    if (OPTIONAL && /\w\?\./.test(line)) {
      out.push({ line: i + 1, op: 'drop-optional-chain', before: trimmed,
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
const all = mutants(original).slice(0, LIMIT);

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
  process.on(sig, () => { restore(); process.exit(130); });
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
if (!base.pass) {
  console.error(`BASELINE FAILS (${base.why}). Fix the suite before sweeping; otherwise every mutant reports killed.`);
  process.exit(4);
}
if (!JSON_OUT) console.log('baseline: green\n');

const results = [];
let survived = 0;
let inconclusive = 0;
try {
  for (const [n, m] of all.entries()) {
    const ls = original.split('\n');
    m.mutate(ls);
    const mutated = ls.join('\n');
    if (mutated === original) { results.push({ ...m, verdict: 'no-op', mutate: undefined }); continue; }
    writeFileSync(SRC, mutated);
    const r = runTests();
    // Three outcomes, not two. INCONCLUSIVE means the run told us nothing about the guard:
    // the mutant did not compile, or the suite hung. Neither is evidence that a test caught it.
    const verdict = r.pass ? 'SURVIVED'
      : r.why === 'invalid-mutant' || r.why === 'timeout' ? 'INCONCLUSIVE'
      : 'killed';
    if (r.pass) survived++;
    if (verdict === 'INCONCLUSIVE') inconclusive++;
    results.push({ line: m.line, op: m.op, before: m.before, verdict, why: r.why });
    if (!JSON_OUT) {
      const tag = { SURVIVED: 'SURVIVED    ', INCONCLUSIVE: 'INCONCLUSIVE', killed: 'killed      ' }[verdict];
      console.log(`[${String(n + 1).padStart(3)}/${all.length}] ${tag} ${SRC}:${m.line}  (${m.op})`);
      if (verdict !== 'killed') console.log(`             ${m.before}  ${verdict === 'INCONCLUSIVE' ? `[${r.why}]` : ''}`);
    }
  }
} finally {
  restore(); // normal path; signals and uncaught throws are covered by the handlers above
}

const noop = results.filter((r) => r.verdict === 'no-op').length;
if (JSON_OUT) {
  console.log(JSON.stringify(
    { file: SRC, tests, total: all.length, survived, inconclusive, noop, results }, null, 2));
} else {
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
