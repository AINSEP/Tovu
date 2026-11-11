import assert from "node:assert/strict";
import test from "node:test";

import { createHttpClient } from "../client.js";
import {
  createPublishContentPeerEgressPolicy, CUSTOM_CREDENTIALS_EGRESS_POLICY, LIVE_PAGE_EGRESS_POLICY, MEDIA_IMPORT_EGRESS_POLICY,
  parsePublishContentDevHosts, PUBLISH_CONTENT_PEER_MAX_RESPONSE_BYTES, SINGLE_HOP_HTTPS_EGRESS_POLICY, SITE_BACKUP_EGRESS_POLICY,
  SITE_IMPORT_EGRESS_POLICY, WEB_FETCH_EGRESS_POLICY, WEB_SCREENSHOT_EGRESS_POLICY,
} from "../egress-policies.js";
import type { HttpRequest, HttpResponse, HttpTransportAdapter } from "../ports.js";

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

test("the site backup policy is the custom-credential one with a 2-minute idle ceiling, not 10 s (a 42 MiB blob timed out live)", () => {
  assert.equal(CUSTOM_CREDENTIALS_EGRESS_POLICY.connectTimeoutMs, 10_000);
  assert.deepEqual(SITE_BACKUP_EGRESS_POLICY, { ...CUSTOM_CREDENTIALS_EGRESS_POLICY, connectTimeoutMs: 120_000 });
});

// L11 Stryker: every policy constant must be pinned by value — `allowedSchemes → []`,
// `denyPrivateAddresses → false` and every byte/time cap mutated survived before this table.
const MIB = 1024 * 1024;
const POLICY_PINS = [
  ["SINGLE_HOP_HTTPS_EGRESS_POLICY", SINGLE_HOP_HTTPS_EGRESS_POLICY, { allowedSchemes: ["https"], denyPrivateAddresses: true, devHostAllowlist: [], maxRedirects: 0, connectTimeoutMs: 10_000, maxResponseBytes: 1_000_000, maxDecompressedBytes: 1_000_000 }],
  ["MEDIA_IMPORT_EGRESS_POLICY", MEDIA_IMPORT_EGRESS_POLICY, { allowedSchemes: ["https"], denyPrivateAddresses: true, devHostAllowlist: [], maxRedirects: 3, connectTimeoutMs: 20_000, maxResponseBytes: 62_914_560, maxDecompressedBytes: 62_914_560 }],
  ["CUSTOM_CREDENTIALS_EGRESS_POLICY", CUSTOM_CREDENTIALS_EGRESS_POLICY, { allowedSchemes: ["https"], denyPrivateAddresses: true, devHostAllowlist: [], maxRedirects: 3, connectTimeoutMs: 10_000, maxResponseBytes: 1_000_000, maxDecompressedBytes: 1_000_000 }],
  ["SITE_BACKUP_EGRESS_POLICY", SITE_BACKUP_EGRESS_POLICY, { allowedSchemes: ["https"], denyPrivateAddresses: true, devHostAllowlist: [], maxRedirects: 3, connectTimeoutMs: 120_000, maxResponseBytes: 1_000_000, maxDecompressedBytes: 1_000_000 }],
  ["SITE_IMPORT_EGRESS_POLICY", SITE_IMPORT_EGRESS_POLICY, { allowedSchemes: ["https"], denyPrivateAddresses: true, devHostAllowlist: [], maxRedirects: 5, connectTimeoutMs: 30_000, maxResponseBytes: 300 * MIB, maxDecompressedBytes: 314_572_800 }],
  ["WEB_FETCH_EGRESS_POLICY", WEB_FETCH_EGRESS_POLICY, { allowedSchemes: ["https", "http"], denyPrivateAddresses: true, devHostAllowlist: [], maxRedirects: 5, connectTimeoutMs: 15_000, maxResponseBytes: 5_242_880, maxDecompressedBytes: 5_242_880 }],
  ["WEB_SCREENSHOT_EGRESS_POLICY", WEB_SCREENSHOT_EGRESS_POLICY, { allowedSchemes: ["https", "http"], denyPrivateAddresses: true, devHostAllowlist: [], maxRedirects: 0, connectTimeoutMs: 15_000, maxResponseBytes: 15_728_640, maxDecompressedBytes: 15_728_640 }],
  ["LIVE_PAGE_EGRESS_POLICY", LIVE_PAGE_EGRESS_POLICY, { allowedSchemes: ["https"], denyPrivateAddresses: true, devHostAllowlist: [], maxRedirects: 0, connectTimeoutMs: 15_000, maxResponseBytes: 1_000_000, maxDecompressedBytes: 1_000_000 }],
  ["createPublishContentPeerEgressPolicy([])", createPublishContentPeerEgressPolicy([]), { allowedSchemes: ["https"], denyPrivateAddresses: true, devHostAllowlist: [], maxRedirects: 0, connectTimeoutMs: 30_000, maxResponseBytes: 100_663_296, maxDecompressedBytes: 100_663_296 }],
] as const;

for (const [name, policy, expected] of POLICY_PINS) {
  test(`${name} is pinned by value (schemes, private-address guard, redirect, time and byte caps)`, () => {
    assert.deepEqual(policy, expected);
  });
}

test("PUBLISH_CONTENT_PEER_MAX_RESPONSE_BYTES is 96 MiB", () => {
  assert.equal(PUBLISH_CONTENT_PEER_MAX_RESPONSE_BYTES, 100_663_296);
});

/** A hermetic resolver: `internal.example` answers with a private address, everything else public. */
const fixtureDns = {
  resolve: async ({ hostname }: { hostname: string }) => (hostname === "internal.example" ? ["10.0.0.7"] : ["93.184.216.34"]),
};

class RecordingTransport implements HttpTransportAdapter {
  calls = 0;
  async requestPinned(): Promise<HttpResponse> {
    this.calls += 1;
    return { status: 200, headers: {}, bodyText: "ok" };
  }
}

const request = (url: string): HttpRequest => ({ method: "GET", url, headers: {}, timeoutMs: 1000 });

for (const [name, policy] of POLICY_PINS) {
  test(`${name} refuses a host that resolves to a private address before any transport call`, async () => {
    const transport = new RecordingTransport();
    const client = createHttpClient({ transport, policy }, { dns: fixtureDns });
    await assert.rejects(() => client.send(request("https://internal.example/")), {
      name: "EgressRefusedError", message: "egress to 'internal.example' (10.0.0.7) rejected: resolved address is private",
    });
    assert.equal(transport.calls, 0);
  });
}

for (const [name, policy] of POLICY_PINS.filter(([, p]) => !p.allowedSchemes.includes("http"))) {
  test(`${name} refuses plain http before any transport call`, async () => {
    const transport = new RecordingTransport();
    const client = createHttpClient({ transport, policy }, { dns: fixtureDns });
    await assert.rejects(() => client.send(request("http://public.example/")), { name: "EgressRefusedError" });
    assert.equal(transport.calls, 0);
  });
}

for (const [name, policy] of POLICY_PINS.filter(([, p]) => p.allowedSchemes.includes("http"))) {
  test(`${name} allows plain http to a public host`, async () => {
    const transport = new RecordingTransport();
    const client = createHttpClient({ transport, policy }, { dns: fixtureDns });
    assert.equal((await client.send(request("http://public.example/"))).status, 200);
    assert.equal(transport.calls, 1);
  });
}
