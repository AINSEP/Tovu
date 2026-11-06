// Host integration: the contracts prepare build must not require unreleased Jini test APIs.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { ADMIN_FAILURE_VOCABULARY } from '../../../../../../../packages/contracts/src/admin-failure-copy.js';
import { describeRequestFailure } from '@jini-ai/core';

test('every existing admin route family has approved nouns', () => {
  const routes = new URL('../routes/', import.meta.url);
  for (const entry of readdirSync(routes, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('__')) continue;
    assert.ok(Object.hasOwn(ADMIN_FAILURE_VOCABULARY.nouns, entry.name), `Missing route family wording: ${entry.name}`);
  }
});
test('restore phases and publishing execution use their distinct safe actions', () => {
  const describe = (route: string) => describeRequestFailure({ method: 'POST', route, vocabulary: ADMIN_FAILURE_VOCABULARY });
  assert.match(describe('/recovery/restore/plan').message, /preparation/);
  assert.match(describe('/recovery/restore/confirm').message, /confirmation/);
  assert.match(describe('/recovery/restore/execute').action, /recovery status before starting another restore/);
  for (const route of ['/publish-content/import/execute', '/publish-content/peers/:peerId/push/execute', '/publish-content/backstop', '/publish-content/runs/:id/undo-backstop']) {
    assert.match(describe(route).action, /Content may already have changed/);
    assert.match(describe(route).action, /history before/);
  }
});

test('reading publishing history is not described as an uncertain send', () => {
  const wording = describeRequestFailure({ method: 'GET', route: '/publish-content/runs/:id/backstop', vocabulary: ADMIN_FAILURE_VOCABULARY });
  assert.match(wording.message, /could not be loaded/);
  assert.doesNotMatch(wording.action, /Content may already/);
});

test('actual static admin route families have approved nouns, including directory aliases', () => {
  const root = new URL('../', import.meta.url);
  for (const path of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
    if (!path.endsWith('.ts') || path.includes('__tests__') || path.endsWith('.test.ts')) continue;
    const source = readFileSync(new URL(path, root), 'utf8');
    const families = source.matchAll(/\/api\/admin\/v1\/(?:workspaces\/:[^/`"']+\/)?([a-z][a-z0-9-]*)/g);
    for (const match of families) assert.ok(Object.hasOwn(ADMIN_FAILURE_VOCABULARY.nouns, match[1]!), `Missing static route family ${match[1]} in ${path}`);
  }
});

test('nested publishing destinations are named without disclosing their identifiers', () => {
  const wording = describeRequestFailure({ method: 'GET', route: '/workspaces/:workspaceId/publish-content/peers/:peerId', vocabulary: ADMIN_FAILURE_VOCABULARY });
  assert.equal(wording.message, 'The publishing destinations could not be loaded.');
  assert.equal(wording.step, 'Load publishing destinations');
});
