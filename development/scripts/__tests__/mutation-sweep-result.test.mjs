import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyMutationTestResult } from '../mutation-sweep-result.mjs';

// Assertion/runtime failures must count as kills; compile failures prove nothing about guards.
for (const stdout of [
  "expected 'a' to be 'b'",
  'AssertionError: expected "a" to deeply equal "b"',
  "AssertionError: expected 'esbuild' to be 'other'\n    at node_modules/esbuild/lib/main.js:12:3",
  "Error: Cannot find module './runtime-module'",
  'Error: Unexpected token in response',
  'Error: Unexpected end of JSON input',
  "AssertionError: expected 'SyntaxError: Unexpected token' to be 'ok'",
  "AssertionError: expected 'Transform failed' to be 'ok'",
  'AssertionError: expected "Transform failed" to be "ok"',
  "expected 'ERROR: Unexpected' to be 'ok'",
  "expected '/x/a.ts:3:4: ERROR: Unexpected end of file' to be 'ok'",
  "AssertionError: expected '[plugin:vite:esbuild] Transform failed' to be 'ok'",
  "expected 'Failed to parse source for import analysis' to be 'ok'",
  "AssertionError: expected 'RollupError: Parse failure' to be 'ok'",
  "expected 'Error: Parse failure' to be 'ok'",
]) {
  test(`counts runtime failure as killed: ${stdout}`, () => {
    assert.deepEqual(classifyMutationTestResult({ status: 1, stdout }), { pass: false, why: 'fail' });
  });
}

for (const stderr of [
  'ERROR: Expected ";" but found "Foo"',
  "src/file.ts:12:3: ERROR: Expected ';'",
  'SyntaxError: Unexpected token',
  '# SyntaxError: Unexpected end of input',
  'Error [TransformError]: Transform failed with 1 error:',
  'Error: [vite:esbuild] Transform failed with 1 error:\n/x/a.ts:3:4: ERROR: Unexpected "}"',
  'Error: [vite:esbuild] Transform failed with 1 error:',
  '[plugin:vite:esbuild] Transform failed',
  '/x/a.ts:3:4: ERROR: Unexpected "}"',
  '/x/a.ts:3:4: ERROR: Unexpected end of file',
  '/x/a.ts:3:4: ERROR: The symbol "x" has already been declared',
  'Error: Failed to parse source for import analysis because the content contains invalid JS syntax.',
  'RollupError: Parse failure',
  'Error: Parse failure',
  "src/file.ts(12,3): error TS2304: Cannot find name 'Foo'.",
  "error TS2307: Cannot find module './missing' or its corresponding type declarations.",
]) {
  test(`rejects compile failure: ${stderr}`, () => {
    assert.deepEqual(classifyMutationTestResult({ status: 1, stderr }), { pass: false, why: 'invalid-mutant' });
  });
}

test('preserves success and timeout precedence over output classification', () => {
  const stderr = 'SyntaxError: Unexpected token';
  assert.deepEqual(classifyMutationTestResult({ status: 0, stderr }), { pass: true, why: 'pass' });
  assert.deepEqual(classifyMutationTestResult({ status: null, error: { code: 'ETIMEDOUT' }, stderr }),
    { pass: false, why: 'timeout' });
});
