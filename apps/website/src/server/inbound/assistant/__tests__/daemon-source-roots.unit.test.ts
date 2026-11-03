import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { daemonStatements, daemonSource } from './helpers/daemon-source.js';
import { daemonEntrySource } from './helpers/daemon-entry-source.js';

test('daemon attachment and catalog fixtures inspect the site factory while shutdown fixtures inspect the process entry', () => {
  const calls = daemonStatements.filter(ts.isExpressionStatement)
    .map(statement => statement.expression)
    .filter(ts.isCallExpression)
    .map(call => call.expression.getText(daemonSource));
  assert.ok(calls.includes('registerDaemonAttachmentLookup'));
  assert.ok(calls.includes('registerToolCatalogRoutes'));
  assert.ok(daemonEntrySource.statements.some(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'exitDaemon'));
  assert.ok(!daemonStatements.some(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'exitDaemon'));
});
