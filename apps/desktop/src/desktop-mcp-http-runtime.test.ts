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
  const runtime = createDesktopMcpHttpRuntime({ context, warn: ({ message }) => warnings.push(message) }, { start: async () => {
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
  runtime.connectSite({ adminUrl: 'http://127.0.0.1:4102/admin/', onExit: ({ listener }) => { exited = listener; } });
  t.mock.timers.tick(1000);
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  assert.deepEqual(requests, [{ url: 'http://127.0.0.1:4102/internal/desktop-mcp-capability',
    body: { url: env.TOVU_DESKTOP_MCP_URL, token: env.TOVU_DESKTOP_MCP_TOKEN }, token: `Bearer ${launch.TOVU_DESKTOP_MCP_HANDOFF_TOKEN}` }]);
  exited();
});

/** A runtime whose listener is up at once and whose deliveries are recorded instead of sent. */
function deliveryFixture() {
  const posts: { url: string; init: RequestInit }[] = [];
  const warnings: string[] = [];
  const runtime = createDesktopMcpHttpRuntime({ context, warn: ({ message }) => { warnings.push(message); } }, {
    start: async () => ({ url: env.TOVU_DESKTOP_MCP_URL, token: env.TOVU_DESKTOP_MCP_TOKEN, env, close: async () => {} }),
    fetch: async (url, init) => { posts.push({ url: String(url), init: init! }); return new Response(null, { status: 204 }); },
  });
  const settle = async () => { for (let turn = 0; turn < 50; turn++) await new Promise(resolve => setImmediate(resolve)); };
  return { runtime, posts, warnings, settle };
}

test('capability delivery goes only to a loopback admin URL: anything else is refused before any exit hook or request', async t => {
  const { runtime, posts, settle } = deliveryFixture();
  t.after(() => runtime.close({}));
  for (const adminUrl of ['https://example.com/admin/', 'http://192.168.1.10:4102/admin/', 'http://localhost.example.com:4102/admin/']) {
    let hooked = false;
    assert.throws(() => runtime.connectSite({ adminUrl, onExit: () => { hooked = true; } }), adminUrl);
    assert.equal(hooked, false, adminUrl);
  }
  await settle();
  assert.deepEqual(posts, []);
});

test('the handoff POST goes to the fixed internal path, refuses redirects, is cancellable, and carries only the minted bearer', async t => {
  const { runtime, posts, warnings, settle } = deliveryFixture();
  t.after(() => runtime.close({}));
  const launch = await runtime.environment({});
  assert.match(launch.TOVU_DESKTOP_MCP_HANDOFF_TOKEN!, /^[a-f0-9]{64}$/);
  runtime.connectSite({ adminUrl: 'http://127.0.0.1:4102/some/other/path?next=elsewhere', onExit: () => {} });
  await settle();
  assert.equal(posts.length, 1);
  assert.equal(posts[0]!.url, 'http://127.0.0.1:4102/internal/desktop-mcp-capability');
  assert.equal(posts[0]!.init.redirect, 'error');
  assert.equal(posts[0]!.init.method, 'POST');
  assert.ok(posts[0]!.init.signal instanceof AbortSignal);
  assert.equal(new Headers(posts[0]!.init.headers).get('authorization'), `Bearer ${launch.TOVU_DESKTOP_MCP_HANDOFF_TOKEN}`);
  assert.deepEqual(JSON.parse(String(posts[0]!.init.body)), { url: env.TOVU_DESKTOP_MCP_URL, token: env.TOVU_DESKTOP_MCP_TOKEN });
  assert.doesNotMatch(warnings.join('\n'), /[a-f0-9]{64}|127\.0\.0\.1/);
});

test('a site that exits while it is being connected, or connects after quit, gets no delivery', async () => {
  const { runtime, posts, settle } = deliveryFixture();
  runtime.connectSite({ adminUrl: 'http://127.0.0.1:4102/admin/', onExit: ({ listener }) => { listener(); } });
  await settle();
  assert.deepEqual(posts, []);
  await runtime.close({});
  let hooked = false;
  runtime.connectSite({ adminUrl: 'http://127.0.0.1:4103/admin/', onExit: () => { hooked = true; } });
  await settle();
  assert.equal(hooked, false);
  assert.deepEqual(posts, []);
  assert.deepEqual(await runtime.environment({}), {});
});

test('a site that exits after it was connected stops receiving capabilities, and quit disconnects every site', async () => {
  const { runtime, posts, settle } = deliveryFixture();
  const exits: (() => void)[] = [];
  for (const port of [4102, 4103]) runtime.connectSite({ adminUrl: `http://127.0.0.1:${port}/admin/`, onExit: ({ listener }) => { exits.push(listener); } });
  await settle();
  assert.deepEqual(posts.map(post => post.url).sort(), ['http://127.0.0.1:4102/internal/desktop-mcp-capability', 'http://127.0.0.1:4103/internal/desktop-mcp-capability']);
  assert.equal(posts.every(post => !post.init.signal!.aborted), true);
  exits[0]!();
  await runtime.close({});
  assert.equal(exits.length, 2);
});

test('a runtime factory rejection records redacted cause and preserves degraded boot', async t => {
  const mcp = await import('@jini-ai/mcp');
  t.mock.module('@jini-ai/mcp', { namedExports: { ...mcp, createMcpHttpToolServerRuntime: () => { throw new Error('factory context password=MCP_BOOT_CANARY'); } } });
  const modulePath = './desktop-mcp-http.ts?factory-failure';
  const { createDesktopMcpHttpRuntime: create } = await import(modulePath);
  const warnings: string[] = [];
  const runtime = create({ context, warn: ({ message }: { message: string }) => warnings.push(message) });
  t.after(() => runtime.close({}));
  const environment = await runtime.environment({});
  assert.equal(environment.TOVU_DESKTOP_MCP_URL, undefined);
  assert.ok(environment.TOVU_DESKTOP_MCP_HANDOFF_TOKEN);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /factory context/);
  assert.doesNotMatch(warnings[0]!, /MCP_BOOT_CANARY/);
});
