import assert from "node:assert/strict";
import test from "node:test";
import { createFakeSiteUpdate } from "@jini-ai/devops/deploy";
import { composeConfiguredSiteUpdateRuntime } from "../configured-runtime.js";
import type { SiteUpdateHost } from "../host-runtime.js";

/** @file The update runtime exists only when a feed URL is configured; the feed is read through the injected client. */

const FEED = "https://api.github.com/repos/example-org/example-repo/releases/latest";
const fake = createFakeSiteUpdate({ runningVersion: "1.2.0", latest: { version: "1.3.0", notes: "x" } });
const host: SiteUpdateHost = { kind: "self-hosted", images: { currentTag: async () => "1.2.0", setTag: async () => undefined, redeploy: async () => undefined }, health: { check: async () => ({ status: "healthy" as const }) } };
const shared = { backup: fake.ports.backup, readiness: fake.ports.readiness, ids: fake.ports.ids, runningVersion: async () => "1.2.0" };

test("with a configured feed URL the runtime's feed reads that URL through the injected client", async () => {
  const urls: string[] = [];
  const runtime = composeConfiguredSiteUpdateRuntime({ config: { feedUrl: FEED }, host, shared, getJson: async ({ url }) => { urls.push(url); return { tag_name: "v1.3.0", body: "notes" }; } });
  assert.ok(runtime, "a runtime is built");
  assert.deepEqual(await runtime.feed.latestRelease({}), { version: "1.3.0", notes: "notes" });
  assert.deepEqual(urls, [FEED]);
});

test("without a feed URL there is no runtime and no default URL is tried", () => {
  let called = false;
  const getJson = async () => { called = true; return {}; };
  for (const feedUrl of [undefined, "", "   "]) assert.equal(composeConfiguredSiteUpdateRuntime({ config: { feedUrl }, host, shared, getJson }), null);
  assert.equal(called, false);
});

test("a host kind that cannot update itself yields no runtime even with a feed URL", () => {
  assert.equal(composeConfiguredSiteUpdateRuntime({ config: { feedUrl: FEED }, host: { kind: "none" }, shared, getJson: async () => ({}) }), null);
});
