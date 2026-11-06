import assert from 'node:assert/strict';
import test from 'node:test';
import { Linter } from 'eslint';
import config from '../../scripts/site-identity-eslint.config.mjs';

const root = '/repo';
const desktop = `${root}/apps/desktop/src/desktop-agent-service.ts`;
const daemon = `${root}/apps/website/src/server/inbound/assistant/agent-daemon-server.ts`;
const lint = (source: string, filename = desktop) => new Linter({ cwd: root }).verify(source, config, { filename });

for (const key of ['workspaceId', 'request.workspaceId', 'request["workspaceId"]']) {
  for (const method of ['set', 'get', 'has', 'delete', 'add']) {
    test(`rejects ${method} keyed by ${key}`, () => {
      const errors = lint(`shared.${method}(${key}, value);`);
      assert.equal(errors.length, 1);
      assert.equal(errors[0]?.ruleId, 'no-restricted-syntax');
    });
  }
}
for (const source of ['const scopes = { [workspaceId]: value };', 'cache[request.workspaceId] = value;',
  'const scopes = new Map([[workspaceId, value]]);', 'const scopes = new Set([request.workspaceId]);']) {
  test(`rejects workspace identity in shared keyed storage: ${source}`, () => {
    assert.ok(lint(source).some(error => error.ruleId === 'no-restricted-syntax'), 'workspace identifiers must be rejected as shared keys');
  });
}
test('catches the original daemon siteId alias for workspaceId', () => {
  assert.equal(lint('scopes.set(siteId, scope);', daemon).length, 1);
});
test('allows site keys and workspace data inside a site', () => {
  assert.deepEqual(lint('scopes.set(scopeKey, { workspaceId }); scopes.get(scopeKey);'), []);
  assert.deepEqual(lint('const workspaceId: string = "workspace-local";'), []);
});
