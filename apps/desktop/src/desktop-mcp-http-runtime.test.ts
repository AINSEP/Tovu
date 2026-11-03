import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopMcpHttpRuntime } from './desktop-mcp-http.ts';

const context = { projectsPath: '/unused/projects.json', revealPath: async () => {} };
const env = { TOVU_DESKTOP_MCP_URL: 'http://127.0.0.1:4100/mcp', TOVU_DESKTOP_MCP_TOKEN: 'a'.repeat(64) };

test('one two and five sites share one main endpoint', async () => {
  for (const sites of [1, 2, 5]) {
    let starts = 0;
    let closes = 0;
    const runtime = createDesktopMcpHttpRuntime({ context, warn: () => {} }, { start: async () => {
      starts++;
      return { url: env.TOVU_DESKTOP_MCP_URL, token: env.TOVU_DESKTOP_MCP_TOKEN, env, close: async () => { closes++; } };
    } });
    const environments = await Promise.all(Array.from({ length: sites }, () => runtime.environment({})));
    assert.equal(starts, 1);
    for (const { TOVU_DESKTOP_MCP_HANDOFF_TOKEN: handoff, ...actual } of environments) {
      assert.match(handoff!, /^[a-f0-9]{64}$/);
      assert.deepEqual(actual, env);
    }
    await runtime.close({});
    assert.equal(closes, 1);
  }
});

test('listener startup repairs automatically without delaying site hosting', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let starts = 0;
  const warnings: string[] = [];
  const runtime = createDesktopMcpHttpRuntime({ context, warn: message => warnings.push(message) }, { start: async () => {
    starts++;
    if (starts === 1) throw new Error('bind failed with private details');
    return { url: env.TOVU_DESKTOP_MCP_URL, token: env.TOVU_DESKTOP_MCP_TOKEN, env, close: async () => {} };
  } });
  t.after(() => runtime.close({}));
  const first = await runtime.environment({});
  assert.equal(first.TOVU_DESKTOP_MCP_URL, undefined);
  assert.match(first.TOVU_DESKTOP_MCP_HANDOFF_TOKEN!, /^[a-f0-9]{64}$/);
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0]!, /private details/);
  t.mock.timers.tick(1000);
  assert.deepEqual(await runtime.environment({}), { ...env, TOVU_DESKTOP_MCP_HANDOFF_TOKEN: first.TOVU_DESKTOP_MCP_HANDOFF_TOKEN });
  assert.equal(starts, 2);
});

test('quit drains an in-flight listener start and cancels retries', async () => {
  let complete!: (value: Awaited<ReturnType<typeof import('./desktop-mcp-http.ts').startDesktopMcpHttp>>) => void;
  let closes = 0;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const runtime = createDesktopMcpHttpRuntime({ context, warn: () => {} }, { start: () => new Promise(resolve => { complete = resolve; entered(); }) });
  const starting = runtime.environment({});
  await started;
  const closing = runtime.close({});
  complete({ url: env.TOVU_DESKTOP_MCP_URL, token: env.TOVU_DESKTOP_MCP_TOKEN, env, close: async () => { closes++; } });
  await Promise.all([starting, closing]);
  assert.equal(closes, 1);
  assert.deepEqual(await runtime.environment({}), {});
});

test('a site spawned during listener failure receives the recovered capability automatically', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let starts = 0;
  const requests: { url: string; body: unknown; token: string | null }[] = [];
  const runtime = createDesktopMcpHttpRuntime({ context, warn: () => {} }, {
    start: async () => {
      if (++starts === 1) throw new Error('bind failed');
      return { url: env.TOVU_DESKTOP_MCP_URL, token: env.TOVU_DESKTOP_MCP_TOKEN, env, close: async () => {} };
    },
    fetch: async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)), token: new Headers(init?.headers).get('authorization') });
      return new Response(null, { status: 204 });
    },
  });
  t.after(() => runtime.close({}));
  const launch = await runtime.environment({});
  assert.ok(launch.TOVU_DESKTOP_MCP_HANDOFF_TOKEN);
  assert.equal(launch.TOVU_DESKTOP_MCP_URL, undefined);
  let exited!: () => void;
  runtime.connectSite({ adminUrl: 'http://127.0.0.1:4102/admin/', onExit: listener => { exited = listener; } });
  t.mock.timers.tick(1000);
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  assert.deepEqual(requests, [{ url: 'http://127.0.0.1:4102/internal/desktop-mcp-capability',
    body: { url: env.TOVU_DESKTOP_MCP_URL, token: env.TOVU_DESKTOP_MCP_TOKEN }, token: `Bearer ${launch.TOVU_DESKTOP_MCP_HANDOFF_TOKEN}` }]);
  exited();
});
