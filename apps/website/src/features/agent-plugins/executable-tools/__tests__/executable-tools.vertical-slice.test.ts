/**
 * @file The ONE vertical-slice proof for executable Agent Plugin tools: a loaded plugin tool is
 * registered under its namespaced id, a write call shows the account and affected resources on the
 * existing confirmation card, and after confirmation the module runs with a host-scoped token,
 * guarded HTTP and the frozen account, returning a result without the token.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootFixture, startConfirmingCall, TOKEN, WORKSPACE, PLUGIN } from './fixtures.js';

test('a confirmed write tool call runs end to end through the registry, approval owner and host capabilities', async () => {
  const fixture = await bootFixture();
  assert.deepEqual(fixture.registered.refusals, []);
  assert.ok(fixture.registry.has({ toolId: 'p_acme_office__append_rows' }));

  const input = { connectionRef: 'conn-1', table: 'Leads', values: ['a', 'b'] };
  const call = await startConfirmingCall(fixture, 'p_acme_office__append_rows', input);
  assert.deepEqual(call.rows.map(([label]) => label), ['Account', 'Affects', 'Connection ref', 'Table', 'Values']);
  assert.deepEqual(call.rows, [['Account', 'alice@acme.test'], ['Affects', 'table Leads'], ['Connection ref', 'conn-1'], ['Table', 'Leads'], ['Values', 'a, b']]);
  assert.equal(fixture.calls.length, 0, 'nothing runs before the human answers');

  call.answer('confirm');
  const result = await call.pending;
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.output, { appended: 2, status: 200 });
  assert.equal(JSON.stringify(result.output).includes(TOKEN), false);
  assert.deepEqual(fixture.tokenRequests, [{ target: { workspaceId: WORKSPACE, pluginId: PLUGIN, connectionRef: 'conn-1' }, expectedAccountId: 'alice' }]);
  assert.equal(fixture.requests[0]?.url, 'https://api.acme.test/tables/append');
});
