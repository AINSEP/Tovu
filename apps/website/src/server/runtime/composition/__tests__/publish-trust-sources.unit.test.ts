import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { PublishTrustRevocationPort } from "#src/features/publish-trust/revocations";
import { createPublishTrustGrantResolver } from "../publish-trust-grants.js";
import { createPublishTrustRevocationReader } from "../publish-trust-revocations.js";

/**
 * @file Direct coverage for the two composition-root readers the publishing gate consults:
 * `publish-trust-grants.ts` (env + committed config file, read once) and
 * `publish-trust-revocations.ts` (the deny list, read per request, never throwing).
 *
 * The gate's HTTP suites only ever ran these through a readable env var and a readable store, so
 * the branches that decide what a BROKEN source means — an unreadable config, an unreadable deny
 * list — and the env-vs-file precedence were unpinned. A resolver that collapsed `""` to unset, or
 * a revocation reader that let a store error escape as a 500, would have shipped green.
 *
 * The config file lives under `TOVU_REPO_ROOT` (`deploy/publish-trust.json`); each test gets its
 * own temp root via the resolver's `env` parameter, so `process.env` is never touched.
 */

const CONFIG_REL = path.join("deploy", "publish-trust.json");

function tempRoot(t: import("node:test").TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-publish-trust-src-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "deploy"));
  return root;
}

test("grants: no env var and no committed file → absent, no grants", async (t) => {
  const root = tempRoot(t);
  const resolve = createPublishTrustGrantResolver({ TOVU_REPO_ROOT: root });

  assert.deepEqual(await resolve(), { state: "absent", origin: "none", grants: [], reason: null });
});

test("grants: an EMPTY env var is the kill switch — revoked from env, and the committed file is not consulted", async (t) => {
  const root = tempRoot(t);
  fs.writeFileSync(path.join(root, CONFIG_REL), "this would be invalid if it were read");
  const resolve = createPublishTrustGrantResolver({ TOVU_REPO_ROOT: root, TOVU_PUBLISH_TRUST: "" });

  assert.deepEqual(await resolve(), { state: "revoked", origin: "env", grants: [], reason: null });
});

test("grants: with no env var, the committed file under TOVU_REPO_ROOT is what is read", async (t) => {
  const root = tempRoot(t);
  fs.writeFileSync(path.join(root, CONFIG_REL), "{not json");
  const resolution = await createPublishTrustGrantResolver({ TOVU_REPO_ROOT: root })();

  assert.equal(resolution.state, "invalid");
  assert.equal(resolution.origin, "file");
  assert.deepEqual(resolution.grants, []);
});

test("grants: read once per process — a later change to the file is not seen by the same resolver", async (t) => {
  const root = tempRoot(t);
  const resolve = createPublishTrustGrantResolver({ TOVU_REPO_ROOT: root });

  const first = await resolve();
  fs.writeFileSync(path.join(root, CONFIG_REL), "{not json");
  const second = await resolve();

  assert.equal(second, first, "the cached resolution object itself is served");
  assert.equal(second.state, "absent");
});

test("grants: an unreadable config resolves to invalid with a plain reason (never rejects), and the failure is NOT cached", async (t) => {
  const root = tempRoot(t);
  // A directory where the file should be: readFile fails with EISDIR, which is not the
  // "missing file" case the file IO maps to null.
  fs.mkdirSync(path.join(root, CONFIG_REL));
  const resolve = createPublishTrustGrantResolver({ TOVU_REPO_ROOT: root });

  const failed = await resolve();
  assert.equal(failed.state, "invalid");
  assert.equal(failed.origin, "none");
  assert.deepEqual(failed.grants, []);
  assert.match(failed.reason ?? "", /^the publishing config could not be read: .*EISDIR/);

  fs.rmdirSync(path.join(root, CONFIG_REL));
  assert.deepEqual(await resolve(), { state: "absent", origin: "none", grants: [], reason: null }, "the next call re-reads after a failure");
});

function revocationPort(list: () => Promise<unknown>): PublishTrustRevocationPort & { calls: number } {
  const port = {
    calls: 0,
    list: async () => {
      port.calls += 1;
      return list();
    },
  };
  return port as unknown as PublishTrustRevocationPort & { calls: number };
}

test("revocations: a readable deny list is passed through unchanged, and the store is re-read on every call", async () => {
  const read = { ok: true as const, revocations: [{ sourceInstallationId: "src-1" }] };
  const port = revocationPort(async () => read);
  const reader = createPublishTrustRevocationReader(port);

  assert.equal(await reader(), read);
  await reader();
  assert.equal(port.calls, 2, "a disconnect must bite on the next request, so nothing is cached");
});

test("revocations: a store that throws becomes { ok: false } with a plain reason — never a rejection", async () => {
  const reader = createPublishTrustRevocationReader(revocationPort(async () => {
    throw new Error("database is locked");
  }));

  assert.deepEqual(await reader(), {
    ok: false,
    reason: "the list of disconnected computers could not be read: database is locked",
  });
});

test("revocations: a non-Error throw still becomes { ok: false } with the generic reason", async () => {
  const reader = createPublishTrustRevocationReader(revocationPort(async () => {
    throw "boom";
  }));

  assert.deepEqual(await reader(), { ok: false, reason: "the list of disconnected computers could not be read: unknown error" });
});
