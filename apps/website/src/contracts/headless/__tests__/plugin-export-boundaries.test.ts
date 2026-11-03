import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('listing installed plugin components depends on a shared host contract, not another plugin family', () => {
  const source = readFileSync(new URL('../../../features/plugin-runtime/tool-registrations.ts', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('tool-registrations.ts', source, ts.ScriptTarget.Latest, true);
  const crossFamily: string[] = [];
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
      && !statement.moduleSpecifier.text.startsWith('@jini-ai/')
      && statement.moduleSpecifier.text.includes('/agent-plugins/')) crossFamily.push(statement.moduleSpecifier.text);
  }
  assert.deepEqual(crossFamily, []);
});
