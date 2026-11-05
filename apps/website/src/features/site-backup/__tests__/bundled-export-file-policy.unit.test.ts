import assert from 'node:assert/strict';
import test from 'node:test';
import { createBundledExportFilePolicy } from '../bundled-export-file-policy.js';

test('only selected installed package subpaths can skip scanning; unknown files never read', async () => {
  const reads: string[] = [], resolutions: string[] = [];
  const bytes = Buffer.from('token=opaque-secret-value');
  const policy = createBundledExportFilePolicy({}, {
    selection: new Map([['sample', '@jini-ai/agent-plugins/sample']]),
    resolve: specifier => { resolutions.push(specifier); return '/installed/sample/plugin.json'; },
    readFile: async filename => { reads.push(filename); return bytes; },
  });
  assert.equal(await policy({ path: 'agent-plugins/sample/package/SKILL.md', bytes }), 'skip');
  assert.equal(await policy({ path: 'agent-plugins/sample/package/__tests__/example.ts', bytes }), 'skip');
  assert.equal(await policy({ path: 'agent-plugins/sample/package/__tests__/example.ts', bytes: Buffer.from('token=edited-secret') }), 'scan');
  for (const path of ['agent-plugins/custom/package/__tests__/example.ts', 'agent-plugins/sample/memory/notes/token.txt', 'themes/sample/fixtures/key.txt']) {
    assert.equal(await policy({ path, bytes }), 'scan');
  }
  assert.deepEqual(resolutions, ['@jini-ai/agent-plugins/sample/plugin.json']);
  assert.deepEqual(reads, ['/installed/sample/SKILL.md', '/installed/sample/__tests__/example.ts', '/installed/sample/__tests__/example.ts']);
});

test('resolution and read failures retain files for full scanning', async () => {
  for (const failResolve of [false, true]) {
    let resolutions = 0;
    const policy = createBundledExportFilePolicy({}, {
      selection: new Map([['sample', '@jini-ai/agent-plugins/sample']]),
      resolve: () => { resolutions++; if (failResolve) throw new Error('not installed'); return '/installed/sample/plugin.json'; },
      readFile: async () => { throw new Error('missing'); },
    });
    assert.equal(await policy({ path: 'agent-plugins/sample/package/fixtures/key.txt', bytes: Buffer.from('key') }), 'scan');
    assert.equal(await policy({ path: 'agent-plugins/sample/package/fixtures/other.txt', bytes: Buffer.from('key') }), 'scan');
    assert.equal(resolutions, 1);
  }
});
