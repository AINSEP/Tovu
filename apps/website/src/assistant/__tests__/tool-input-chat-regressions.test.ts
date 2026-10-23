/** @file Real 2026-10-19..21 chat inputs: keep normalization ahead of policy and I/O. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolRegistration } from '@jini-ai/core';
import { deriveContentReadRegistrations } from '../content-read-tool.js';
import { applyBatchInputs, type BatchResult } from '../batch-tool-inputs.js';
import { getThemesAgentToolCatalog } from '../../features/theme/agent-tools.js';
import { buildThemesRegistrations } from '../../features/theme/tool-registrations.js';
import { siteInspectionAgentToolCatalog } from '../../features/site-inspection/agent-tools.js';
import { buildPagesRegistrations } from '../../features/pages/tool-registrations.js';
import { InMemoryPostRepo } from '../../features/post/repo.memory.js';
import { buildFsFilesRegistrations } from '../../features/fs-files/tool-registrations.js';
import { executeRegisteredTool } from './fixtures/execute-registered-tool.js';

/** Only the effect is faked; the descriptor, batch selection and execution gate stay real. */
function recordingRegistration(
  { id, schema, inputs }: { id: string; schema: Readonly<Record<string, unknown>>; inputs: unknown[] }, _options = {},
): ToolRegistration {
  return { descriptor: { id, readOnly: true, inputSchema: schema }, policy: { authorize: () => 'allow' },
    handler: async (ctx) => { inputs.push(ctx.input); return { received: ctx.input }; } };
}

for (const id of ['theme_trash_file', 'fetch_published_page']) {
  test(`chat-input regression: ${id} accepts items through the existing default batch owner`, async () => {
    const catalog = id === 'theme_trash_file' ? getThemesAgentToolCatalog() : siteInspectionAgentToolCatalog;
    const definition = catalog.find(tool => tool.name === id)!;
    const inputs: unknown[] = [];
    const [registration] = applyBatchInputs({ registrations: [recordingRegistration({ id, schema: definition.inputSchema!, inputs })] });
    assert.ok(registration);
    const items = id === 'theme_trash_file'
      ? [{ themeId: 'cinematic-travel', path: 'assets/logo.png' }, { themeId: 'cinematic-travel', path: 'assets/logo@2x.png' }]
      : [{ path: '/about-tay', find: '<section' }, { path: '/services', find: '<section' }];
    const result = await executeRegisteredTool({ registration, input: { items } });
    assert.equal(result.status, 'completed');
    assert.equal((result.output as BatchResult).succeeded, 2);
    assert.deepEqual(inputs, items);
    const invalid = await executeRegisteredTool({ registration, input: { items: [{ ...items[0], invented: 'private-value' }] } });
    assert.equal((invalid.output as BatchResult).failed, 1);
    const failure = (invalid.output as BatchResult).results[0]!;
    assert.equal(failure.ok, false);
    if (failure.ok) assert.fail('the unknown item property must fail');
    assert.match(failure.error, /Unknown input.*invented.*Declared inputs:.*path/);
    assert.equal(inputs.length, 2);
  });
}

test('chat-input regression: menu canonical id and legacy menuId reach the same source selector', async () => {
  const inputs: unknown[] = [];
  const registrations = deriveContentReadRegistrations([
    recordingRegistration({ id: 'menus_get_menu', schema: { type: 'object', additionalProperties: false, required: ['menuId'], properties: { menuId: { type: 'string' } } }, inputs }),
    recordingRegistration({ id: 'menus_list_menus', schema: { type: 'object', additionalProperties: false, properties: {} }, inputs }),
  ]);
  const registration = registrations.find(tool => tool.descriptor.id === 'content_read.menu')!;
  for (const input of [{ id: 'm-1' }, { menuId: 'm-1' }]) {
    assert.equal((await executeRegisteredTool({ registration, input })).status, 'completed');
  }
  assert.deepEqual(inputs, [{ menuId: 'm-1' }, { menuId: 'm-1' }]);
  const unknown = await executeRegisteredTool({ registration, input: { other: 'private-value' } });
  assert.match(unknown.error!, /Unknown input 'other'.*Declared inputs: id/);
  assert.equal(inputs.length, 2);
});

test('chat-input regression: empty theme replacement is valid input but still requires write permission', async () => {
  let authorized = 0;
  const registration = buildThemesRegistrations({ workspaceId: 'ws', themes: [], themesDir: '/unused',
    authorize: async () => { authorized++; return { allowed: false, reason: 'test' }; },
  }).find(tool => tool.descriptor.id === 'theme_edit_file')!;
  for (const newString of ['', ' ']) {
    const result = await executeRegisteredTool({ registration, input: { themeId: 'open-heart', path: 'styles.css', oldString: 'remove', newString } });
    assert.notEqual(result.status, 'completed');
    assert.match(result.error!, /FORBIDDEN|permission|not authorized/i);
    assert.doesNotMatch(result.error!, /newString/);
  }
  assert.equal(authorized, 2);
  for (const input of [
    { themeId: 'open-heart', path: 'styles.css', oldString: 'remove' },
    { themeId: 'open-heart', path: 'styles.css', oldString: 'remove', newString: null },
    { themeId: 'open-heart', path: 'styles.css', oldString: '', newString: '' },
  ]) {
    const result = await executeRegisteredTool({ registration, input });
    assert.equal(result.errorKind, 'validation');
  }
  assert.equal(authorized, 2);
});

