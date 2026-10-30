import assert from 'node:assert/strict';
import test from 'node:test';
import { scanModule, resolveLocalImport, discoverTests } from '../../coverage-changed-discovery.js';

test('scanner preserves typed exports, import equals, named methods and isolated function complexity', () => {
  const result = scanModule({ file: 'sample.ts', source: `
    import type Legacy = require('./type-only');
    import Runtime = require('./runtime');
    export { type Only } from './types';
    export { type Only, value } from './mixed';
    class Example { constructor() {} get value() { return 1; } method(x) { if (x) return 1; return 0; } }
    const nested = () => { const inner = () => { if (true) return 1; return 0; }; return inner(); };
  ` });
  assert.deepEqual(result.imports, ['./runtime', './mixed']);
  assert.deepEqual(result.declaredFunctions, ['constructor', 'value', 'method', 'nested', 'inner']);
  assert.equal(result.complexity, 2);
});

test('wildcard aliases retain suffix matching and first target precedence', () => {
  const files = new Set(['first/widgets.ts', 'second/widgets.ts']);
  const options = { aliases: [{ pattern: '@scope/*/source', targets: ['first/*.ts', 'second/*.ts'] }] };
  assert.equal(resolveLocalImport({ file: 'host.ts', specifier: '@scope/widgets/source', files }, options), 'first/widgets.ts');
  assert.equal(resolveLocalImport({ file: 'host.ts', specifier: '@scope/widgets/other', files }, options), undefined);
});

test('cyclic import discovery terminates and retains report diagnostics and capped selection', () => {
  const sources = {
    'src/a.ts': "import './b.js'",
    'src/b.ts': "import './a.js'",
    'src/__tests__/b.test.ts': "import '../b.js'",
    'src/_tmp-ignored.test.ts': '',
  };
  const modules = new Map(Object.entries(sources).map(([file, source]) => [file, scanModule({ file, source })]));
  const result = discoverTests({ changed: ['src/a.ts'], modules, reported: ['src/_tmp-ignored.test.ts', 'missing.test.ts'] });
  assert.deepEqual(result.tests, ['src/__tests__/b.test.ts']);
  assert.deepEqual(result.importingByFile.get('src/a.ts'), ['src/__tests__/b.test.ts']);
  assert.deepEqual(result.warnings, ['Ignored temporary reported test: src/_tmp-ignored.test.ts']);
  assert.deepEqual(result.errors, ['Reported test is missing from git inventory (tracked + untracked): missing.test.ts']);
});
