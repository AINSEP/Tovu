import assert from "node:assert/strict";
import test from "node:test";

import { redactSecretShapes } from "#src/contracts/core/secret-redaction";
import { createLogBuffer } from "../../log-buffer.js";

const identity = (text: string) => text;
const tovuRedact = (text: string) => redactSecretShapes({ text }).text;
const fixedClock = () => new Date("2026-10-05T12:00:00.000Z");

test('metadata is captured per record, survives eviction, and never borrows an inactive trace', () => {
  let trace: { traceId: string; spanId: string } | undefined;
  const buffer = createLogBuffer({ redact: identity }, { maxEntries: 1,
    metadata: () => ({ release: 'tovu@1.2.3+abcdef0', environment: 'local', ...trace }),
  });
  buffer.append({ level: 'info', source: 'server', message: 'boot' });
  trace = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) };
  const active = buffer.append({ level: 'error', source: 'daemon', message: 'failed' });
  assert.equal(active.release, 'tovu@1.2.3+abcdef0');
  assert.equal(active.environment, 'local');
  assert.equal(active.traceId, trace.traceId);
  assert.equal(active.spanId, trace.spanId);
  trace = undefined;
  const outside = buffer.append({ level: 'info', source: 'daemon', message: 'outside' });
  assert.equal(outside.traceId, undefined);
  assert.equal(outside.spanId, undefined);
  assert.equal(outside.release, active.release);
  assert.equal(buffer.entries().length, 1);
  assert.equal(active.traceId, 'a'.repeat(32), 'later context changes cannot rewrite a record');
});

test("overflow drops the oldest entries first and keeps seq monotonic", () => {
  const buffer = createLogBuffer({ redact: identity }, { maxEntries: 3, now: fixedClock });
  for (const message of ["a", "b", "c", "d", "e"]) buffer.append({ level: "info", source: "server", message });
  assert.deepEqual(buffer.entries().map(e => [e.seq, e.message]), [[3, "c"], [4, "d"], [5, "e"]]);
  assert.equal(buffer.appendedCount(), 5);
});

test("the byte cap evicts old lines but always keeps the newest one", () => {
  const buffer = createLogBuffer({ redact: identity }, { maxBytes: 10, now: fixedClock });
  buffer.append({ level: "info", source: "server", message: "12345" });
  buffer.append({ level: "info", source: "server", message: "67890" });
  buffer.append({ level: "info", source: "server", message: "abc" });
  assert.deepEqual(buffer.entries().map(e => e.message), ["67890", "abc"]);
  buffer.append({ level: "error", source: "server", message: "x".repeat(50) });
  assert.deepEqual(buffer.entries().map(e => e.message.length), [50]);
});

test("a single oversized message is truncated with a marker", () => {
  const buffer = createLogBuffer({ redact: identity }, { maxMessageLength: 5, now: fixedClock });
  assert.equal(buffer.append({ level: "info", source: "server", message: "abcdefghij" }).message, "abcde… [truncated 5 chars]");
});

test("entries carry time, level and source; entries() is a copy", () => {
  const buffer = createLogBuffer({ redact: identity }, { now: fixedClock });
  buffer.append({ level: "warn", source: "daemon", message: "careful" });
  const copy = buffer.entries() as unknown[];
  copy.length = 0;
  assert.deepEqual(buffer.entries(), [{ seq: 1, at: "2026-10-05T12:00:00.000Z", level: "warn", source: "daemon", message: "careful" }]);
});

test("many evictions compact without losing order", () => {
  const buffer = createLogBuffer({ redact: identity }, { maxEntries: 10, now: fixedClock });
  for (let i = 0; i < 5_000; i += 1) buffer.append({ level: "info", source: "server", message: String(i) });
  assert.deepEqual(buffer.entries().map(e => e.message), Array.from({ length: 10 }, (_, i) => String(4_990 + i)));
});

test("a long live tail survives eviction before and after compaction", () => {
  const buffer = createLogBuffer({ redact: identity }, { maxEntries: 2_048, now: fixedClock });
  for (let i = 0; i < 5_000; i += 1) buffer.append({ level: "info", source: "server", message: String(i) });
  assert.deepEqual(buffer.entries().map(e => [e.seq, e.message]),
    Array.from({ length: 2_048 }, (_, i) => [2_953 + i, String(2_952 + i)]));
  assert.equal(buffer.appendedCount(), 5_000);
});

