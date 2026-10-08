import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The database package owns its lifecycle and receives only this host transport. Reauth is an
// acknowledgement notice, with no approval or effect; secret forms and choices keep their owners.
const allowedCalls = new Map([
  ['requireHumanConfirm', new Set(['contracts/core/human-confirm.ts', 'assistant/tool-approval-policy.ts', 'features/database-transfer/tool-registrations.ts'])],
  ['buildConfirmationSurface', new Set(['contracts/core/human-confirm.ts', 'assistant/external-mcp-reauth-tool.ts'])],
  ['classifyConfirmationAnswer', new Set(['contracts/core/human-confirm.ts'])],
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '__tests__' || entry.name === 'node_modules') return [];
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(entry.name) && !/\.(?:test|d)\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

test('human approval asking stays in the shared owner and its named host transports', () => {
  const violations: string[] = [];
  for (const file of sourceFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, file).replaceAll(path.sep, '/');
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const inspect = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const allowed = allowedCalls.get(node.expression.text);
        if (allowed && !allowed.has(relative)) violations.push(`${relative}: ${node.expression.text}`);
      }
      ts.forEachChild(node, inspect);
    };
    inspect(source);
  }
  assert.deepEqual(violations, []);
});
