import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startDesktopMcpHttp } from './desktop-mcp-http.ts';
import { createSitesMcpToolHost } from './sites-mcp-tools.ts';
import { trackSite, sitesFilePath } from './tracked-sites.ts';

// The HTTP fixtures inspect the JSON-RPC envelope, whose JSON decoder returns unknown.
type RpcResponse = {
  result: { serverInfo: { name: string }; tools: { name: string }[];
    structuredContent: { count: number; code: string }; isError?: boolean };
  error: { code: number };
};

const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
const call = (siteDir: string) => JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'reveal_site_folder', arguments: { siteDir } } });

async function fixture(t: test.TestContext, revealPath: (target: string) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-mcp-http-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const projectsPath = sitesFilePath({ userDataDir: dir });
  // Use the registry owner, so authorization exercises the actual tool handler.
  trackSite({ beforeAddedRows: () => {}, projectsPath, siteDir: '/sites/example' });
  const server = await startDesktopMcpHttp({ context: { beforeAddedRows: () => {}, projectsPath, revealPath: ({ target }) => revealPath(target) } });
  t.after(() => server.close({}));
  const emptySiteDir = path.join(dir, 'empty');
  fs.mkdirSync(emptySiteDir);
  return { ...server, emptySiteDir };
}

test('missing wrong and other-instance tokens dispatch zero tools', async (t) => {
  let dispatches = 0;
  const server = await fixture(t, async () => { dispatches++; });
  const other = await fixture(t, async () => { dispatches++; });
  for (const token of [undefined, 'wrong', other.token]) {
    const response = await fetch(server.url, { method: 'POST', headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: call('/sites/example') });
    assert.equal(response.status, 403);
    await response.body?.cancel();
  }
  assert.equal(dispatches, 0);
  const accepted = await fetch(server.url, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${server.token}` }, body: call('/sites/example') });
  assert.equal(accepted.status, 200);
  await accepted.json();
  assert.equal(dispatches, 1);
});

test('browser-origin request is refused before dispatch', async (t) => {
  let dispatches = 0;
  const server = await fixture(t, async () => { dispatches++; });
  for (const origin of ['http://localhost', 'null', '']) {
    const response = await fetch(server.url, { method: 'POST', headers: { ...headers, Origin: origin, Authorization: `Bearer ${server.token}` }, body: '{invalid json' });
    assert.equal(response.status, 403);
    await response.body?.cancel();
  }
  assert.equal(dispatches, 0);
});

test('mutating calls retain serialization', async (t) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const events: string[] = [];
  const server = await fixture(t, async () => {
    events.push('start'); started();
    await gate;
    events.push('finish');
  });
  const send = () => fetch(server.url, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${server.token}` }, body: call('/sites/example') });
  const first = send();
  await entered;
  const second = send();
  try {
    // The direct queue test below also proves this without depending on network scheduling.
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['start']);
  } finally { release(); }
  const responses = await Promise.all([first, second]);
  for (const response of responses) {
    assert.equal(response.status, 200);
    const result = await response.json() as RpcResponse;
    assert.deepEqual(result.result.structuredContent, { siteDir: '/sites/example', revealed: true });
  }
  assert.deepEqual(events, ['start', 'finish', 'start', 'finish']);
});

test('desktop tools work without keyring or stored row', async (t) => {
  const server = await fixture(t, async () => {});
  const send = async (method: string, params: Record<string, unknown> = {}) => {
    const response = await fetch(server.url, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${server.token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 0, method, params }) });
    assert.equal(response.status, 200);
    return response.json() as Promise<RpcResponse>;
  };
  const initialized = await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'desktop-test', version: '1' } });
  assert.equal(initialized.result.serverInfo.name, 'tovu-desktop');
  const listed = await send('tools/list');
  assert.deepEqual(listed.result.tools.map((tool: { name: string }) => tool.name), ['list_sites', 'add_site_pointer', 'reveal_site_folder']);
  const sites = await send('tools/call', { name: 'list_sites', arguments: {} });
  assert.equal(sites.result.structuredContent.count, 1);
  const refused = await send('tools/call', { name: 'add_site_pointer', arguments: { siteDir: server.emptySiteDir } });
  assert.equal(refused.result.isError, true);
  assert.equal(refused.result.structuredContent.code, 'SITE_DIR_EMPTY');
  const invalid = await send('tools/call', { name: 'reveal_site_folder', arguments: {} });
  assert.equal(invalid.result.isError, true);
  const unknown = await send('unrecognized-method');
  assert.equal(unknown.error.code, -32601);
});

test('queued desktop mutations cannot overtake an unfinished mutation', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-mcp-queue-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const projectsPath = sitesFilePath({ userDataDir: dir });
  trackSite({ beforeAddedRows: () => {}, projectsPath, siteDir: '/sites/example' });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  t.after(() => release());
  const events: string[] = [];
  const host = createSitesMcpToolHost({ context: { beforeAddedRows: () => {}, projectsPath, revealPath: async () => {
    events.push('start'); await gate; events.push('finish');
  } } });
  const reveal = host.tools.find(tool => tool.name === 'reveal_site_folder')!;
  const callInput = { args: { siteDir: '/sites/example' }, ctx: { baseUrl: '', fetchImpl: fetch } };
  const first = reveal.handler(callInput);
  const second = reveal.handler(callInput);
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['start']);
  } finally { release(); }
  await Promise.all([first, second]);
  assert.deepEqual(events, ['start', 'finish', 'start', 'finish']);
  await host.drain({});
});

test('a reveal aborted while queued never reaches the shell and does not block later calls', { timeout: 2000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-mcp-cancel-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const projectsPath = sitesFilePath({ userDataDir: dir });
  const sites = [path.join(dir, 'first'), path.join(dir, 'cancelled'), path.join(dir, 'next')] as const;
  for (const siteDir of sites) trackSite({ beforeAddedRows: () => {}, projectsPath, siteDir });

  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  t.after(release);
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const opened: string[] = [];
  const host = createSitesMcpToolHost({ context: {
    beforeAddedRows: () => {}, projectsPath,
    revealPath: async ({ target }) => {
      opened.push(target);
      if (target === sites[0]) { entered(); await gate; }
    },
  } });
  const reveal = host.tools.find(({ name }) => name === 'reveal_site_folder')!;
  const ctx = { baseUrl: '', fetchImpl: fetch };
  const first = reveal.handler({ args: { siteDir: sites[0] }, ctx });
  await started;
  const controller = new AbortController();
  const cancelled = reveal.handler({ args: { siteDir: sites[1] }, ctx: { ...ctx, signal: controller.signal } });
  const next = reveal.handler({ args: { siteDir: sites[2] }, ctx });
  controller.abort();
  release();
  // `McpToolDef.handler` returns `unknown`; these handlers answer with the MCP tool-result shape.
  type ToolResult = { structuredContent: unknown; isError?: boolean };
  const [firstResult, skipped, nextResult] = await Promise.all([first, cancelled, next]) as [ToolResult, ToolResult, ToolResult];
  assert.deepEqual(firstResult.structuredContent, { siteDir: sites[0], revealed: true });
  assert.equal(skipped.isError, true);
  assert.deepEqual(skipped.structuredContent, { error: 'Desktop call cancelled before dispatch.' });
  assert.deepEqual(nextResult.structuredContent, { siteDir: sites[2], revealed: true });
  assert.deepEqual(opened, [sites[0], sites[2]]);
});
