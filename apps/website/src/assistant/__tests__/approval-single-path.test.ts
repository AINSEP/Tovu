import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The database package owns its lifecycle and receives only this host transport, and so does the
// search package (`@jini-ai/search/tools`' approval handler; Tovu passes the card as `askHuman`). Reauth is an
// acknowledgement notice, with no approval or effect; secret forms and choices keep their owners.
const allowedCalls = new Map([
  ['requireHumanConfirm', new Set(['contracts/core/human-confirm.ts', 'assistant/tool-approval-policy.ts', 'features/database-transfer/tool-registrations.ts', 'server/runtime/composition/site-search-tools.ts'])],
  ['buildConfirmationSurface', new Set(['contracts/core/human-confirm.ts', 'assistant/external-mcp-reauth-tool.ts'])],
  ['classifyConfirmationAnswer', new Set(['contracts/core/human-confirm.ts'])],
]);
// Automatic plugin access is a named transport for the shared approval lifecycle. Its checklist
// deliberately uses the common human-only dwell controls; other choice helpers cannot ask approvals.
const namedTransportCalls = new Set([
  'assistant/ask-choice-tool.ts#buildAutomaticPluginAccessSurface: buildConfirmationSurface',
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '__tests__' || entry.name === 'node_modules') return [];
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(entry.name) && !/\.(?:test|d)\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

function enclosingFunction(node: ts.Node): string | undefined {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionLike(parent)) return ts.isFunctionDeclaration(parent) ? parent.name?.text : undefined;
  }
  return undefined;
}

function sourceViolations(relative: string, text: string): string[] {
  const violations: string[] = [];
  const source = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true);
  const inspect = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const called = node.expression.text;
      const allowed = allowedCalls.get(called);
      const namedTransport = namedTransportCalls.has(`${relative}#${enclosingFunction(node)}: ${called}`);
      if (allowed && !allowed.has(relative) && !namedTransport) violations.push(`${relative}: ${called}`);
    }
    ts.forEachChild(node, inspect);
  };
  inspect(source);
  return violations;
}

test('human approval asking stays in the shared owner and its named host transports', () => {
  const violations = sourceFiles(sourceRoot).flatMap(file => sourceViolations(
    path.relative(sourceRoot, file).replaceAll(path.sep, '/'), readFileSync(file, 'utf8'),
  ));
  assert.deepEqual(violations, []);
});

test('the automatic plugin renderer exception does not permit other choice approval calls', () => {
  const relative = 'assistant/ask-choice-tool.ts';
  assert.deepEqual(sourceViolations(relative, 'function buildAutomaticPluginAccessSurface() { return buildConfirmationSurface({}); }'), []);
  for (const source of [
    'function anotherChoice() { return buildConfirmationSurface({}); }',
    'function buildAutomaticPluginAccessSurface() { return requireHumanConfirm({}); }',
    'function buildAutomaticPluginAccessSurface() { return classifyConfirmationAnswer({}); }',
  ]) {
    assert.equal(sourceViolations(relative, source).length, 1);
  }
  assert.equal(sourceViolations('assistant/another-tool.ts', 'function buildAutomaticPluginAccessSurface() { return buildConfirmationSurface({}); }').length, 1);
});
