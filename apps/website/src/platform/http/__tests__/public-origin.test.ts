import assert from "node:assert/strict";
import test from "node:test";

import type { Request } from "express";

import { isHttpsRequest, resolvePublicOrigin, resolveProtocol } from "../public-origin.js";

/**
 * @file Unit coverage for `resolveProtocol`/`isHttpsRequest`/`resolvePublicOrigin`, tested in
 * isolation from Express/HTTP (mirrors `rate-limit.test.ts`'s `resolveClientIp` fake-request
 * pattern). `admin-connectors-oauth.test.ts` already proves the real end-to-end OAuth-callback
 * behavior these functions back; this file's job is the branch/edge coverage that a full HTTP
 * round trip can't cheaply reach — array-valued and malformed `X-Forwarded-Proto` values, the
 * `TOVU_PUBLIC_URL` override and its invalid-URL failure mode, and the no-`Host`-header fallback.
 */

/** Builds a minimal fake `Request` carrying only what these functions read. */
function fakeRequest(options: {
  forwardedProto?: string | string[];
  protocol?: string;
  host?: string;
}): Request {
  const headers: Record<string, string | string[] | undefined> = {};
  if (options.forwardedProto !== undefined) headers["x-forwarded-proto"] = options.forwardedProto;
  return {
    headers,
    protocol: options.protocol ?? "http",
    get(name: string): string | undefined {
      return name.toLowerCase() === "host" ? options.host : undefined;
    },
  } as unknown as Request;
}

test("resolveProtocol: no X-Forwarded-Proto header falls back to req.protocol", () => {
  const req = fakeRequest({ protocol: "http" });
  assert.equal(resolveProtocol(req), "http");
});

test("resolveProtocol: a plain string X-Forwarded-Proto: https is honored", () => {
  const req = fakeRequest({ forwardedProto: "https", protocol: "http" });
  assert.equal(resolveProtocol(req), "https");
});

test("resolveProtocol: an array-valued header (Node lowercases repeated headers into an array) uses the first entry", () => {
  const req = fakeRequest({ forwardedProto: ["https", "http"], protocol: "http" });
  assert.equal(resolveProtocol(req), "https");
});

test("resolveProtocol: an empty array-valued header falls back to req.protocol", () => {
  const req = fakeRequest({ forwardedProto: [], protocol: "http" });
  assert.equal(resolveProtocol(req), "http");
});

test("resolveProtocol: a comma-separated multi-hop value uses only the first, trimmed hop", () => {
  const req = fakeRequest({ forwardedProto: " https , http", protocol: "http" });
  assert.equal(resolveProtocol(req), "https");
});

test("resolveProtocol: is case-insensitive", () => {
  const req = fakeRequest({ forwardedProto: "HTTPS", protocol: "http" });
  assert.equal(resolveProtocol(req), "https");
});

test("resolveProtocol: an unrecognized forwarded value falls back to req.protocol rather than trusting it", () => {
  const req = fakeRequest({ forwardedProto: "ftp", protocol: "https" });
  assert.equal(resolveProtocol(req), "https");
});

test("isHttpsRequest: true when the resolved protocol is https", () => {
  const req = fakeRequest({ forwardedProto: "https", protocol: "http" });
  assert.equal(isHttpsRequest(req), true);
});

test("isHttpsRequest: false when the resolved protocol is http", () => {
  const req = fakeRequest({ protocol: "http" });
  assert.equal(isHttpsRequest(req), false);
});

test("resolvePublicOrigin: TOVU_PUBLIC_URL, when configured, wins over the request entirely", () => {
  const original = process.env.TOVU_PUBLIC_URL;
  process.env.TOVU_PUBLIC_URL = "https://pinned.example.com:8443/base";
  try {
    const req = fakeRequest({ forwardedProto: "http", protocol: "http", host: "attacker.example.com" });
    assert.equal(resolvePublicOrigin(req), "https://pinned.example.com:8443");
  } finally {
    if (original === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = original;
  }
});

test("resolvePublicOrigin: a whitespace-only TOVU_PUBLIC_URL is treated as unset", () => {
  const original = process.env.TOVU_PUBLIC_URL;
  process.env.TOVU_PUBLIC_URL = "   ";
  try {
    const req = fakeRequest({ protocol: "http", host: "example.com" });
    assert.equal(resolvePublicOrigin(req), "http://example.com");
  } finally {
    if (original === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = original;
  }
});

test("resolvePublicOrigin: a non-http(s) TOVU_PUBLIC_URL throws TypeError rather than minting an unreachable callback", () => {
  const original = process.env.TOVU_PUBLIC_URL;
  process.env.TOVU_PUBLIC_URL = "ftp://example.com";
  try {
    const req = fakeRequest({ protocol: "http", host: "example.com" });
    assert.throws(() => resolvePublicOrigin(req), TypeError);
  } finally {
    if (original === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = original;
  }
});

test("resolvePublicOrigin: with no env override, builds from the resolved protocol and Host header", () => {
  const original = process.env.TOVU_PUBLIC_URL;
  delete process.env.TOVU_PUBLIC_URL;
  try {
    const req = fakeRequest({ forwardedProto: "https", protocol: "http", host: "app.example.com" });
    assert.equal(resolvePublicOrigin(req), "https://app.example.com");
  } finally {
    if (original === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = original;
  }
});

test("resolvePublicOrigin: with no Host header at all, falls back to localhost", () => {
  const original = process.env.TOVU_PUBLIC_URL;
  delete process.env.TOVU_PUBLIC_URL;
  try {
    const req = fakeRequest({ protocol: "http" });
    assert.equal(resolvePublicOrigin(req), "http://localhost");
  } finally {
    if (original === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = original;
  }
});
