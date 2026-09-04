import assert from "node:assert/strict";
import test from "node:test";

import { deriveDevScheme, resolveDevTls, resolveDevTlsCertPaths } from "../dev-tls.js";

/**
 * @file Regression coverage for `dev-tls.ts` — the gate that decides whether `index.ts` terminates
 * TLS itself, so the printed `tovu server running on http://…` line (previously hardcoded, always
 * wrong once TLS was active) stays true, and so the same "cert files present -> HTTPS" contract
 * `apps/admin/vite.config.ts` already uses does not silently diverge between the two dev servers.
 */

test("resolveDevTlsCertPaths resolves the cert and key under <repoRoot>/.certs/", () => {
  const paths = resolveDevTlsCertPaths("/repo");
  assert.equal(paths.certPath, "/repo/.certs/localhost.pem");
  assert.equal(paths.keyPath, "/repo/.certs/localhost-key.pem");
});

test("resolveDevTls: active with loaded credentials when both cert and key exist and TLS is not disabled", () => {
  const paths = { certPath: "/repo/.certs/localhost.pem", keyPath: "/repo/.certs/localhost-key.pem" };
  const result = resolveDevTls(paths, {
    existsSync: () => true,
    readFileSync: (p) => Buffer.from(`content of ${p}`),
    env: {},
  });
  assert.equal(result.active, true);
  assert.equal(result.credentials?.cert.toString(), "content of /repo/.certs/localhost.pem");
  assert.equal(result.credentials?.key.toString(), "content of /repo/.certs/localhost-key.pem");
});

test("resolveDevTls: inactive, no credentials, when the cert file is missing", () => {
  const paths = { certPath: "/repo/.certs/localhost.pem", keyPath: "/repo/.certs/localhost-key.pem" };
  const result = resolveDevTls(paths, {
    existsSync: (p) => p !== paths.certPath,
    readFileSync: () => assert.fail("must not read a PEM file when the gate is closed"),
    env: {},
  });
  assert.deepEqual(result, { active: false });
});

test("resolveDevTls: inactive, no credentials, when the key file is missing", () => {
  const paths = { certPath: "/repo/.certs/localhost.pem", keyPath: "/repo/.certs/localhost-key.pem" };
  const result = resolveDevTls(paths, {
    existsSync: (p) => p !== paths.keyPath,
    readFileSync: () => assert.fail("must not read a PEM file when the gate is closed"),
    env: {},
  });
  assert.deepEqual(result, { active: false });
});

test("resolveDevTls: inactive when TOVU_DISABLE_DEV_TLS is set, even with both files present", () => {
  // The Playwright/E2E escape hatch: a hermetic webServer must not have its scheme flipped just
  // because the OPERATOR's machine happens to have mkcert certs for their own interactive session.
  const paths = { certPath: "/repo/.certs/localhost.pem", keyPath: "/repo/.certs/localhost-key.pem" };
  const result = resolveDevTls(paths, {
    existsSync: () => true,
    readFileSync: () => assert.fail("must not read a PEM file when TLS is explicitly disabled"),
    env: { TOVU_DISABLE_DEV_TLS: "1" },
  });
  assert.deepEqual(result, { active: false });
});

test("deriveDevScheme: true -> https, false -> http", () => {
  assert.equal(deriveDevScheme(true), "https");
  assert.equal(deriveDevScheme(false), "http");
});
