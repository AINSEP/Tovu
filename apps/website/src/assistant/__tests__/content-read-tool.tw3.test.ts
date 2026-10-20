import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolRegistration, ToolExecutionContext } from '@jini-ai/core';
import { deriveContentReadRegistrations } from '../content-read-tool.js';

function source({ id, result, schema = { type: 'object', properties: {} } }: { id: string; result: unknown; schema?: Record<string, unknown> }, _options = {}): ToolRegistration {
  return { descriptor: { id, description: id, inputSchema: schema }, policy: { authorize: () => 'allow' }, handler: async () => result };
}
function context({ input }: { input: unknown }, _options = {}): ToolExecutionContext {
  return { executionId: 'test', principal: { id: 'reader' }, run: { id: 'run' }, input, signal: new AbortController().signal };
}

test('TW3 content cards preserve single get, single list, list lookup and paired dispatch', async () => {
  const registrations = deriveContentReadRegistrations([
    source({ id: 'comments_get_comment', result: { comment: 'one' } }),
    source({ id: 'comments_list_moderation_queue', result: { comments: ['queued'] } }),
    source({ id: 'backup_list_restore_points', result: { items: [{ id: 'one' }, { id: 'two' }] } }),
    source({ id: 'content_post_get', result: { post: 'one' }, schema: { type: 'object', properties: { id: { type: 'string' }, items: { type: 'array' } } } }),
    source({ id: 'content_post_list', result: { posts: ['all'] } }),
  ]);
  const find = (id: string) => { const registration = registrations.find(item => item.descriptor.id === id); assert.ok(registration); return registration; };
  assert.deepEqual(await find('content_read.comment').handler(context({ input: { commentId: 'one' } })), { comment: 'one' });
  assert.deepEqual(await find('content_read.comment_moderation_queue').handler(context({ input: {} })), { comments: ['queued'] });
  assert.deepEqual(await find('content_read.backup_restore_point').handler(context({ input: {} })), { items: [{ id: 'one' }, { id: 'two' }] });
  const lookup = await find('content_read.backup_restore_point').handler(context({ input: { restorePointId: 'two' } }));
  assert.deepEqual(lookup, { items: [{ id: 'two' }] });
  assert.deepEqual(await find('content_read.content_post').handler(context({ input: { id: 'one' } })), { post: 'one' });
  assert.deepEqual(await find('content_read.content_post').handler(context({ input: { items: [{ id: 'one' }] } })), { post: 'one' });
  assert.deepEqual(await find('content_read.content_post').handler(context({ input: {} })), { posts: ['all'] });
  assert.equal(registrations.length, 4);
});

test('TW3 unavailable paired cards leave the original registration and handler intact', () => {
  const original = source({ id: 'content_post_get', result: { post: 'one' } });
  const registrations = deriveContentReadRegistrations([original]);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0]?.descriptor.id, 'content_post_get');
  assert.equal(registrations[0]?.handler, original.handler);
});

test('TW3 schema-less single readers retain the empty schema fallback', async () => {
  const base = source({ id: 'comments_get_comment', result: 'one' });
  const withoutSchema: ToolRegistration = { ...base, descriptor: { id: base.descriptor.id, description: base.descriptor.description } };
  const [card] = deriveContentReadRegistrations([withoutSchema]);
  assert.ok(card);
  assert.deepEqual(card.descriptor.inputSchema, {});
  assert.equal(await card.handler(context({ input: { commentId: 'one' } })), 'one');
});
