import assert from "node:assert/strict";
import test from "node:test";

import type { ClockPort, IdGeneratorPort, JsonObject, UUID } from "@jini-ai/cms/core";
import { AnalyticsPiiRejectedError, type AnalyticsConfigPort } from "../ports.js";
import {
  ingestHit,
  normalizeIngestContext,
  validateEventProps,
  type IngestHitDeps,
} from "../ingest.js";
import { LocalBufferSink } from "../repo.memory.js";
import type { AnalyticsSiteConfig, IngestBeacon, IngestContext } from "../types.js";

const ROOT_KEY_SEED = "test-root-key-seed-do-not-use-in-prod";

const RAW_IP = "203.0.113.77";
const RAW_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function makeSalt(utcDate: string): Buffer {
  // Local, deterministic stand-in salt for pure normalizeIngestContext tests (salt derivation
  // itself is covered by salt.test.ts) — keyed by date so day-rotation tests can vary it.
  return Buffer.from(`fixed-test-salt-${utcDate}`.padEnd(32, "0").slice(0, 32));
}

test("normalizeIngestContext is deterministic for the same (salt, ip, ua)", () => {
  const salt = makeSalt("2026-07-10");
  const first = normalizeIngestContext({ input: { ip: RAW_IP, userAgent: RAW_USER_AGENT, siteHost: "example.com" }, dailySalt: salt });
  const second = normalizeIngestContext({ input: { ip: RAW_IP, userAgent: RAW_USER_AGENT, siteHost: "example.com" }, dailySalt: salt });

  assert.equal(first.visitorHash, second.visitorHash);
  assert.equal(first.deviceClass, "desktop");
  assert.equal(first.browserFamily, "chrome");
  assert.equal(first.osFamily, "windows");
});

test("normalizeIngestContext produces a different hash when the day (salt) rotates", () => {
  const day1Salt = makeSalt("2026-07-10");
  const day2Salt = makeSalt("2026-07-11");

  const day1 = normalizeIngestContext({ input: { ip: RAW_IP, userAgent: RAW_USER_AGENT, siteHost: "example.com" }, dailySalt: day1Salt });
  const day2 = normalizeIngestContext({ input: { ip: RAW_IP, userAgent: RAW_USER_AGENT, siteHost: "example.com" }, dailySalt: day2Salt });

  assert.notEqual(day1.visitorHash, day2.visitorHash);
});

test("normalizeIngestContext buckets an IPv4 address to its /24 before hashing: same first 3 octets -> same hash, different 3rd octet -> different hash", () => {
  const salt = makeSalt("2026-07-10");
  const args = (ip: string) => ({ input: { ip, userAgent: RAW_USER_AGENT, siteHost: "example.com" }, dailySalt: salt });

  const first = normalizeIngestContext(args("203.0.113.1"));
  const sameSubnet = normalizeIngestContext(args("203.0.113.254"));
  const differentSubnet = normalizeIngestContext(args("203.0.114.1"));

  assert.equal(first.visitorHash, sameSubnet.visitorHash, "only the last octet differs — must truncate to the same /24 bucket");
  assert.notEqual(first.visitorHash, differentSubnet.visitorHash, "the 3rd octet differs — must be a different bucket");
});

test("normalizeIngestContext buckets an IPv6 address to its first 3 groups before hashing: same prefix -> same hash, different prefix -> different hash", () => {
  const salt = makeSalt("2026-07-10");
  const args = (ip: string) => ({ input: { ip, userAgent: RAW_USER_AGENT, siteHost: "example.com" }, dailySalt: salt });

  const first = normalizeIngestContext(args("2001:db8:1234:aaaa:bbbb:cccc:dddd:eeee"));
  const samePrefix = normalizeIngestContext(args("2001:db8:1234:ffff:0:0:0:1"));
  const differentPrefix = normalizeIngestContext(args("2001:db8:5678:aaaa:bbbb:cccc:dddd:eeee"));

  assert.equal(first.visitorHash, samePrefix.visitorHash, "only groups after the first 3 differ — must truncate to the same bucket");
  assert.notEqual(first.visitorHash, differentPrefix.visitorHash, "the 3rd group differs — must be a different bucket");
});

