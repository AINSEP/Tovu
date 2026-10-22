import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePublishContentPeerHttpClient } from "../publish-content-http.js";
import type { EgressPolicy, HttpClientPort } from "#src/platform/http/ports";

// hwb #20: the configuration read is at boot, shared by the real roots, and cannot widen later.
test("resolves the operator allowlist once and reports exactly the boot policy", () => {
  let reads = 0;
  const env = { get TOVU_PUBLISH_CONTENT_DEV_HOSTS() { reads++; return " LocalHost, peer.internal, "; } };
  const policies: EgressPolicy[] = []; const reports: string[][] = [];
  const client: HttpClientPort = { send: async () => { throw new Error("unused"); } };
  const result = resolvePublishContentPeerHttpClient({}, { env, createClient: policy => { policies.push(policy); return client; }, onDevHosts: ({ hosts }) => { reports.push([...hosts]); } });
  assert.equal(result, client); assert.equal(reads, 1);
  assert.deepEqual(policies[0]?.devHostAllowlist, ["localhost", "peer.internal"]);
  assert.deepEqual(reports, [["localhost", "peer.internal"]]);
  assert.equal(policies[0]?.denyPrivateAddresses, true);
});

test("an injected peer transport bypasses environment lookup and default adapter construction", () => {
  const client: HttpClientPort = { send: async () => { throw new Error("unused"); } };
  const env = { get TOVU_PUBLISH_CONTENT_DEV_HOSTS(): string { throw new Error("must not read"); } };
  assert.equal(resolvePublishContentPeerHttpClient({}, { client, env, createClient: () => { throw new Error("must not construct"); } }), client);
});

test("the default boot report logs the development peer hosts once; no hosts means no report", (t) => {
  const lines: unknown[][] = [];
  t.mock.method(console, "info", (...args: unknown[]) => { lines.push(args); });
  const client: HttpClientPort = { send: async () => { throw new Error("unused"); } };
  resolvePublishContentPeerHttpClient({}, { env: { TOVU_PUBLISH_CONTENT_DEV_HOSTS: "peer.internal" }, createClient: () => client });
  resolvePublishContentPeerHttpClient({}, { env: {}, createClient: () => client });
  assert.deepEqual(lines, [["[publish-content] development peer hosts: peer.internal"]]);
});