test('chat-input regression: media slug is not silently treated as an id or discarded filter', async () => {
  const inputs: unknown[] = [];
  const [registration] = deriveContentReadRegistrations([
    recordingRegistration({ id: 'media_list_assets', schema: { type: 'object', additionalProperties: false, properties: { site: { type: 'string' } } }, inputs }),
  ]);
  assert.ok(registration);
  const result = await executeRegisteredTool({ registration, input: { slug: 'tovu-promo-01' } });
  assert.equal(result.errorKind, 'validation');
  assert.match(result.error!, /Unknown input 'slug'.*Accepted properties:.*site.*id/);
  assert.match(result.error!, /content_read\.media_asset\(\{\}\).*matching slug.*returned assets/);
  assert.deepEqual(inputs, []);
  const listed = await executeRegisteredTool({ registration, input: { site: 'peer' } });
  assert.equal(listed.status, 'completed');
  assert.deepEqual(inputs, [{ site: 'peer' }]);
});

test('chat-input regression: media lookup retains the peer site selector and refuses conflicting aliases', async () => {
  const inputs: unknown[] = [];
  const [registration] = deriveContentReadRegistrations([{
    ...recordingRegistration({ id: 'media_list_assets', schema: { type: 'object', additionalProperties: false, properties: { site: { type: 'string' } } }, inputs }),
    handler: async (ctx) => { inputs.push(ctx.input); return { media: [{ id: 'peer-asset', title: 'Peer photo' }, { id: 'other' }] }; },
  }]);
  assert.ok(registration);
  const selected = await executeRegisteredTool({ registration, input: { id: 'peer-asset', site: 'peer' } });
  assert.equal(selected.status, 'completed');
  assert.deepEqual(selected.output, { media: [{ id: 'peer-asset', title: 'Peer photo' }] });
  assert.deepEqual(inputs, [{ site: 'peer' }], 'only the selector is removed before the original scoped reader');
  const conflicted = await executeRegisteredTool({ registration, input: { id: 'peer-asset', mediaId: 'other', site: 'peer' } });
  assert.equal(conflicted.errorKind, 'validation');
  assert.match(conflicted.error!, /Conflicting inputs/);
  const slug = await executeRegisteredTool({ registration, input: { slug: 'photo', site: 'peer' } });
  assert.match(slug.error!, /Unknown input 'slug'.*Accepted properties:.*site.*id/);
  assert.match(slug.error!, /peer site.*site selector/);
  assert.equal(inputs.length, 1);
});

test('chat-input regression: page slugs require a real id, with the tool properties and a recovery example', async () => {
  let reads = 0;
  const registrations = buildPagesRegistrations({ workspaceId: 'ws', postRepo: new InMemoryPostRepo([]),
    authorize: async () => ({ allowed: true, reason: 'test' }),
    pagesHtmlStore: () => { reads++; throw new Error('no store should open'); },
  });
  for (const registration of registrations) {
    const result = await executeRegisteredTool({ registration, input: { slug: '/' } });
    assert.equal(result.errorKind, 'validation');
    assert.match(result.error!, /Unknown input 'slug'.*Accepted properties:.*id/);
    assert.match(result.error!, /content_read\.content_post.*"kind":"page"/);
    assert.match(result.error!, /"id":"<page id>"/);
  }
  assert.equal(reads, 0);
});

test('chat-input regression: filesystem reads explain unsupported find and listings require an explicit root', async () => {
  let resolutions = 0;
  const registrations = buildFsFilesRegistrations({ workspaceId: 'ws', siteBinding: { dir: '/unused' },
    authorize: async () => ({ allowed: true, reason: 'test' }),
    resolveRoots: () => { resolutions++; throw new Error('no filesystem access expected'); },
  });
  const read = registrations.find(tool => tool.descriptor.id === 'fs_read_file')!;
  const found = await executeRegisteredTool({ registration: read, input: { root: 'repo', path: 'development/docs/themes/themes-guide.md', find: 'post-previews' } });
  assert.equal(found.errorKind, 'validation');
  assert.match(found.error!, /Unknown input 'find'.*Accepted properties: root, path/);
  assert.match(found.error!, /"root":"repo","path":".*"/);
  assert.match(found.error!, /full.*content/);
  for (const registration of registrations) {
    for (const root of [undefined, '', 42]) {
      const result = await executeRegisteredTool({ registration, input: { root } });
      assert.equal(result.errorKind, 'validation');
      assert.match(result.error!, /root.*repo, site, custom/);
      assert.match(result.error!, /"root":"repo"/);
    }
  }
  assert.equal(resolutions, 0);
});