test("normalizeIngestContext falls back to a fixed bucket for an unrecognized IP shape (neither IPv4 nor IPv6)", () => {
  const salt = makeSalt("2026-07-10");
  const args = (ip: string) => ({ input: { ip, userAgent: RAW_USER_AGENT, siteHost: "example.com" }, dailySalt: salt });

  // Two different garbage strings, neither containing ":" nor splitting into exactly 4 octets, must
  // still resolve to the identical "unknown" bucket rather than leaking the raw distinguishing bytes
  // into the hash unbucketed.
  const first = normalizeIngestContext(args("not-an-ip"));
  const second = normalizeIngestContext(args("also-not-an-ip"));

  assert.equal(first.visitorHash, second.visitorHash, 'every unrecognized IP shape must collapse to the same "unknown" bucket');
});

test("normalizeIngestContext never places the raw ip or user-agent on its return value", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: { ip: RAW_IP, userAgent: RAW_USER_AGENT, siteHost: "example.com" },
    dailySalt: salt,
  });

  const serialized = JSON.stringify(normalized);
  assert.equal(serialized.includes(RAW_IP), false);
  assert.equal(serialized.includes(RAW_USER_AGENT), false);
  assert.equal(Object.keys(normalized).includes("ip"), false);
  assert.equal(Object.keys(normalized).includes("userAgent"), false);
});

test("normalizeIngestContext classifies a bot user agent", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: {
      ip: RAW_IP,
      userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      siteHost: "example.com",
    },
    dailySalt: salt,
  });
  assert.equal(normalized.deviceClass, "bot");
});

test("normalizeIngestContext classifies a non-Apple tablet user agent", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: {
      ip: RAW_IP,
      userAgent: "Mozilla/5.0 (PlayBook; U; RIM Tablet OS 2.1.0; en-US) AppleWebKit/536.2+ (KHTML, like Gecko) Version/7.2.1.0 Safari/536.2+",
      siteHost: "example.com",
    },
    dailySalt: salt,
  });
  assert.equal(normalized.deviceClass, "tablet");
});

// NOTE: a real Apple iPhone/iPad Safari user agent always contains the literal substring
// "like Mac OS X" (WebKit compatibility convention), which trips classifyOsFamily's earlier
// "mac os|macintosh" check before its "iphone|ipad|ios" check ever runs — so authentic mobile
// Safari traffic is classified osFamily "macos", never "ios". This synthetic user agent
// deliberately omits "Mac OS X" to exercise the (largely dead-in-practice) "ios" branch.
test("normalizeIngestContext classifies osFamily 'ios' for a user agent naming iphone/ipad without also matching the macos pattern", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: { ip: RAW_IP, userAgent: "Mozilla/5.0 (iPhone) ExampleMobileApp/1.0", siteHost: "example.com" },
    dailySalt: salt,
  });
  assert.equal(normalized.osFamily, "ios");
  assert.equal(normalized.deviceClass, "mobile");
});

// Bug regression (found + characterized by a prior session, fixed in this one): a REAL iPhone/iPad
// Safari user agent always contains the literal substring "like Mac OS X" (WebKit's own
// compatibility convention — every genuine mobile Safari UA carries it, not a contrived edge case).
// `classifyOsFamily` used to test "mac os|macintosh" BEFORE "iphone|ipad|ios", so every real Apple
// mobile visitor was misclassified osFamily "macos" — the "ios" branch above never fired on real
// traffic, only on a synthetic UA (like the test above) that omits "Mac OS X" outright. These three
// UAs are byte-for-byte real device/browser strings (not contrived), so this proves the fix against
// the actual bytes real visitors send, not just an inverted synthetic case.
const REAL_IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const REAL_IPAD_SAFARI_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const REAL_MACOS_SAFARI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

test("normalizeIngestContext classifies osFamily 'ios' (not 'macos') for a REAL iPhone Safari user agent, despite it containing the literal substring 'like Mac OS X'", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: { ip: RAW_IP, userAgent: REAL_IPHONE_SAFARI_UA, siteHost: "example.com" },
    dailySalt: salt,
  });
  assert.equal(normalized.osFamily, "ios");
  assert.equal(normalized.deviceClass, "mobile");
});

