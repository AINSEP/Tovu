import assert from "node:assert/strict";
import test from "node:test";

import { redactSecretShapes } from "#src/contracts/core/secret-redaction";
import { createLogBuffer } from "../../log-buffer.js";

const identity = (text: string) => text;
const tovuRedact = (text: string) => redactSecretShapes({ text }).text;
const fixedClock = () => new Date("2026-10-05T12:00:00.000Z");

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
