import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../check-feature-ranks.mjs', import.meta.url));

/** Fixture tree: two ranked features, one leaf that imports no feature, one tests-only folder. */
function fixtureTree(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'feature-ranks-'));
  for (const file of ['ranked/a.ts', 'leaf/only.ts', 'tests-only/__tests__/x.test.ts', 'nested/deep/inner/b.ts']) {
    const target = path.join(root, 'features', file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'export {};\n');
  }
  return root;
}

function runCheck(required: { ranks: Record<string, unknown> }, _optional: Record<string, never> = {}) {
  const root = fixtureTree();
  try {
    const table = path.join(root, 'ranks.json');
    writeFileSync(table, JSON.stringify(required.ranks));
    const result = spawnSync(process.execPath, [script, root, table, '--features', 'features'], { encoding: 'utf8' });
    return { status: result.status, problems: result.stderr.split('\n').filter(Boolean).map((line) => line.replace(table, '<table>')), summary: result.stdout.trim() };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('feature rank check passes when every production feature folder has a rank', () => {
  assert.deepEqual(runCheck({ ranks: { ranked: 0, leaf: 0, nested: 1 } }), {
    status: 0,
    problems: [],
    summary: '3 feature folders with production code; 0 problem(s)',
  });
});

test('feature rank check reports a leaf feature with no rank, which an edge rule cannot see', () => {
  assert.deepEqual(runCheck({ ranks: { ranked: 0, nested: 1 } }), {
    status: 1,
    problems: ['unranked feature: leaf (add it to <table>)'],
    summary: '3 feature folders with production code; 1 problem(s)',
  });
});

test('feature rank check reports a rank for a folder that does not exist', () => {
  assert.deepEqual(runCheck({ ranks: { ranked: 0, leaf: 0, nested: 1, gone: 2 } }), {
    status: 1,
    problems: ['stale rank entry: gone (folder does not exist)'],
    summary: '3 feature folders with production code; 1 problem(s)',
  });
});

test('feature rank check reports a rank for a folder that holds only tests', () => {
  assert.deepEqual(runCheck({ ranks: { ranked: 0, leaf: 0, nested: 1, 'tests-only': 0 } }), {
    status: 1,
    problems: ['stale rank entry: tests-only (folder holds no production code)'],
    summary: '3 feature folders with production code; 1 problem(s)',
  });
});

test('feature rank check reports a rank that is not a non-negative integer', () => {
  assert.deepEqual(runCheck({ ranks: { ranked: 0, leaf: 1.5, nested: -1 } }), {
    status: 1,
    problems: [
      'bad rank for leaf: 1.5 (a rank is a non-negative integer)',
      'bad rank for nested: -1 (a rank is a non-negative integer)',
    ],
    summary: '3 feature folders with production code; 2 problem(s)',
  });
});