test("normalizeIngestContext classifies osFamily 'ios' (not 'macos') for a REAL iPad Safari user agent, despite it containing the literal substring 'like Mac OS X'", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: { ip: RAW_IP, userAgent: REAL_IPAD_SAFARI_UA, siteHost: "example.com" },
    dailySalt: salt,
  });
  assert.equal(normalized.osFamily, "ios");
  assert.equal(normalized.deviceClass, "tablet");
});

test("normalizeIngestContext still classifies osFamily 'macos' for a REAL macOS Safari user agent (proves the iOS fix did not invert the bug onto real desktop Mac traffic)", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: { ip: RAW_IP, userAgent: REAL_MACOS_SAFARI_UA, siteHost: "example.com" },
    dailySalt: salt,
  });
  assert.equal(normalized.osFamily, "macos");
  assert.equal(normalized.deviceClass, "desktop");
});

test("normalizeIngestContext classifies a mobile Android user agent", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: {
      ip: RAW_IP,
      userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/115.0 Mobile Safari/537.36",
      siteHost: "example.com",
    },
    dailySalt: salt,
  });
  assert.equal(normalized.deviceClass, "mobile");
  assert.equal(normalized.osFamily, "android");
});

test("normalizeIngestContext classifies an empty user agent as unknown/null across device, browser, and os", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: { ip: RAW_IP, userAgent: "", siteHost: "example.com" },
    dailySalt: salt,
  });
  assert.equal(normalized.deviceClass, "unknown");
  assert.equal(normalized.browserFamily, null);
  assert.equal(normalized.osFamily, null);
});

test("normalizeIngestContext falls back to an empty user agent when userAgent is nullish at the runtime boundary (defensive against untrusted network input, despite the string type)", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: { ip: RAW_IP, userAgent: null as unknown as string, siteHost: "example.com" },
    dailySalt: salt,
  });
  assert.equal(normalized.deviceClass, "unknown");
  assert.equal(normalized.browserFamily, null);
  assert.equal(normalized.osFamily, null);
});

test("normalizeIngestContext classifies an Edge user agent as 'edge' even though 'Chrome/' and 'Safari/' also appear in it", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: {
      ip: RAW_IP,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 Edg/116.0.1938.62",
      siteHost: "example.com",
    },
    dailySalt: salt,
  });
  assert.equal(normalized.browserFamily, "edge");
});

test("normalizeIngestContext classifies a Firefox-on-Linux user agent as browser 'firefox' and os 'linux'", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: {
      ip: RAW_IP,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:118.0) Gecko/20100101 Firefox/118.0",
      siteHost: "example.com",
    },
    dailySalt: salt,
  });
  assert.equal(normalized.browserFamily, "firefox");
  assert.equal(normalized.osFamily, "linux");
  assert.equal(normalized.deviceClass, "desktop");
});

test("normalizeIngestContext classifies a Safari-on-macOS user agent as browser 'safari' (not 'chrome') and os 'macos'", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: {
      ip: RAW_IP,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      siteHost: "example.com",
    },
    dailySalt: salt,
  });
  assert.equal(normalized.browserFamily, "safari");
  assert.equal(normalized.osFamily, "macos");
});

test("normalizeIngestContext falls back to browser/os 'other' for a user agent matching none of the known families", () => {
  const salt = makeSalt("2026-07-10");
  const normalized = normalizeIngestContext({
    input: { ip: RAW_IP, userAgent: "SomeInternalClient/1.0", siteHost: "example.com" },
    dailySalt: salt,
  });
  assert.equal(normalized.browserFamily, "other");
  assert.equal(normalized.osFamily, "other");
  assert.equal(normalized.deviceClass, "desktop");
});

