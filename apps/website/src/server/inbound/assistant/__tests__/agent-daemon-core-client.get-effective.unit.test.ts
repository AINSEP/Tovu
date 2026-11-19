import assert from 'node:assert/strict';
import test from 'node:test';
import { createDaemonCoreClient } from '../agent-daemon-core-client.js';

// The daemon reads settings through the site's RPC: what crosses the wire must be the setting
// coordinate, never the caller's repo handle or the optional coercers bag.
test('daemon getEffective sends the setting coordinate over the RPC, without the repo', async () => {
  const sent: unknown[] = [];
  const client = createDaemonCoreClient({ baseUrl: 'http://127.0.0.1:1234', token: 'fixture-private-rpc' }, { fetch: async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ value: { value: 'short', sourceLayer: 'user', defVersion: 1 } }), { status: 200 });
  } });
  const coordinate = { namespace: 'core.interface', key: 'replyLength', scopeContext: { workspaceId: 'ws-1', principalId: 'owner' } };
  const read = await client.getEffective({ deps: { repo: {} as never }, ...coordinate });
  assert.deepEqual(read, { value: 'short', sourceLayer: 'user', defVersion: 1 });
  assert.deepEqual(sent, [{ operation: 'getEffective', input: coordinate }]);
});
