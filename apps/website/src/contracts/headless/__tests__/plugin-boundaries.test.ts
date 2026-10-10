/** fxpid: contracts must remain reusable without feature, application or server imports. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { readPluginInstallRequest, readPluginInstallArchive } from '../plugin-install-source.js';
import { CHAT_ATTACHMENT_REF_PATTERN } from '../chat-attachment.js';

for (const filename of ['plugin-host.ts', 'plugin-install-source.ts', 'chat-attachment.ts']) {
  test(`fxpid: ${filename} has no imports or re-exports into feature/server/app layers`, async () => {
    const url = new URL(`../${filename}`, import.meta.url);
    const file = fileURLToPath(url);
    const ast = ts.createSourceFile(file, await readFile(url, 'utf8'), ts.ScriptTarget.Latest, true);
    const violations: string[] = [];
    function visit(node: ts.Node): void {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (specifier.startsWith('.') || specifier.startsWith('#src/')) {
          const sourceRoot = path.resolve(path.dirname(file), '../..');
          const target = specifier.startsWith('.') ? path.relative(sourceRoot, path.resolve(path.dirname(file), specifier)) : specifier.slice('#src/'.length);
          if (target.split('/').some(segment => ['features', 'server', 'apps', 'admin', 'desktop', 'site-chat'].includes(segment))) violations.push(specifier);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.deepEqual(violations, []);
  });
}

test('fxpid: moved attachment vocabulary still validates and reads opaque install refs', async () => {
  const ref = 'attachment:12345678';
  assert.equal(CHAT_ATTACHMENT_REF_PATTERN.test(ref), true);
  const request = readPluginInstallRequest({ input: { source: { kind: 'zip', attachmentRef: ref } } });
  assert.deepEqual(request, { kind: 'zip', attachmentRef: ref, replace: false });
  const bytes = Uint8Array.of(1, 2, 3);
  const calls: unknown[] = [];
  assert.deepEqual(await readPluginInstallArchive({ request, ownerId: 'operator', runId: 'run', maxBytes: 3 }, {
    readAttachment: async (input, options) => { calls.push([input, options]); return { ok: true, bytes }; },
  }), bytes);
  assert.deepEqual(calls, [[{ ref, ownerId: 'operator', runId: 'run' }, { maxBytes: 3 }]]);
  assert.throws(() => readPluginInstallRequest({ input: { source: { kind: 'zip', attachmentRef: 'attachment:../12345678' } } }), { message: 'source.attachmentRef must be an attachment:<uuid> ZIP reference.' });
});