// NOTE (found while writing this test): truncateIp's `::`-shorthand handling has a real bug —
// it splits on ":" and filters out empty segments, but does NOT expand "::" to the zero groups
// it represents first. For an address like "::1" that shifts the trailing group into the
// "first 3" bucket, so `truncateIp("::1")` returns "1::" (treating the LAST group as if it were
// the first) instead of the correct "0:0:0::"/"::"-style zero prefix — and the same real address
// written as "2001:db8::1" vs "2001:db8:0:0:0:0:0:1" buckets to two DIFFERENT visitor hashes,
// which breaks the bucketing-consistency the function's own docstring promises. Reported to the
// coordinator as a bug candidate; not fixed here (out of scope for a coverage-only pass) — this
// test only characterizes the current (buggy) behavior deterministically, it does not assert the
// (currently false) equivalence invariant.
test("normalizeIngestContext deterministically buckets an IPv6 address that uses '::' shorthand (exercises the empty-group filter in truncateIp)", () => {
  const salt = makeSalt("2026-07-10");
  const args = (ip: string) => ({ input: { ip, userAgent: RAW_USER_AGENT, siteHost: "example.com" }, dailySalt: salt });

  const first = normalizeIngestContext(args("2001:db8::1"));
  const second = normalizeIngestContext(args("2001:db8::1"));

  assert.equal(first.visitorHash, second.visitorHash, "must be deterministic for the same '::'-shorthand address");
});

test("validateEventProps passes through clean properties", () => {
  const props: JsonObject = { plan: "pro", clicks: 3 };
  assert.deepEqual(validateEventProps(props), props);
});

test("validateEventProps returns null when no properties are supplied", () => {
  assert.equal(validateEventProps(null), null);
  assert.equal(validateEventProps(undefined), null);
});

test("validateEventProps rejects an email-shaped value", () => {
  assert.throws(
    () => validateEventProps({ contact: "someone@example.com" }),
    AnalyticsPiiRejectedError
  );
});

test("validateEventProps rejects a PII-suggestive key name", () => {
  assert.throws(() => validateEventProps({ email: "not-actually-an-email" }), AnalyticsPiiRejectedError);
});

test("validateEventProps rejects a property bag over the key-count bound", () => {
  const tooMany: JsonObject = {};
  for (let i = 0; i < 25; i += 1) tooMany[`k${i}`] = i;
  assert.throws(() => validateEventProps(tooMany), AnalyticsPiiRejectedError);
});

test("validateEventProps rejects an over-length string value", () => {
  assert.throws(
    () => validateEventProps({ note: "x".repeat(500) }),
    AnalyticsPiiRejectedError
  );
});

/* -------------------------------------------------------------------------- */
/* ingestHit integration                                                      */
/* -------------------------------------------------------------------------- */

function makeConfig(overrides: Partial<AnalyticsSiteConfig> = {}): AnalyticsSiteConfig {
  return {
    workspaceId: "workspace-1",
    enabled: true,
    honorDoNotTrack: true,
    honorGlobalPrivacyControl: true,
    rawRetentionDays: 30,
    excludedPaths: ["/admin/*"],
    excludedIpRanges: ["10.0.0.0/24"],
    sink: "local",
    ...overrides,
  };
}

function makeConfigPort(config: AnalyticsSiteConfig): AnalyticsConfigPort {
  return {
    async get() {
      return config;
    },
  };
}

const clock: ClockPort = { nowIso: () => "2026-07-10T12:00:00.000Z" };
const ids: IdGeneratorPort = { newId: () => "id-1" as UUID };

function makeBeacon(overrides: Partial<IngestBeacon> = {}): IngestBeacon {
  return {
    host: "example.com",
    path: "/blog/hello-world",
    referrer: "https://google.com/search?q=hello",
    kind: "pageview",
    ...overrides,
  };
}

function makeContext(overrides: Partial<IngestContext> = {}): IngestContext {
  return {
    ip: RAW_IP,
    userAgent: RAW_USER_AGENT,
    acceptLanguage: "en-US",
    receivedAt: "2026-07-10T12:00:00.000Z",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<IngestHitDeps> = {}): { deps: IngestHitDeps; sink: LocalBufferSink } {
  const sink = new LocalBufferSink();
  const deps: IngestHitDeps = {
    clock,
    ids,
    sink,
    config: makeConfigPort(makeConfig()),
    resolveWorkspaceForHost: async (host: string) => (host === "example.com" ? "workspace-1" : null),
    rootKeySeed: ROOT_KEY_SEED,
    ...overrides,
  };
  return { deps, sink };
}

test("ingestHit accepts a clean hit and hands a PII-free NormalizedHit to the sink", async () => {
  const { deps, sink } = makeDeps();

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext() },
    deps,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.reason, undefined);

  const stored = sink.all();
  assert.equal(stored.length, 1);
  const hit = stored[0];
  assert.equal(hit.workspaceId, "workspace-1");
  assert.equal(hit.path, "/blog/hello-world");
  assert.equal(hit.referrerHost, "google.com");
  assert.equal(hit.deviceClass, "desktop");
  assert.equal(hit.browserFamily, "chrome");
  assert.equal(typeof hit.visitorHash, "string");
  assert.equal(hit.visitorHash.length, 64); // sha256 hex digest
  assert.equal(typeof hit.sessionId, "string");
});

