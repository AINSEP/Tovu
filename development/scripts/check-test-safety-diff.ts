/**
 * check:test-safety — runs the test-safety lint guard (test-safety-eslint.config.mjs) on the diff.
 *
 * Why: a failing `assert.ok` with no message in a tsx-run test can pin a CPU for 20+ minutes (Node
 * synthesizes the message by re-parsing the source) and --test-timeout cannot stop it (open-bugs
 * 10-31). The lint config named the class, but nothing ran it.
 *
 * Rollout without going red on history: only test files this change adds, modifies, renames or
 * copies are checked, and each may not hold MORE message-less assertions than its merge-base copy.
 * Untouched files never fail; a touched file's count can only hold or shrink. No baseline file to
 * drift. Base ref resolution is shared with check:route-coverage-diff (same CI env, same
 * fetch-depth: 0 requirement).
 *
 * Usage: npx tsx development/scripts/check-test-safety-diff.ts [baseRef]
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Linter } from 'eslint';

import { resolveBaseRef } from './check-route-coverage-diff.js';
import config from './test-safety-eslint.config.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RULE_ID = 'no-restricted-syntax';

export interface ChangedFile { path: string; basePath?: string }
export interface Regression { file: string; before: number; after: number }

/** Files outside the config's test roots get only ESLint's "no matching configuration" note (ruleId null), so they count 0. */
export function countUnsafeAsserts({ text, file }: { text: string; file: string }): number {
  const messages = new Linter({ cwd: REPO_ROOT }).verify(text, config, { filename: join(REPO_ROOT, file) });
  return messages.filter(message => message.ruleId === RULE_ID).length;
}

/** Parses `git diff --name-status -M` lines: `A\tnew`, `M\tpath`, `R091\told\tnew`, `C100\tsource\tcopy`. */
export function parseNameStatus(raw: string): ChangedFile[] {
  return raw.split('\n').filter(line => line.trim()).map(line => {
    const [status = '', first = '', second] = line.split('\t');
    if (status.startsWith('A')) return { path: first };
    return second ? { path: second, basePath: first } : { path: first, basePath: first };
  });
}

export function findRegressions({ files, readHead, readBase }: {
  files: ChangedFile[];
  readHead: (path: string) => string;
  readBase: (path: string) => string;
}): Regression[] {
  return files.flatMap(({ path, basePath }) => {
    const after = countUnsafeAsserts({ text: readHead(path), file: path });
    if (after === 0) return [];
    // The base copy is linted under the new path so a rename out of an unlinted folder still counts.
    const before = basePath ? countUnsafeAsserts({ text: readBase(basePath), file: path }) : 0;
    return after > before ? [{ file: path, before, after }] : [];
  });
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function mergeBaseOf(baseRef: string): string {
  try {
    return git(['merge-base', baseRef, 'HEAD']).trim();
  } catch (err) {
    throw new Error(`could not compute merge-base against '${baseRef}' — is it fetched (needs fetch-depth: 0)? (${(err as Error).message})`);
  }
}

function main(): void {
  const baseRef = resolveBaseRef(process.argv);
  const mergeBase = mergeBaseOf(baseRef);
  const files = parseNameStatus(git(['diff', '--name-status', '-M', '--diff-filter=ACMR', mergeBase, 'HEAD', '--', '*.ts']));
  const regressions = findRegressions({
    files,
    readHead: path => git(['show', `HEAD:${path}`]),
    readBase: path => git(['show', `${mergeBase}:${path}`]),
  });
  if (regressions.length === 0) {
    console.log(`check:test-safety — ${files.length} changed .ts file(s) vs ${baseRef}: no new message-less assertions. OK`);
    return;
  }
  console.error(`check:test-safety — FAIL: message-less assertions added (give each assert.ok/assert a message):`);
  for (const { file, before, after } of regressions) console.error(`  - ${file}: ${before} -> ${after}`);
  process.exit(1);
}

// Guarded so the unit test can import the pure functions without running git.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
