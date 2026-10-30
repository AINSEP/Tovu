/** fxpid: contracts must remain reusable without feature, application or server imports. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { readPluginInstallRequest, readPluginInstallArchive } from '../../../features/plugin-runtime/install-source.js';
import { CHAT_ATTACHMENT_REF_PATTERN } from '../index.js';

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

for (const source of [undefined, null, 'zip', []]) {
  test(`install rejects a non-object source: ${JSON.stringify(source)}`, () => {
    assert.throws(() => readPluginInstallRequest({ input: { source } }), { name: 'ToolInputError', message: 'source is required.' });
  });
}

for (const [source, message] of [
  [{ kind: 'tar', path: '/tmp/plugin' }, "source.kind must be 'folder' or 'zip'."],
  [{ kind: 'zip' }, 'Exactly one of source.path/source.attachmentRef is required.'],
  [{ kind: 'zip', path: '/tmp/plugin.zip', attachmentRef: 'attachment:12345678' }, 'Exactly one of source.path/source.attachmentRef is required.'],
  [{ kind: 'folder', attachmentRef: 'attachment:12345678' }, 'source.attachmentRef must be an attachment:<uuid> ZIP reference.'],
  [{ kind: 'zip', attachmentRef: 12345678 }, 'source.attachmentRef must be an attachment:<uuid> ZIP reference.'],
  [{ kind: 'zip', path: 42 }, 'source.path must be an absolute path on the machine Tovu runs on (expand ~ first).'],
  [{ kind: 'zip', path: '~/plugin.zip' }, 'source.path must be an absolute path on the machine Tovu runs on (expand ~ first).'],
] as const) {
  test(`install request refuses ${JSON.stringify(source)}`, () => {
    assert.throws(() => readPluginInstallRequest({ input: { source } }), { name: 'ToolInputError', message });
  });
}

test('install preserves absolute folder and ZIP paths and only accepts boolean replacement', () => {
  for (const kind of ['folder', 'zip'] as const) {
    for (const replace of [true, false, undefined]) {
      assert.deepEqual(readPluginInstallRequest({ input: { source: { kind, path: '/tmp/package' }, replace } }, {}), { kind, path: '/tmp/package', replace: replace === true });
    }
  }
  assert.throws(() => readPluginInstallRequest({ input: { source: { kind: 'zip', path: '/tmp/package' }, replace: 'true' } }), { message: 'replace must be a boolean.' });
});

test('install refuses unavailable attachments without interpreting their refs as disk paths', async () => {
  const required = { request: { kind: 'zip' as const, attachmentRef: 'attachment:12345678', replace: false }, ownerId: 'operator', runId: 'run', maxBytes: 3 };
  const expected = { message: 'Chat ZIP attachment is unavailable or exceeds the 32 MiB upload limit. Use an attachmentRef listed by chat_list_pending_attachments.' };
  await assert.rejects(readPluginInstallArchive(required), expected);
  await assert.rejects(readPluginInstallArchive(required, { readAttachment: async () => ({ ok: false, refusal: 'not-owner' }) }), expected);
  await assert.rejects(readPluginInstallArchive(required, { readAttachment: async () => ({ ok: true, bytes: Uint8Array.of(1, 2, 3, 4) }) }), { message: 'ZIP exceeds the 32 MiB upload limit.' });
});

test('local archive reads accept the byte limit and reject missing and oversized files', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tovu-install-source-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const sourcePath = path.join(dir, 'plugin.zip');
  const required = { request: { kind: 'zip' as const, path: sourcePath, replace: false }, ownerId: 'operator', runId: 'run', maxBytes: 3 };
  await assert.rejects(readPluginInstallArchive(required), { message: `No readable ZIP at ${sourcePath}.` });
  await writeFile(sourcePath, Uint8Array.of(7, 8, 9));
  assert.deepEqual([...await readPluginInstallArchive(required)], [7, 8, 9]);
  await writeFile(sourcePath, Uint8Array.of(7, 8, 9, 10));
  await assert.rejects(readPluginInstallArchive(required), { message: 'ZIP exceeds the 32 MiB upload limit.' });
});

test('local archive reads grown bytes before the final size refusal (reported, not fixed)', async () => {
  const operations: unknown[] = [];
  await assert.rejects(readPluginInstallArchive({ request: { kind: 'zip', path: '/virtual/plugin.zip', replace: false }, ownerId: 'operator', runId: 'run', maxBytes: 3 }, {
    files: {
      stat: async (input) => { operations.push(input); return { size: 3 }; },
      read: async (input) => { operations.push(input); return Uint8Array.of(1, 2, 3, 4); },
    },
  }), { message: 'ZIP exceeds the 32 MiB upload limit.' });
  assert.deepEqual(operations, [{ path: '/virtual/plugin.zip' }, { path: '/virtual/plugin.zip' }]);
});

test('L079: invalid kind precedes source exclusivity and invalid path precedes replacement', () => {
  assert.throws(() => readPluginInstallRequest({ input: { source: { kind: 'tar' }, replace: 'yes' } }), { message: "source.kind must be 'folder' or 'zip'." });
  assert.throws(() => readPluginInstallRequest({ input: { source: { kind: 'zip', path: 'relative' }, replace: 'yes' } }), { message: 'source.path must be an absolute path on the machine Tovu runs on (expand ~ first).' });
});

test('L079: oversized stat prevents allocation and read failures propagate unchanged', async () => {
  const required = { request: { kind: 'zip' as const, path: '/virtual/a.zip', replace: false }, ownerId: 'owner', runId: 'run', maxBytes: 3 };
  await assert.rejects(readPluginInstallArchive(required, { files: {
    stat: async () => ({ size: 4 }), read: async () => { assert.fail('must not allocate'); },
  } }), { message: 'ZIP exceeds the 32 MiB upload limit.' });
  const failure = new Error('read denied');
  await assert.rejects(readPluginInstallArchive(required, { files: {
    stat: async () => ({ size: 3 }), read: async () => { throw failure; },
  } }), error => error === failure);
});
