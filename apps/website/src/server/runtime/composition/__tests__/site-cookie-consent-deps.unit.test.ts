/** @file `createSiteCookieConsentDeps`: each consent reader loads the plugin contributions at most once a minute. */
import assert from "node:assert/strict";
import test from "node:test";
import type { LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import { createSiteCookieConsentDeps } from "../site-cookie-consent.js";

/** A contribution loader that records every call and returns no plugins. */
function countingLoader() {
  const calls: unknown[][] = [];
  const loadContributions: LoadPluginContributions = async (...args: unknown[]) => {
    calls.push(args);
    return { items: [], refusals: [] };
  };
  return { calls, loadContributions };
}

for (const reader of ["scriptDeclarations", "browserPlugins", "regionResolvers"] as const) {
  test(`${reader} reuses one load for a minute, then reads the plugins again`, async () => {
    const { calls, loadContributions } = countingLoader();
    let now = 5_000;
    const deps = createSiteCookieConsentDeps({ workspaceId: "ws-c", loadContributions }, { env: { TOVU_CONSENT_INGRESS: " edge-a " }, nowMs: () => now });

    const read = deps[reader];
    assert.ok(read, `the composed deps provide ${reader}`);
    const first = read();
    await first;
    assert.equal(calls.length, 1, "the first read loads the plugin contributions");
    assert.equal((calls[0]![0] as { workspaceId: string }).workspaceId, "ws-c");
    assert.deepEqual(calls[0]![1], { requireActive: true });

    now += 59_999;
    assert.equal(read(), first, "a read inside the minute returns the same pending load");
    assert.equal(calls.length, 1);

    now += 1;
    const second = read();
    assert.notEqual(second, first, "a read a full minute later starts a fresh load");
    await second;
    assert.equal(calls.length, 2);
    assert.equal(read(), second, "the fresh load is cached from its own read time");
    assert.equal(calls.length, 2);
  });
}

test("without a trusted ingress the region readers never consult the plugins", async () => {
  const { calls, loadContributions } = countingLoader();
  const deps = createSiteCookieConsentDeps({ workspaceId: "ws-c", loadContributions }, { env: { TOVU_CONSENT_INGRESS: "   " }, nowMs: () => 0 });
  assert.ok(deps.regionResolvers, "the composed deps provide regionResolvers");
  await deps.regionResolvers();
  assert.deepEqual(calls, []);
});

test("the older region-header setting adds one trimmed header reader without consulting the plugins; a blank one adds none", async () => {
  const { calls, loadContributions } = countingLoader();
  const configured = createSiteCookieConsentDeps({ workspaceId: "ws-c", loadContributions }, { env: { TOVU_CONSENT_REGION_HEADER: "  x-visitor-region  " }, nowMs: () => 0 });
  const resolvers = await configured.regionResolvers!();
  assert.deepEqual(resolvers.map(resolver => resolver.id), ["configured-header"]);
  const asked: string[] = [];
  const request = { header: (name: string) => { asked.push(name); return name === "x-visitor-region" ? "US" : null; }, ip: null };
  assert.equal(await resolvers[0]!.resolve({ request }), "us");
  assert.deepEqual(asked, ["x-visitor-region"], "the reader consults exactly the trimmed header name");
  const blank = createSiteCookieConsentDeps({ workspaceId: "ws-c", loadContributions }, { env: { TOVU_CONSENT_REGION_HEADER: "   " }, nowMs: () => 0 });
  assert.deepEqual(await blank.regionResolvers!(), []);
  assert.deepEqual(calls, []);
});
