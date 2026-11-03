import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry } from "@jini-ai/core";
import { buildToolCatalogQuery } from "#src/assistant/tool-catalog-query";
import { createDaemonSiteTools } from "../agent-daemon-site-tools.js";

/** Site wire fixture: the request URL is the observable scope, not a caller-global principal. */
function siteToolsFixture() {
  let generation = 0;
  let invalid = false;
  const requests: URL[] = [];
  const releases: string[][] = [];
  const local = createToolRegistry({});
  local.register({ descriptor: { id: "page.inspect", readOnly: true }, policy: { authorize: () => "allow" }, handler: async () => ({}) });
  const host = createDaemonSiteTools({ baseUrl: "https://localhost:54321", token: "private", localRegistry: local,
    contextFor: () => ({ conversationId: "chat" }) }, { buildCatalog: (source) => {
      const query = buildToolCatalogQuery(source);
      return { ...query, dispose: () => { releases.push(source.list({}).map(tool => tool.id)); query.dispose(); } };
    }, fetch: async (input, init) => {
      const url = new URL(String(input)); requests.push(url);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer private");
      if (invalid) return new Response('{"snapshot":{}}');
      if (url.pathname === "/internal/component-catalog") return Response.json({ snapshot: {
        generation: String(generation), siteProvider: "example", providers: [{ id: "example", kinds: ["bar"], javascript: "/chart.js" }],
      } });
      const principal = url.searchParams.get("principalId");
      return Response.json({ tools: [{ id: `${principal}_read_${generation}`, description: "read distinctive record", readOnly: true }] });
    } });
  return { host, local, requests, releases, advance: () => { generation++; }, invalidate: () => { invalid = true; } };
}

test("concurrent principals have isolated catalogs and terminal cleanup", async () => {
  const { host, advance, releases } = siteToolsFixture();
  await host.start({ runId: "a1", principalId: "alice" });
  await host.start({ runId: "b1", principalId: "bob" });
  const ids = (runId: string) => host.withRun({ runId, fn: () => host.registry.list({}).map(tool => tool.id) });
  assert.deepEqual(ids("a1"), ["page.inspect", "alice_read_0"]);
  assert.deepEqual(ids("b1"), ["page.inspect", "bob_read_0"]);
  advance();
  await host.start({ runId: "a2", principalId: "alice" });
  assert.deepEqual(ids("a1"), ["page.inspect", "alice_read_1"], "each start refreshes that principal");
  assert.equal(releases.length, 1, "refresh disposes the previous FTS connection");
  host.finish({ runId: "a1" });
  assert.equal(releases.length, 1, "another live run retains the principal catalog");
  assert.deepEqual(ids("a2"), ["page.inspect", "alice_read_1"]);
  assert.throws(() => ids("a1"), /live run/);
  host.finish({ runId: "a2" });
  assert.equal(releases.length, 2, "the last live run releases its principal FTS connection");
  assert.throws(() => ids("a2"), /live run/);
  assert.deepEqual(ids("b1"), ["page.inspect", "bob_read_0"]);
  host.finish({ runId: "b1" });
  assert.equal(releases.length, 3);
  assert.throws(() => host.registry.list({}), /live run/);
});

test("component requests refresh the server snapshot and fail closed without a core fallback", async () => {
  const { host, requests, advance, invalidate } = siteToolsFixture();
  await host.start({ runId: "run", principalId: "alice" });
  await host.refreshComponents({ runId: "run" });
  const component = () => host.withRun({ runId: "run", fn: () => host.components.describe({ id: "recharts.bar-chart" }) });
  assert.equal(component()?.provider, "example");
  const request = requests.find(url => url.pathname === "/internal/component-catalog")!;
  assert.equal(request.search, "?runId=run", "principalId is never sent on the component wire");
  advance();
  await host.refreshComponents({ runId: "run" });
  invalidate();
  await assert.rejects(host.refreshComponents({ runId: "run" }));
  assert.throws(component, /unavailable/);
  host.finish({ runId: "run" });
});

test("a catalog read completing after terminal cleanup cannot resurrect its principal", async () => {
  let release!: (response: Response) => void;
  const host = createDaemonSiteTools({ baseUrl: "http://localhost:3000", token: "private", localRegistry: createToolRegistry({}), contextFor: () => ({}) },
    { fetch: async () => new Promise<Response>(resolve => { release = resolve; }) });
  const starting = host.start({ runId: "ending", principalId: "alice" });
  await new Promise<void>(resolve => setImmediate(resolve));
  host.finish({ runId: "ending" });
  release(Response.json({ tools: [{ id: "secret", readOnly: true }] }));
  await assert.rejects(starting, /live run/);
  assert.throws(() => host.withRun({ runId: "ending", fn: () => host.registry.list({}) }), /live run/);
});

