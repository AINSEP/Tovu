/** s5: pages share the post adapter and must reuse its permission and delete handler. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolRegistration } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { deriveTrashItemRegistrations, type TrashItemToolDeps } from '../trash-item-tool.js';
import { executeRegisteredTool } from '../../../assistant/__tests__/fixtures/execute-registered-tool.js';

test('page kind delegates to content_post_delete with the real row kind and canonical post Trash kind', async () => {
  const calls: unknown[] = [];
  const delegate: ToolRegistration = {
    descriptor: { id: 'content_post_delete' },
    handler: async ctx => { calls.push(ctx.input); return { trashed: true }; },
  };
  const deps = { workspaceId: 'ws', registry: new Map(), isTrashableEntityType: (kind: string) => kind === 'post',
    authorize: async ({ permission }: { permission: string }) => { calls.push(permission); return { allowed: true }; },
    postRepo: { findById: async () => ({ kind: 'page' }) },
  } as unknown as TrashItemToolDeps;
  const registration = deriveTrashItemRegistrations({ registrations: [delegate], routeDeps: deps, surfaces: {} as AssistantSurfaceDeps })[0]!;
  const result = await executeRegisteredTool({ registration, input: { kind: 'page', entityId: 'about' } });
  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, ['content.write', { id: 'about', kind: 'page' }]);
  const output = result.output as { entityType: string; via: string; outcome: unknown };
  assert.equal(output.entityType, 'post');
  assert.equal(output.via, 'content_post_delete');
  assert.deepEqual(output.outcome, { trashed: true });
  deps.authorize = async () => ({ allowed: false, reason: 'denied' });
  calls.length = 0;
  assert.equal((await executeRegisteredTool({ registration, input: { entityType: 'page', entityId: 'about' } })).status, 'failed');
  assert.deepEqual(calls, []);
});
