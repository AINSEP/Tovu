import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../check-no-linked-jini.mjs', import.meta.url));
for (const kind of ['file', 'linked', 'registry'] as const) test(`release guard ${kind === 'registry' ? 'accepts' : 'rejects'} ${kind} dependencies`, () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'front-release-'));
  try {
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ dependencies: { '@jini-ai/chat': kind === 'file' ? 'file:../chat' : '^0.5.7' } }));
    const scope = path.join(directory, 'node_modules', '@jini-ai');
    mkdirSync(scope, { recursive: true });
    if (kind === 'linked') symlinkSync(directory, path.join(scope, 'chat'));
    else mkdirSync(path.join(scope, 'chat'));
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, kind === 'registry' ? 0 : 1);
    if (kind === 'file') assert.match(result.stderr, /file: dependencies cannot ship/);
    if (kind === 'linked') assert.match(result.stderr, /npm-linked/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
