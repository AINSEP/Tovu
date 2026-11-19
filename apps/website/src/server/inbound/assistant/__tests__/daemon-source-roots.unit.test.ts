import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { daemonStatements, daemonSource, daemonManifest, daemonInitializer, daemonFunction, statementsFor, evaluateDaemonExpression, evaluateDaemonStatements } from './helpers/daemon-source.js';
import { daemonEntrySource } from './helpers/daemon-entry-source.js';

test('daemon attachment and catalog fixtures inspect the site factory while shutdown fixtures inspect the process entry', () => {
  const calls = daemonStatements.filter(ts.isExpressionStatement)
    .map(statement => statement.expression)
    .filter(ts.isCallExpression)
    .map(call => call.expression.getText(daemonSource));
  assert.ok(calls.includes('registerDaemonAttachmentLookup'));
  assert.ok(calls.includes('mountJiniRoutes'));
  assert.ok(daemonEntrySource.statements.some(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'exitDaemon'));
  assert.ok(!daemonStatements.some(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'exitDaemon'));
});

test('manifest reads foreign nodes with their own source and ignores nested decoys', async () => {
  const file = ts.createSourceFile('second.ts', `const foreignValue = "foreign";
function foreignFunction() { return "second file"; }
if (false) { const nestedValue = "decoy"; function nestedFunction() {} }`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  daemonManifest.set('second.ts', new Map([['<file>', [...file.statements]]]));
  try {
    assert.equal(evaluateDaemonExpression(daemonInitializer('foreignValue'), {}), 'foreign');
    assert.equal(evaluateDaemonExpression<() => string>(daemonFunction('foreignFunction'), {})(), 'second file');
    assert.equal(await evaluateDaemonStatements(statementsFor('second.ts', '<file>'), {}, 'foreignValue'), 'foreign');
    assert.throws(() => daemonInitializer('nestedValue'), /found 0/);
    assert.throws(() => daemonFunction('nestedFunction'), /found 0/);
    assert.throws(() => statementsFor('second.ts', 'missing'), /No manifest body/);
  } finally { daemonManifest.delete('second.ts'); }
});

test('manifest rejects duplicate names at lookup while unrelated lookups remain usable', () => {
  const file = ts.createSourceFile('duplicate.ts', `const onStarted = 1; function scopeConfiguration() {}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  daemonManifest.set('duplicate.ts', new Map([['<file>', [...file.statements]]]));
  try {
    assert.ok(daemonInitializer('eventLog'));
    assert.throws(() => daemonInitializer('onStarted'), /found 2/);
    assert.throws(() => daemonFunction('scopeConfiguration'), /found 2/);
    assert.throws(() => daemonFunction('missingFunction'), /found 0/);
  } finally { daemonManifest.delete('duplicate.ts'); }
});
