import assert from "node:assert/strict";
import test from "node:test";

import { isSameOriginUrl, normalizeSitePath, resolveSameOriginUrl, verifiedOriginToBaseUrl } from "@jini-ai/diagnostics/web-evidence";

/**
 * @file The same-origin boundary — the guarantee that a headless browser Tovu launches on an
 * operator's server can only ever be pointed at that operator's own site.
 *
 * This is the security-relevant half of `site_collect_page_evidence`, so the negative cases matter
 * more than the positive ones. Each rejected form below is a real technique for smuggling an
 * authority through a field that is supposed to hold a path, and each is asserted with the exact
 * reason code so a future edit that broadens one has to change a test that says why it was narrow.
 */

test("a plain path is accepted", () => {
  assert.deepEqual(normalizeSitePath({ raw: "/pricing" }), { ok: true, path: "/pricing" });
  assert.deepEqual(normalizeSitePath({ raw: "/" }), { ok: true, path: "/" });
  assert.deepEqual(normalizeSitePath({ raw: "/legal/privacy?lang=en" }), { ok: true, path: "/legal/privacy?lang=en" });
});

test("a missing leading slash is repaired, not rejected", () => {
  assert.deepEqual(normalizeSitePath({ raw: "pricing" }), { ok: true, path: "/pricing" });
});

test("surrounding whitespace is trimmed", () => {
  assert.deepEqual(normalizeSitePath({ raw: "  /pricing  " }), { ok: true, path: "/pricing" });
});

test("a fragment is stripped — it never reaches the server, so it cannot change what is observed", () => {
  assert.deepEqual(normalizeSitePath({ raw: "/pricing#plans" }), { ok: true, path: "/pricing" });
});

test("an absolute URL is refused — this is the primary off-origin vector", () => {
  for (const candidate of [
    "https://evil.example/steal",
    "http://evil.example",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,<h1>x",
    "HTTPS://evil.example",
  ]) {
    const result = normalizeSitePath({ raw: candidate });
    assert.equal(result.ok, false, `${candidate} must be refused`);
    assert.equal(result.ok === false && result.reason, "absolute-url");
  }
});

test("a protocol-relative path is refused — '//host' names a different origin", () => {
  const result = normalizeSitePath({ raw: "//evil.example/steal" });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "protocol-relative");
});

test("a backslash is refused — some URL parsers treat it as an authority separator", () => {
  for (const candidate of ["\\\\evil.example", "/ok\\..\\..", "/a\\b"]) {
    const result = normalizeSitePath({ raw: candidate });
    assert.equal(result.ok, false, `${candidate} must be refused`);
    assert.equal(result.ok === false && result.reason, "backslash");
  }
});

test("control characters and embedded whitespace are refused", () => {
  for (const candidate of ["/pric\ning", "/pric\ting", "/pric\u0000ing", "/two words"]) {
    const result = normalizeSitePath({ raw: candidate });
    assert.equal(result.ok, false, `${JSON.stringify(candidate)} must be refused`);
    assert.equal(result.ok === false && result.reason, "forbidden-character");
  }
});

test("a '..' segment is refused rather than silently resolved", () => {
  const result = normalizeSitePath({ raw: "/blog/../admin" });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "traversal");
});

test("empty and over-long paths are refused", () => {
  assert.equal(normalizeSitePath({ raw: "" }).ok, false);
  assert.equal(normalizeSitePath({ raw: "   " }).ok, false);
  const overLong = normalizeSitePath({ raw: `/${"a".repeat(2100)}` });
  assert.equal(overLong.ok, false);
  assert.equal(overLong.ok === false && overLong.reason, "too-long");
});

test("no accepted path can resolve off the origin, even adversarially", () => {
  // The real invariant, asserted end-to-end rather than by reading the regexes: whatever survives
  // normalization, joined to the origin, is still on the origin.
  const base = "https://example.test";
  const candidates = [
    "/pricing",
    "pricing",
    "/a/b/c",
    "/%2e%2e/%2e%2e/etc",
    "/:@evil.example",
    "/?next=https://evil.example",
    "/legal/privacy?a=b&c=d",
  ];
  for (const candidate of candidates) {
    const normalized = normalizeSitePath({ raw: candidate });
    if (!normalized.ok) continue;
    const url = resolveSameOriginUrl({ baseUrl: base, path: normalized.path });
    assert.equal(new URL(url).origin, "https://example.test", `${candidate} resolved off-origin to ${url}`);
    assert.equal(isSameOriginUrl({ baseUrl: base, candidateUrl: url }), true);
  }
});

test("isSameOriginUrl is the post-redirect layer: scheme, host and port must all match", () => {
  const base = "https://example.test";
  assert.equal(isSameOriginUrl({ baseUrl: base, candidateUrl: "https://example.test/anything" }), true);
  assert.equal(isSameOriginUrl({ baseUrl: base, candidateUrl: "http://example.test/anything" }), false, "scheme downgrade is off-origin");
  assert.equal(isSameOriginUrl({ baseUrl: base, candidateUrl: "https://evil.example/" }), false);
  assert.equal(isSameOriginUrl({ baseUrl: base, candidateUrl: "https://sub.example.test/" }), false, "a subdomain is a different origin");
  assert.equal(isSameOriginUrl({ baseUrl: base, candidateUrl: "https://example.test:8443/" }), false, "a different port is a different origin");
});

test("isSameOriginUrl fails closed on anything it cannot parse", () => {
  assert.equal(isSameOriginUrl({ baseUrl: "https://example.test", candidateUrl: "not a url" }), false);
  assert.equal(isSameOriginUrl({ baseUrl: "not a url", candidateUrl: "https://example.test" }), false);
  assert.equal(isSameOriginUrl({ baseUrl: "", candidateUrl: "" }), false);
});

test("verifiedOriginToBaseUrl renders scheme, host, optional port and base path", () => {
  const verifiedAt = "2026-08-26T00:00:00.000Z";
  assert.equal(
    verifiedOriginToBaseUrl({ origin: { scheme: "https", host: "example.test", verifiedAt, source: "workspace-setting" } }),
    "https://example.test",
  );
  assert.equal(
    verifiedOriginToBaseUrl({ origin: { scheme: "http", host: "localhost", port: 3000, verifiedAt, source: "dev-capability" } }),
    "http://localhost:3000",
  );
  assert.equal(
    verifiedOriginToBaseUrl({ origin: { scheme: "https", host: "example.test", basePath: "/site", verifiedAt, source: "workspace-setting" } }),
    "https://example.test/site",
  );
});

test("a base path is preserved when a page path is joined onto it", () => {
  assert.equal(resolveSameOriginUrl({ baseUrl: "https://example.test/site", path: "/pricing" }), "https://example.test/site/pricing");
  assert.equal(resolveSameOriginUrl({ baseUrl: "https://example.test/site/", path: "/pricing" }), "https://example.test/site/pricing");
  assert.equal(resolveSameOriginUrl({ baseUrl: "https://example.test", path: "/pricing" }), "https://example.test/pricing");
});

test("resolveSameOriginUrl cannot be made to leave the origin even by a caller that skipped normalizeSitePath", () => {
  // Defense in depth. `normalizeSitePath` already refuses every input below; this asserts the join
  // itself is safe for a future caller that reaches this function directly.
  for (const hostile of ["//evil.example/x", "///evil.example/x", "///evil.example"]) {
    const url = resolveSameOriginUrl({ baseUrl: "https://example.test/site", path: hostile });
    assert.equal(new URL(url).origin, "https://example.test", `${hostile} escaped to ${url}`);
  }
});