test("ingestHit never lets the raw ip or user-agent reach the stored NormalizedHit", async () => {
  const { deps, sink } = makeDeps();

  await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext() },
    deps,
  });

  const hit = sink.all()[0];
  const serialized = JSON.stringify(hit);

  assert.equal(serialized.includes(RAW_IP), false);
  assert.equal(serialized.includes(RAW_USER_AGENT), false);
  assert.equal(Object.prototype.hasOwnProperty.call(hit, "ip"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(hit, "userAgent"), false);
});

test("ingestHit produces a different visitorHash on a different UTC day (salt rotation end-to-end)", async () => {
  const { deps: depsDay1, sink: sinkDay1 } = makeDeps();
  const { deps: depsDay2, sink: sinkDay2 } = makeDeps();

  await ingestHit({ input: { beacon: makeBeacon(), context: makeContext() }, deps: depsDay1 });
  await ingestHit({
    input: {
      beacon: makeBeacon(),
      context: makeContext({ receivedAt: "2026-07-11T12:00:00.000Z" }),
    },
    deps: depsDay2,
  });

  const hashDay1 = sinkDay1.all()[0].visitorHash;
  const hashDay2 = sinkDay2.all()[0].visitorHash;
  assert.notEqual(hashDay1, hashDay2);
});

test("ingestHit drops a hit for an unresolvable workspace host", async () => {
  const { deps, sink } = makeDeps({ resolveWorkspaceForHost: async () => null });

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext() },
    deps,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "workspace_unresolved");
  assert.equal(sink.all().length, 0);
});

test("ingestHit drops a hit when the site has analytics disabled", async () => {
  const { deps, sink } = makeDeps({ config: makeConfigPort(makeConfig({ enabled: false })) });

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext() },
    deps,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "analytics_disabled");
  assert.equal(sink.all().length, 0);
});

test("ingestHit honors Do-Not-Track", async () => {
  const { deps, sink } = makeDeps();

  const result = await ingestHit({
    input: { beacon: makeBeacon({ dnt: true }), context: makeContext() },
    deps,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "dnt");
  assert.equal(sink.all().length, 0);
});

test("ingestHit honors Global Privacy Control", async () => {
  const { deps, sink } = makeDeps();

  const result = await ingestHit({
    input: { beacon: makeBeacon({ gpc: true }), context: makeContext() },
    deps,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "gpc");
  assert.equal(sink.all().length, 0);
});

test("ingestHit drops a hit for an excluded path", async () => {
  const { deps, sink } = makeDeps();

  const result = await ingestHit({
    input: { beacon: makeBeacon({ path: "/admin/dashboard" }), context: makeContext() },
    deps,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "excluded_path");
  assert.equal(sink.all().length, 0);
});

test("ingestHit drops a hit for an excluded IP range (CIDR)", async () => {
  const { deps, sink } = makeDeps();

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext({ ip: "10.0.0.42" }) },
    deps,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "excluded_ip");
  assert.equal(sink.all().length, 0);
});

test("ingestHit rejects PII-shaped custom event properties", async () => {
  const { deps, sink } = makeDeps();

  const result = await ingestHit({
    input: {
      beacon: makeBeacon({
        kind: "event",
        eventName: "signup",
        eventProps: { email: "someone@example.com" },
      }),
      context: makeContext(),
    },
    deps,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "pii_rejected");
  assert.equal(sink.all().length, 0);
});

test("ingestHit lets a beforeIngest hook drop a hit", async () => {
  const { deps, sink } = makeDeps({ hooks: { beforeIngest: async () => null } });

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext() },
    deps,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "dropped_by_hook");
  assert.equal(sink.all().length, 0);
});

