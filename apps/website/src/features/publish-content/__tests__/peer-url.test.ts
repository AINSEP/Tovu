import assert from "node:assert/strict";
import test from "node:test";

import { normalizePeerBaseUrl, peerHostname, peerUrl } from "../peer-url.js";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 10.
 *
 * Pins `peer-url.ts`'s refusal pipeline, including the ONE place it deliberately differs from
 * `features/origin/configured-origin.ts` (a private/loopback host is ACCEPTED here — see that
 * file's header for why, and `peer-transport.test.ts` for what refuses it instead).
 */

test("normalizePeerBaseUrl refuses a non-https scheme", () => {
  const result = normalizePeerBaseUrl("http://tovu.example.com");
  assert.deepEqual(result, { error: "baseUrl was refused because its scheme must be https" });
});

test("normalizePeerBaseUrl refuses a userinfo component", () => {
  const result = normalizePeerBaseUrl("https://user:pass@tovu.example.com");
  assert.deepEqual(result, { error: "baseUrl was refused because it carries a userinfo component" });
});

test("normalizePeerBaseUrl refuses a query string or fragment", () => {
  assert.deepEqual(normalizePeerBaseUrl("https://tovu.example.com?a=1"), {
    error: "baseUrl was refused because it carries a query string or fragment",
  });
  assert.deepEqual(normalizePeerBaseUrl("https://tovu.example.com#x"), {
    error: "baseUrl was refused because it carries a query string or fragment",
  });
});

test("normalizePeerBaseUrl refuses a control character or backslash before the parser can normalize it away", () => {
  assert.deepEqual(normalizePeerBaseUrl("https://tovu.example.com\\evil"), {
    error: "baseUrl carries a backslash, whitespace or control character",
  });
  assert.deepEqual(normalizePeerBaseUrl("https://tovu.example.com/a\u0000b"), {
    error: "baseUrl carries a backslash, whitespace or control character",
  });
});

test("normalizePeerBaseUrl refuses a blank or unparseable value", () => {
  assert.deepEqual(normalizePeerBaseUrl("   "), { error: "baseUrl is required" });
  assert.deepEqual(normalizePeerBaseUrl("not-a-url"), { error: "baseUrl is not a parseable URL" });
});

test("normalizePeerBaseUrl lower-cases the host, strips a trailing dot and strips trailing slashes", () => {
  assert.deepEqual(normalizePeerBaseUrl("https://Tovu.Example.COM./"), { baseUrl: "https://tovu.example.com" });
  assert.deepEqual(normalizePeerBaseUrl("https://tovu.example.com:8443/tovu///"), {
    baseUrl: "https://tovu.example.com:8443/tovu",
  });
});

test("normalizePeerBaseUrl ACCEPTS a private or loopback host — the egress policy, not this validator, decides", () => {
  // Deliberate divergence from `configured-origin.ts`, and load-bearing for vendor neutrality: a
  // peer on Railway/Render internal DNS, in an AWS VPC, or on a dev machine's loopback must be
  // storable. `EgressPolicy.denyPrivateAddresses` + `devHostAllowlist` refuse it at send time.
  assert.deepEqual(normalizePeerBaseUrl("https://localhost:4321"), { baseUrl: "https://localhost:4321" });
  assert.deepEqual(normalizePeerBaseUrl("https://10.1.2.3"), { baseUrl: "https://10.1.2.3" });
  assert.deepEqual(normalizePeerBaseUrl("https://web.railway.internal"), { baseUrl: "https://web.railway.internal" });
});

test("peerUrl joins a normalized base with an absolute route path without doubling the slash", () => {
  assert.equal(peerUrl("https://tovu.example.com", "/api/admin/v1/x"), "https://tovu.example.com/api/admin/v1/x");
  assert.equal(peerUrl("https://tovu.example.com/tovu", "/api/admin/v1/x"), "https://tovu.example.com/tovu/api/admin/v1/x");
});

test("peerHostname returns the bracket-stripped hostname devHostAllowlist is matched against", () => {
  assert.equal(peerHostname("https://tovu.example.com:8443/base"), "tovu.example.com");
  // `client.ts` strips IPv6 brackets before the allowlist lookup, so an entry is written without
  // them — this is the exact string an operator must add.
  assert.equal(peerHostname("https://[fd00::1]:3000"), "fd00::1");
});
