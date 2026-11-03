import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('public form uploads use the platform multipart decoder and keep HTTP error mapping in Tovu', () => {
  const source = readFileSync(new URL('../../../apps/website/src/server/inbound/public-http/routes/site/forms-multipart.ts', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('forms-multipart.ts', source, ts.ScriptTarget.Latest, true);
  const imports = tree.statements.flatMap(statement =>
    ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) ? [statement.moduleSpecifier.text] : []);
  assert.ok(imports.includes('@jini-ai/platform/http/multipart'));
  assert.equal(imports.includes('undici'), false);
  assert.match(source, /FORMS_SUBMISSION_VALIDATION_ERROR/);
});