test("ingestHit accepts and stores the hit a beforeIngest hook returns unchanged (hook present but does not drop it)", async () => {
  let hookCalled = false;
  const { deps, sink } = makeDeps({
    hooks: {
      beforeIngest: async (hit) => {
        hookCalled = true;
        return hit;
      },
    },
  });

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext() },
    deps,
  });

  assert.equal(hookCalled, true);
  assert.equal(result.accepted, true);
  assert.equal(sink.all().length, 1);
});

test("ingestHit excludes a path via an exact (non-wildcard) excludedPaths entry", async () => {
  const { deps, sink } = makeDeps({ config: makeConfigPort(makeConfig({ excludedPaths: ["/secret"] })) });

  const excluded = await ingestHit({
    input: { beacon: makeBeacon({ path: "/secret" }), context: makeContext() },
    deps,
  });
  assert.equal(excluded.accepted, false);
  assert.equal(excluded.reason, "excluded_path");

  const notExcluded = await ingestHit({
    input: { beacon: makeBeacon({ path: "/blog/hello-world" }), context: makeContext() },
    deps,
  });
  assert.equal(notExcluded.accepted, true);
  assert.equal(sink.all().length, 1);
});

test("ingestHit excludes an IP via an exact (non-CIDR) excludedIpRanges entry", async () => {
  const { deps, sink } = makeDeps({ config: makeConfigPort(makeConfig({ excludedIpRanges: ["203.0.113.99"] })) });

  const excluded = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext({ ip: "203.0.113.99" }) },
    deps,
  });
  assert.equal(excluded.accepted, false);
  assert.equal(excluded.reason, "excluded_ip");

  const notExcluded = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext({ ip: "203.0.113.1" }) },
    deps,
  });
  assert.equal(notExcluded.accepted, true);
  assert.equal(sink.all().length, 1);
});

test("ingestHit does not exclude an IPv6 address against an IPv4 CIDR excludedIpRanges entry (mismatched families)", async () => {
  const { deps, sink } = makeDeps({ config: makeConfigPort(makeConfig({ excludedIpRanges: ["10.0.0.0/24"] })) });

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext({ ip: "::1" }) },
    deps,
  });

  assert.equal(result.accepted, true);
  assert.equal(sink.all().length, 1);
});

test("ingestHit does not exclude an IP against an excludedIpRanges CIDR entry whose range address is IPv6", async () => {
  const { deps, sink } = makeDeps({ config: makeConfigPort(makeConfig({ excludedIpRanges: ["::1/64"] })) });

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext({ ip: "203.0.113.1" }) },
    deps,
  });

  assert.equal(result.accepted, true);
  assert.equal(sink.all().length, 1);
});

test("ingestHit does not exclude an IP against an excludedIpRanges CIDR entry with a non-numeric prefix", async () => {
  const { deps, sink } = makeDeps({ config: makeConfigPort(makeConfig({ excludedIpRanges: ["10.0.0.0/not-a-number"] })) });

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext({ ip: "10.0.0.1" }) },
    deps,
  });

  assert.equal(result.accepted, true);
  assert.equal(sink.all().length, 1);
});

test("ingestHit does not exclude an IP when the request IP has the wrong number of octets to compare against a CIDR range", async () => {
  const { deps, sink } = makeDeps({ config: makeConfigPort(makeConfig({ excludedIpRanges: ["10.0.0.0/24"] })) });

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext({ ip: "10.0.0" }) },
    deps,
  });

  assert.equal(result.accepted, true);
  assert.equal(sink.all().length, 1);
});

test("ingestHit does not exclude an IP with an out-of-range octet (e.g. 999) against a CIDR range", async () => {
  const { deps, sink } = makeDeps({ config: makeConfigPort(makeConfig({ excludedIpRanges: ["10.0.0.0/24"] })) });

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext({ ip: "999.0.0.1" }) },
    deps,
  });

  assert.equal(result.accepted, true);
  assert.equal(sink.all().length, 1);
});

