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
    for (const actual of environments) assert.deepEqual(actual, env);
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
  assert.deepEqual(await runtime.environment({}), {});
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0]!, /private details/);
  t.mock.timers.tick(1000);
  assert.deepEqual(await runtime.environment({}), env);
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
