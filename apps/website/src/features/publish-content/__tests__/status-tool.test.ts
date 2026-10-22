import assert from "node:assert/strict";
import test from "node:test";

import { PUBLISH_CONTENT_STATUS_TOOL_ID } from "../agent-tools.js";
import { InMemoryPublishContentPeerRepo } from "../peers.js";
import { context, fixture, peerRow, tool } from "./pull-tool-fixture.js";

/**
 * @file `publish_content_status` through its registration: which destination row decides the
 * readiness answer, and that the deploy-config candidate scan runs only when nothing is saved.
 */

async function status(deps: Awaited<ReturnType<typeof fixture>>["deps"]) {
  return (await tool(deps, PUBLISH_CONTENT_STATUS_TOOL_ID)).handler(context(undefined)) as Promise<{ ready: boolean; verdict: string; summary: string }>;
}

test("a hand-configured destination makes this computer ready to publish to it", async () => {
  const f = await fixture();
  let scans = 0;
  f.deps.findPublishCandidate = async () => { scans += 1; return "https://unused.example"; };
  const result = await status(f.deps);
  assert.deepEqual([result.ready, result.verdict, result.summary], [true, "ready", "This computer publishes to Live site."]);
  assert.equal(scans, 0, "no candidate scan when a destination is saved");
});

test("a connected destination is the one named, even beside a hand-configured one", async () => {
  const f = await fixture();
  await f.peerRepo.insert(peerRow("connected", "Connected site", true));
  const result = await status(f.deps);
  assert.equal(result.summary, "This computer publishes to Connected site.");
});

test("with nothing saved, the candidate scan decides between not-connected and no live site", async () => {
  const f = await fixture();
  f.deps.publishContentPeerRepo = new InMemoryPublishContentPeerRepo();
  f.deps.findPublishCandidate = async () => "https://shop.example";
  const candidate = await status(f.deps);
  assert.equal(candidate.verdict, "not-connected");
  assert.match(candidate.summary, /not set up to publish to/);

  f.deps.findPublishCandidate = async () => null;
  const none = await status(f.deps);
  assert.deepEqual([none.ready, none.verdict], [false, "no-live-site"]);
});