test("ingestHit does not exclude an IP with a negative octet against a CIDR range", async () => {
  const { deps, sink } = makeDeps({ config: makeConfigPort(makeConfig({ excludedIpRanges: ["10.0.0.0/24"] })) });

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext({ ip: "1.2.3.-1" }) },
    deps,
  });

  assert.equal(result.accepted, true);
  assert.equal(sink.all().length, 1);
});

test("ingestHit does not exclude an IP with a non-numeric octet against a CIDR range", async () => {
  const { deps, sink } = makeDeps({ config: makeConfigPort(makeConfig({ excludedIpRanges: ["10.0.0.0/24"] })) });

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext({ ip: "1.2.3.abc" }) },
    deps,
  });

  assert.equal(result.accepted, true);
  assert.equal(sink.all().length, 1);
});

test("ingestHit records a null referrerHost when the beacon has no referrer", async () => {
  const { deps, sink } = makeDeps();

  const result = await ingestHit({
    input: { beacon: makeBeacon({ referrer: null }), context: makeContext() },
    deps,
  });

  assert.equal(result.accepted, true);
  assert.equal(sink.all()[0].referrerHost, null);
});

test("ingestHit records a null referrerHost when the referrer is not a parseable URL", async () => {
  const { deps, sink } = makeDeps();

  const result = await ingestHit({
    input: { beacon: makeBeacon({ referrer: "not a valid url" }), context: makeContext() },
    deps,
  });

  assert.equal(result.accepted, true);
  assert.equal(sink.all()[0].referrerHost, null);
});

test("ingestHit records a null referrerHost when the referrer URL parses but has no hostname (e.g. a file: URL)", async () => {
  const { deps, sink } = makeDeps();

  const result = await ingestHit({
    input: { beacon: makeBeacon({ referrer: "file:///path/to/file" }), context: makeContext() },
    deps,
  });

  assert.equal(result.accepted, true);
  assert.equal(sink.all()[0].referrerHost, null);
});

test("ingestHit extracts allowlisted UTM params from a query string present on beacon.path", async () => {
  const { deps, sink } = makeDeps();

  const result = await ingestHit({
    input: {
      beacon: makeBeacon({
        path: "/blog/hello-world?utm_source=newsletter&utm_medium=email&utm_campaign=launch&utm_term=tovu&utm_content=header",
      }),
      context: makeContext(),
    },
    deps,
  });

  assert.equal(result.accepted, true);
  const hit = sink.all()[0];
  assert.deepEqual(hit.utm, {
    source: "newsletter",
    medium: "email",
    campaign: "launch",
    term: "tovu",
    content: "header",
  });
});

test("ingestHit does not exclude an IP against a CIDR excludedIpRanges entry whose range address itself has an invalid octet", async () => {
  const { deps, sink } = makeDeps({ config: makeConfigPort(makeConfig({ excludedIpRanges: ["999.0.0.0/24"] })) });

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext({ ip: "203.0.113.1" }) },
    deps,
  });

  assert.equal(result.accepted, true);
  assert.equal(sink.all().length, 1);
});

test("ingestHit excludes every IP against a CIDR excludedIpRanges entry with a /0 prefix (zero-bit mask matches everything)", async () => {
  const { deps, sink } = makeDeps({ config: makeConfigPort(makeConfig({ excludedIpRanges: ["10.0.0.0/0"] })) });

  const result = await ingestHit({
    input: { beacon: makeBeacon(), context: makeContext({ ip: "203.0.113.1" }) },
    deps,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "excluded_ip");
  assert.equal(sink.all().length, 0);
});

test("ingestHit rethrows a genuinely unexpected error raised while reading event properties, instead of treating it as a policy pii_rejected outcome", async () => {
  const { deps } = makeDeps();

  const boom = new RangeError("boom: unexpected failure reading a property value");
  const eventProps = {
    get weirdGetter(): string {
      throw boom;
    },
  } as unknown as JsonObject;

  await assert.rejects(
    () =>
      ingestHit({
        input: {
          beacon: makeBeacon({ kind: "event", eventName: "signup", eventProps }),
          context: makeContext(),
        },
        deps,
      }),
    (err: unknown) => err === boom
  );
});
