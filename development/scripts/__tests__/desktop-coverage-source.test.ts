import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

test('desktop coverage policy can be parsed by the hardwiring gate', () => {
  const fileName = 'coverage-floors.ts';
  const source = readFileSync(new URL('../../../apps/desktop/src/coverage-floors.ts', import.meta.url), 'utf8');
  const { diagnostics = [] } = ts.transpileModule(source, { fileName, reportDiagnostics: true });
  assert.deepEqual(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
});

test('measured desktop main entry is no longer listed as unmeasured', () => {
  const policy = JSON.parse(readFileSync(new URL('../../../apps/desktop/coverage-floors.json', import.meta.url), 'utf8')) as {
    areas: { knownUnmeasured: string[] }[];
  };
  assert.ok(policy.areas.every(area => !area.knownUnmeasured.includes('src/main/index.ts')));
});