test("omitting options uses the current clock and the default retention and message limits", t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-05T12:00:00.000Z") });
  const buffer = createLogBuffer({ redact: identity });
  assert.deepEqual(buffer.append({ level: "info", source: "server", message: "x".repeat(8_001) }), {
    seq: 1, at: "2026-10-05T12:00:00.000Z", level: "info", source: "server",
    message: `${"x".repeat(8_000)}… [truncated 1 chars]`,
  });
  for (let i = 0; i < 2_000; i += 1) buffer.append({ level: "info", source: "server", message: String(i) });
  assert.deepEqual(buffer.entries().map(e => e.message), Array.from({ length: 2_000 }, (_, i) => String(i)));
});

// Obviously fake fixtures in real credential SHAPES, assembled at runtime so no literal resembles a key.
const FAKE_SECRETS: Record<string, string> = {
  anthropic: "sk-ant-api03-" + "x".repeat(90),
  openai: "sk-proj-" + "y".repeat(40),
  githubPat: "ghp_" + "a1".repeat(18),
  awsAccessKey: "AKIA" + "Q".repeat(16),
  googleApiKey: "AIza" + "z".repeat(35),
  stripe: "sk_live_" + "k".repeat(24),
  slack: "xoxb-" + "1".repeat(12) + "-" + "2".repeat(12) + "-" + "w".repeat(24),
  npm: "npm_" + "n".repeat(36),
};

test("every message is redacted on write with Tovu's redactor, across real credential shapes", () => {
  const buffer = createLogBuffer({ redact: tovuRedact }, { now: fixedClock });
  for (const [name, secret] of Object.entries(FAKE_SECRETS)) {
    const stored = buffer.append({ level: "error", source: "server", message: `[provider] ${name} call failed with key ${secret}` }).message;
    assert.ok(!stored.includes(secret), `${name} leaked: ${stored}`);
    assert.match(stored, /\[REDACTED:[a-z_]+\]/, `${name} not marked: ${stored}`);
    assert.ok(stored.startsWith(`[provider] ${name} call failed with key `), `${name} lost its prose: ${stored}`);
  }
});

test("labeled secrets, bearer headers, URL credentials and Tovu keys are redacted; paths and hosts stay", () => {
  const buffer = createLogBuffer({ redact: tovuRedact }, { now: fixedClock });
  const keySecret = "s".repeat(30);
  const lines = [
    ["password=hunter2hunter2 at /Users/me/site/.env", "hunter2hunter2", "/Users/me/site/.env"],
    ["Authorization: Bearer eyJ" + "t".repeat(40), "eyJ" + "t".repeat(40), "Authorization: Bearer "],
    ["db postgres://admin:fakepass123@db.example.com:5432/app", "fakepass123", "@db.example.com:5432/app"],
    [`tovu_ak_0123456789ab.${keySecret}`, keySecret, "tovu_ak_0123456789ab."],
    [`{"apiKey":"${"v".repeat(32)}"}`, "v".repeat(32), "apiKey"],
  ];
  for (const [message, secret, kept] of lines) {
    const stored = buffer.append({ level: "error", source: "server", message }).message;
    assert.ok(!stored.includes(secret), `leaked: ${stored}`);
    assert.ok(stored.includes(kept), `lost context "${kept}": ${stored}`);
  }
});

test("redaction runs before truncation, so a key cut at the cap cannot leak its prefix half", () => {
  const secret = FAKE_SECRETS.anthropic;
  const buffer = createLogBuffer({ redact: tovuRedact }, { maxMessageLength: 30, now: fixedClock });
  const stored = buffer.append({ level: "error", source: "server", message: `key=${secret}` }).message;
  assert.ok(!stored.includes(secret.slice(0, 20)), stored);
});

test("subscribers get each stored, redacted entry; a throwing subscriber does not break append", () => {
  const buffer = createLogBuffer({ redact: tovuRedact }, { now: fixedClock });
  const seen: string[] = [];
  buffer.subscribe(() => { throw new Error("broken sink"); });
  const unsubscribe = buffer.subscribe(entry => seen.push(entry.message));
  buffer.append({ level: "error", source: "server", message: `key ${FAKE_SECRETS.githubPat}` });
  unsubscribe();
  buffer.append({ level: "error", source: "server", message: "after unsubscribe" });
  assert.deepEqual(seen, ["key [REDACTED:credential]"]);
});
