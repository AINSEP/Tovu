import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry } from "@jini-ai/core";
import { createDaemonSiteTools } from "../agent-daemon-site-tools.js";

/**
 * @file Fail-closed and stale-reply branches of the daemon's site tool host not pinned by
 * `agent-daemon-site-tools.unit.test.ts`: a run whose catalog has not arrived yet, an older catalog
 * reply landing after a newer one, a refused or orphaned plugin preparation, and audited discovery.
 * The site is a fake `fetch` keyed by path; every reply is held until the test releases it.
 */

type Held = { path: string; release: (response: Response) => void };

function heldSite() {
  const held: Held[] = [];
  const fetch = (input: string | URL | Request) => new Promise<Response>(resolve => {
    held.push({ path: new URL(String(input)).pathname, release: resolve });
  });
  const host = (audit?: { sink: { append(event: unknown): Promise<void> }; workspaceId: string }) => createDaemonSiteTools({
    baseUrl: "https://site.example", token: "private", localRegistry: createToolRegistry({}), contextFor: () => ({}),
    ...(audit ? { audit: audit as never } : {}),
  }, { fetch: fetch as typeof globalThis.fetch });
  const nextTick = () => new Promise(resolve => setImmediate(resolve));
  return { held, host, nextTick };
}

test("while a run's catalog is still loading, listing and searching its tools refuse instead of serving nothing", async () => {
  const { held, host, nextTick } = heldSite();
  const site = host();
  const starting = site.start({ runId: "loading", principalId: "member" });
  await nextTick();
  assert.equal(held[0]?.path, "/internal/tool-catalog");
  assert.throws(() => site.withRun({ runId: "loading", fn: () => site.registry.list({}) }), { message: "site tool catalog is unavailable" });
  assert.throws(() => site.withRun({ runId: "loading", fn: () => site.catalog.search({ query: "read" }) }), { message: "site tool catalog is unavailable" });
  held[0]!.release(Response.json({ tools: [{ id: "member_read", description: "read", readOnly: true }] }));
  await starting;
  assert.deepEqual(site.withRun({ runId: "loading", fn: () => site.registry.list({}).map(tool => tool.id) }), ["member_read"]);
  // Unaudited host: discovery answers from the loaded catalog directly.
  assert.deepEqual(site.withRun({ runId: "loading", fn: () => site.catalog.search({ query: "read" }).map(hit => hit.id) }), ["member_read"]);
});

test("an older start's catalog arriving after a newer one for the same person is discarded", async () => {
  const { held, host, nextTick } = heldSite();
  const site = host();
  const older = site.start({ runId: "older", principalId: "member" });
  const newer = site.start({ runId: "newer", principalId: "member" });
  await nextTick();
  assert.equal(held.length, 2);
  held[1]!.release(Response.json({ tools: [{ id: "newer_tool", description: "new", readOnly: true }] }));
  await newer;
  held[0]!.release(Response.json({ tools: [{ id: "older_tool", description: "old", readOnly: true }] }));
  await older;
  assert.deepEqual(site.withRun({ runId: "older", fn: () => site.registry.list({}).map(tool => tool.id) }), ["newer_tool"]);
  assert.deepEqual(site.withRun({ runId: "newer", fn: () => site.registry.list({}).map(tool => tool.id) }), ["newer_tool"]);
});

async function startedSite() {
  const fixture = heldSite();
  const site = fixture.host();
  const starting = site.start({ runId: "live", principalId: "member" });
  await fixture.nextTick();
  fixture.held[0]!.release(Response.json({ tools: [] }));
  await starting;
  return { ...fixture, site };
}

test("a plugin preparation the site refuses fails the run's preparation", async () => {
  const { held, site, nextTick } = await startedSite();
  const preparing = site.preflight({ runId: "live" });
  await nextTick();
  assert.equal(held[1]?.path, "/internal/agent-plugin-preflight");
  held[1]!.release(new Response("{}", { status: 503 }));
  await assert.rejects(preparing, { message: "site plugin preparation is unavailable" });
});

test("a plugin preparation whose run ended while it was in flight is refused even when the site answered", async () => {
  const { held, site, nextTick } = await startedSite();
  const preparing = site.preflight({ runId: "live" });
  await nextTick();
  site.finish({ runId: "live" });
  held[1]!.release(Response.json({ prefix: "late guidance", refusalPrefix: "", pluginIds: [] }));
  await assert.rejects(preparing, { message: "a live run is required for site discovery" });
});

test("audited discovery records each search with the run, person and workspace", async () => {
  const events: Array<Record<string, unknown>> = [];
  const fixture = heldSite();
  const site = fixture.host({ sink: { append: async (event: unknown) => { events.push(event as Record<string, unknown>); } }, workspaceId: "ws-audit" });
  const starting = site.start({ runId: "audited", principalId: "member" });
  await fixture.nextTick();
  fixture.held[0]!.release(Response.json({ tools: [{ id: "member_records_read", description: "read distinctive record", readOnly: true }] }));
  await starting;
  const hits = site.withRun({ runId: "audited", fn: () => site.catalog.search({ query: "distinctive" }) });
  assert.deepEqual(hits.map(hit => hit.id), ["member_records_read"]);
  await fixture.nextTick();
  assert.equal(events.length, 1);
  assert.equal(events[0]?.workspaceId, "ws-audit");
  assert.equal(events[0]?.runId, "audited");
  assert.equal(events[0]?.principalId, "member");
});
