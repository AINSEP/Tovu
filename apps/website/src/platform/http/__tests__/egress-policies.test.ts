import assert from "node:assert/strict";
import test from "node:test";

import { createPublishContentPeerEgressPolicy, parsePublishContentDevHosts } from "../egress-policies.js";

// F4.3/F7.2: an ignored allowlist or parser without lowercasing must fail.
test("peer dev hosts normalize case and whitespace, drop empty entries and keep IPv6 literals", () => {
  assert.deepEqual(parsePublishContentDevHosts(" , Peer.INTERNAL , , fd00::1, LOCALHOST ,"), [
    "peer.internal", "fd00::1", "localhost",
  ]);
  for (const raw of [undefined, "", "  , ,  "]) {
    assert.deepEqual(parsePublishContentDevHosts(raw), []);
  }
});

test("peer policy preserves the supplied hosts while bounding authenticated HTTPS requests", () => {
  assert.deepEqual(createPublishContentPeerEgressPolicy(["peer.internal", "fd00::1"]), {
    allowedSchemes: ["https"], denyPrivateAddresses: true,
    devHostAllowlist: ["peer.internal", "fd00::1"], maxRedirects: 0,
    connectTimeoutMs: 30_000, maxResponseBytes: 100_663_296, maxDecompressedBytes: 100_663_296,
  });
  assert.deepEqual(createPublishContentPeerEgressPolicy([]).devHostAllowlist, []);
});
