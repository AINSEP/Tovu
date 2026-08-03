import assert from "node:assert/strict";
import test from "node:test";

import type { ClockPort, IdGeneratorPort, JsonObject, UUID } from "@jini-ai/cms/core";
import { AnalyticsPiiRejectedError, type AnalyticsConfigPort } from "../ports";
import {
  ingestHit,
  normalizeIngestContext,
  validateEventProps,
  type IngestHitDeps,
} from "../ingest";
import { LocalBufferSink } from "../repo.memory";
import type { AnalyticsSiteConfig, IngestBeacon, IngestContext } from "../types";

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