test("component snapshot reads reject oversized and malformed provider metadata", async () => {
  let body = JSON.stringify({ tools: [] });
  const host = createDaemonSiteTools({ baseUrl: "http://localhost:3000", token: "private", localRegistry: createToolRegistry({}), contextFor: () => ({}) },
    { fetch: async () => new Response(body) });
  await host.start({ runId: "run", principalId: "alice" });
  for (const value of [JSON.stringify({ snapshot: { generation: "1", siteProvider: "x", providers: [{ id: "x", kinds: "bar" }] } }), " ".repeat(1024 * 1024 + 1)]) {
    body = value;
    await assert.rejects(host.refreshComponents({ runId: "run" }));
  }
  host.finish({ runId: "run" });
});

test("the inherited site tool token is removed before any CLI or plugin runtime can inherit it", async () => {
  const { daemonInitializer, daemonSource, evaluateDaemonExpression } = await import("./helpers/daemon-source.js");
  const { ensureToolExecToken } = await import("#src/assistant/daemon-access");
  const env = { TOVU_TOOL_EXEC_TOKEN: "inherited-site-secret" };
  const token = evaluateDaemonExpression<string>(daemonInitializer("siteToolToken"), { ensureToolExecToken, process: { env } });
  assert.equal(typeof token, "string");
  assert.equal(env.TOVU_TOOL_EXEC_TOKEN, undefined);
  const initializer = daemonInitializer("siteToolToken");
  assert.ok(initializer.pos < daemonInitializer("assistantRuntime").pos, "clear the inherited environment before constructing the agent runtime");
  assert.ok(initializer.pos < daemonInitializer("routeDeps").pos, "clear the inherited environment before plugin composition");
  assert.ok(initializer.pos < daemonSource.end);
});

test("an obsolete start failure cannot remove a newer start of the same run", async () => {
  let rejectFirst!: (error: Error) => void;
  let reads = 0;
  const host = createDaemonSiteTools({ baseUrl: "http://localhost:3000", token: "private", localRegistry: createToolRegistry({}), contextFor: () => ({}) },
    { fetch: async () => ++reads === 1 ? new Promise<Response>((_resolve, reject) => { rejectFirst = reject; })
      : Response.json({ tools: [{ id: "current", readOnly: true }] }) });
  const obsolete = host.start({ runId: "run", principalId: "alice" });
  const rejection = assert.rejects(obsolete, /disconnected/);
  await new Promise<void>(resolve => setImmediate(resolve));
  await host.start({ runId: "run", principalId: "alice" });
  rejectFirst(new Error("disconnected"));
  await rejection;
  assert.deepEqual(host.withRun({ runId: "run", fn: () => host.registry.list({}).map(tool => tool.id) }), ["current"]);
  host.finish({ runId: "run" });
});

test("a live run cannot be rebound to another principal", async () => {
  const { host } = siteToolsFixture();
  await host.start({ runId: "run", principalId: "alice" });
  await assert.rejects(host.start({ runId: "run", principalId: "bob" }), /cannot change principal/);
  assert.deepEqual(host.withRun({ runId: "run", fn: () => host.registry.list({}).map(tool => tool.id) }), ["page.inspect", "alice_read_0"]);
  host.finish({ runId: "run" });
});

test("plugin preflight sends only the live run id and closes after receiving its prepared prefix", async () => {
  const requests: RequestInit[] = [];
  const host = createDaemonSiteTools({ baseUrl: "https://site.example", token: "private", localRegistry: createToolRegistry({}), contextFor: () => ({}) }, {
    fetch: async (url, init) => {
      if (new URL(String(url)).pathname === "/internal/tool-catalog") return Response.json({ tools: [] });
      requests.push(init!);
      return Response.json({ prefix: "site prepared guidance", refusalPrefix: "refused connection" });
    },
  });
  await host.start({ runId: "live", principalId: "member" });
  assert.deepEqual(await host.preflight({ runId: "live" }), { prefix: "site prepared guidance", refusalPrefix: "refused connection" });
  assert.deepEqual(JSON.parse(String(requests[0]?.body)), { runId: "live" });
  assert.equal(requests[0]?.redirect, "error");
  host.finish({ runId: "live" });
  await assert.rejects(host.preflight({ runId: "live" }), /live run/);
});

test("the agent launches only after site catalog and plugin preparation finish", async () => {
  const { captureDaemonRun } = await import("./helpers/daemon-source.js");
  const order: string[] = [];
  const input = await captureDaemonRun({ prompt: "hello" }, { bindings: {
    siteTools: { start: async () => { order.push("catalog"); }, preflight: async () => { order.push("preflight"); return { prefix: "site guidance", refusalPrefix: "withheld connection" }; },
      withRun: ({ fn }: { fn: () => unknown }) => fn(), finish() {} },
  } });
  assert.deepEqual(order, ["catalog", "preflight"]);
  assert.match(input.prompt, /site guidance/);
  assert.match(input.prompt, /withheld connection/);
});
