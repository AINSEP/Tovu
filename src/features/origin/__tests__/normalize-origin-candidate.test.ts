import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOriginCandidate } from "../origin.js";

test("normalizeOriginCandidate accepts a plain https URL with default port", () => {
  const result = normalizeOriginCandidate("https://good.com/path");
  assert.deepEqual(result, { scheme: "https", host: "good.com", port: 443 });
});

test("normalizeOriginCandidate accepts an explicit port", () => {
  const result = normalizeOriginCandidate("https://good.com:8443/path");
  assert.deepEqual(result, { scheme: "https", host: "good.com", port: 8443 });
});

test("normalizeOriginCandidate lower-cases the host", () => {
  const result = normalizeOriginCandidate("https://GOOD.COM");
  assert.deepEqual(result, { scheme: "https", host: "good.com", port: 443 });
});

test("normalizeOriginCandidate strips a single trailing dot", () => {
  const result = normalizeOriginCandidate("https://good.com.");
  assert.deepEqual(result, { scheme: "https", host: "good.com", port: 443 });
});

test("normalizeOriginCandidate IDNA/punycode-normalizes a homoglyph host", () => {
  // Cyrillic-lookalike "gооd.com" (о = U+043E CYRILLIC SMALL LETTER O), not the
  // ASCII "good.com". Node's WHATWG URL parser converts this to its punycode
  // form rather than silently treating it as the ASCII host.
  const result = normalizeOriginCandidate("https://gооd.com");
  assert.ok(result);
  assert.notEqual(result.host, "good.com");
  assert.ok(result.host.startsWith("xn--"), `expected punycode host, got '${result.host}'`);
});

test("normalizeOriginCandidate rejects a backslash scheme-separator bypass", () => {
  assert.equal(normalizeOriginCandidate("https:/\\evil.com"), null);
});

test("normalizeOriginCandidate rejects embedded whitespace", () => {
  assert.equal(normalizeOriginCandidate("https://good.com\t.evil.com"), null);
  assert.equal(normalizeOriginCandidate("https://good.com evil.com"), null);
});

test("normalizeOriginCandidate rejects embedded control characters", () => {
  const withNullByte = "https://good.com" + String.fromCharCode(0) + ".evil.com";
  const withDelByte = "https://good.com" + String.fromCharCode(0x7f) + ".evil.com";
  assert.equal(normalizeOriginCandidate(withNullByte), null);
  assert.equal(normalizeOriginCandidate(withDelByte), null);
});

test("normalizeOriginCandidate rejects non-empty userinfo", () => {
  assert.equal(normalizeOriginCandidate("https://good.com@evil.com"), null);
  assert.equal(normalizeOriginCandidate("https://user:pass@good.com"), null);
});

test("normalizeOriginCandidate accepts http (dev-capability same-origin case), rejects everything else", () => {
  // ADR-040 Round-4 fold (R2-005): http is normalized here so a same-origin comparison against a
  // dev-capability canonical origin can match; the allowlist path enforces https-only separately
  // (see origin.test.ts's cross-origin-http-rejected case).
  assert.deepEqual(normalizeOriginCandidate("http://good.com"), { scheme: "http", host: "good.com", port: 80 });
  assert.equal(normalizeOriginCandidate("javascript:alert(1)"), null);
  assert.equal(normalizeOriginCandidate("data:text/html,evil"), null);
});

test("normalizeOriginCandidate rejects protocol-relative input", () => {
  assert.equal(normalizeOriginCandidate("//evil.com"), null);
});

test("normalizeOriginCandidate rejects unparseable input instead of throwing", () => {
  assert.equal(normalizeOriginCandidate("not a url"), null);
  assert.equal(normalizeOriginCandidate(""), null);
});

test("normalizeOriginCandidate treats good.com.evil.com as a distinct host (not good.com)", () => {
  const result = normalizeOriginCandidate("https://good.com.evil.com");
  assert.ok(result);
  assert.equal(result.host, "good.com.evil.com");
  assert.notEqual(result.host, "good.com");
});
