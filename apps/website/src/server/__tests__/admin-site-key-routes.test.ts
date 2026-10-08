import { LEGACY_SITE_KEY_FILENAME } from "#src/features/webhooks/site-key-sources";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { sql } from "kysely";

import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { openPgliteKernel } from "#src/platform/db/kernel/drivers/pglite";

import { CONTENT_DB_FILENAME } from "#src/platform/site-dir/layout";
import { FixedSiteKeyKeyring, fingerprintSiteKeyHex } from "#src/features/webhooks/keyring.env";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { buildCustomCredentialAad } from "#src/features/custom-credentials/aad";
import { readSealedConnectionString, writeSealedConnectionString } from "../runtime/composition/storage-secret.js";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import { bootAuthenticated, loginAsBarePrincipal, startTestServer } from "./helpers/http-test-server.js";

/**
 * @file Route-level coverage for `GET`/`POST .../reveal`/`POST .../generate` under
 * `/api/admin/v1/workspaces/:workspaceId/system/site-key` (`routes/system/site-key.ts`).
 *
 * 2026-09-14 hardening (ADS-memory design doc `2026-09-14-site-key-regenerate-and-desktop-key-
 * source-design.md`, §3.11 item 1 + item 2): before this pass, every verb here checked only the
 * `admin.security.site-key.manage` permission — never the credential kind — so an `api_key` whose
 * issuance snapshot carried that permission (any key minted from the built-in `admin` policy, or
 * from a custom role granted `admin.integrations.manage`) could read and mint the one value that
 * decrypts every other stored credential this install holds. This file's first block proves that
 * gap is closed the same way `server/__tests__/api-key-routes.test.ts` proves the api-keys family's
 * own escalation guard: mint a real api_key holding the exact permission, then prove refusal is
 * about the CREDENTIAL TYPE, not a missing grant.
 *
 * `isolateHomeDir` exists because `inspectSiteKeyMaterial`/`revealSiteKeyMaterial`/
 * `generateFileSiteKey` resolve their key-FILE fallback from `defaultSiteKeyFilePath()` — which is
 * `homedir()`-based in local/dev mode (the mode this test process runs in, `TOVU_RUNTIME_MODE`
 * unset) — with NO per-call override. Every test that exercises a real 200/201 response redirects
 * `HOME` to a throwaway temp dir first, so a passing test run never reads, creates, or touches the
 * operator's actual `~/.tovu/integrations-site-key.hex`. Reveal is compared with the generated
 * fixture key so a correctly sized but unusable backup value cannot pass.
 */

const WORKSPACE = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE}/system/site-key`;

test.beforeEach((t) => {
  // A per-test hook always receives that test's own TestContext; @types/node types every hook
  // argument as `TestContext | SuiteContext`, so narrow before using `t.after`/`t.mock`.
  if (!("mock" in t)) throw new Error("beforeEach expected a TestContext");
  for (const name of ["TOVU_SITE_KEY", "TOVU_RUNTIME_MODE"]) {
    const original = process.env[name];
    delete process.env[name];
    t.after(() => {
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    });
  }
});

/** The seeded built-in policies, by their seed names (mirrors `api-key-routes.test.ts`'s own). */
async function builtinPolicyId(baseUrl: string, cookie: string, name: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/policies`, { headers: { cookie } });
  const body = (await res.json()) as { policies: Array<{ id: string; name: string }> };
  const policy = body.policies.find((row) => row.name === name);
  assert.ok(policy, `seed created the ${name} policy`);
  return policy.id;
}

/** Mints a grantless api_key principal, issues a key against the named built-in policy, and
 *  returns the ready-to-use `Authorization` header. Mirrors `api-key-routes.test.ts`'s
 *  `mintPrincipal`/`issuedKey` pair, trimmed to the one shape this file needs. */
async function issueApiKeyBearer(
  baseUrl: string,
  ownerCookie: string,
  policyName: string
): Promise<{ authorization: string }> {
  const principalRes = await fetch(`${baseUrl}/api/admin/v1/api-keys/principals`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ displayName: `site-key-probe-${Math.random().toString(36).slice(2, 8)}` }),
  });
  assert.equal(principalRes.status, 201);
  const principal = ((await principalRes.json()) as { principal: { id: string } }).principal;

  const policyId = await builtinPolicyId(baseUrl, ownerCookie, policyName);
  const issueRes = await fetch(`${baseUrl}/api/admin/v1/api-keys`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ principalId: principal.id, label: "site-key-probe", policyIds: [policyId] }),
  });
  assert.equal(issueRes.status, 201);
  const apiKey = ((await issueRes.json()) as { apiKey: { rawKey: string } }).apiKey;
  return { authorization: `Bearer ${apiKey.rawKey}` };
}

/** Redirects `homedir()`-based default key-file resolution to a throwaway temp directory for the
 *  life of one test, and removes it on teardown — see this file's header for why this exists. */
function isolateHomeDir(t: import("node:test").TestContext): void {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-site-key-test-home-"));
  const originalHome = process.env.HOME;
  process.env.HOME = dir;
  t.after(() => {
    process.env.HOME = originalHome;
    rmSync(dir, { recursive: true, force: true });
  });
}

/**
 * Redirects `describeSiteBinding()`'s `siteBinding.dir` (`resolveSiteRoot`'s `TOVU_SITE_DIR`
 * precedence) to a throwaway temp directory for the life of one test, and removes it on teardown.
 *
 * Exists because `createRouteDeps()` calls `describeSiteBinding()` with no override, which
 * otherwise resolves to the REAL `<repo-root>/sites/tovu-com` — the actual live dev site, whose
 * real `content.db` already holds genuine sealed credential rows. Any test that exercises the
 * `state` field's `missing`/`missing-with-data` branches (site-key plan §A.6) MUST call this
 * before `createRouteDeps()`, or it silently depends on that real site's current data shape
 * instead of a deterministic fixture. A read of the real `content.db` is safe
 * (`findKeyDependentData` opens read-only); this helper exists so no test needs to rely on that —
 * every state-asserting test gets its own empty site dir with no `content.db` at all.
 */
function isolateSiteDir(t: import("node:test").TestContext): void {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-site-key-test-site-"));
  const originalSiteDir = process.env.TOVU_SITE_DIR;
  process.env.TOVU_SITE_DIR = dir;
  t.after(() => {
    if (originalSiteDir === undefined) delete process.env.TOVU_SITE_DIR;
    else process.env.TOVU_SITE_DIR = originalSiteDir;
    rmSync(dir, { recursive: true, force: true });
  });
}

/**
 * Every test here must run against a temp site dir ({@link isolateSiteDir}): `generate` stamps
 * `.site-meta.json` and GET scans `content.db` at `siteBinding.dir`, which otherwise resolves to the
 * REAL `<repo-root>/sites/tovu-com`. Asserted after every `createRouteDeps()` so a new test that
 * forgets the isolation fails instead of touching the live dev site.
 */
function assertSiteDirIsolated(deps: { siteBinding: { dir: string } }): void {
  assert.ok(
    path.resolve(deps.siteBinding.dir).startsWith(path.resolve(tmpdir())),
    `siteBinding.dir must be a temp dir, got ${deps.siteBinding.dir} — call isolateSiteDir(t) before createRouteDeps()`
  );
}

test("an api_key holding admin.security.site-key.manage is refused 403 on GET status, reveal, and generate", async (t) => {
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // The admin built-in policy carries admin.security.site-key.manage (site-key-permission.ts's
  // registerSiteKeyPermissionGrants), so this key genuinely holds the permission every verb below gates
  // on — any refusal is therefore about the credential type, not a missing grant.
  const bearer = await issueApiKeyBearer(baseUrl, cookie, "admin-builtin-policy");
  const me = await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: bearer });
  const meBody = (await me.json()) as { effectivePermissions: string[] };
  assert.ok(
    meBody.effectivePermissions.includes("admin.security.site-key.manage"),
    "the probe key really does hold admin.security.site-key.manage"
  );

  const attempts: Array<{ method: "GET" | "POST"; url: string }> = [
    { method: "GET", url: BASE },
    { method: "POST", url: `${BASE}/reveal` },
    { method: "POST", url: `${BASE}/generate` },
    { method: "POST", url: `${BASE}/import` },
    { method: "GET", url: `${BASE}/start-fresh` },
    { method: "POST", url: `${BASE}/start-fresh` },
  ];
  for (const attempt of attempts) {
    const res = await fetch(`${baseUrl}${attempt.url}`, { method: attempt.method, headers: bearer });
    assert.equal(res.status, 403, `refused: ${attempt.method} ${attempt.url}`);
    const body = (await res.json()) as {
      code: string;
      details: { permission: string; reason: string };
    };
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.details.reason, "credential_kind_not_permitted");
    assert.equal(body.details.permission, "admin.security.site-key.manage");
    assert.equal("hex" in body, false, "a refused body never carries key material");
  }
});

test("session callers keep working: GET, reveal, and generate all still succeed for an admin session", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const renamedStatus = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/system/site-key`, { headers: { cookie } });
  assert.equal(renamedStatus.status, 200, "C2: authenticated status is available at the site-key route");
  const retiredPath = ["site", "token"].join("-");
  for (const [method, suffix] of [["GET", ""], ["POST", "/reveal"], ["POST", "/generate"], ["POST", "/import"], ["GET", "/start-fresh"], ["POST", "/start-fresh"]] as const) {
    const retired = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/system/${retiredPath}${suffix}`, { method, headers: { cookie } });
    assert.equal(retired.status, 404, "C2: the retired route family has no compatibility alias");
  }

  const status = await fetch(`${baseUrl}${BASE}`, { headers: { cookie } });
  assert.equal(status.status, 200);
  const statusBody = (await status.json()) as { active: boolean; source: string };
  assert.equal(statusBody.active, false, "no key configured yet in the isolated HOME");
  assert.equal(statusBody.source, "none");

  const generated = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });
  assert.equal(generated.status, 201);
  const generatedBody = (await generated.json()) as { fingerprint: string; keyFilePath: string };
  assert.equal("hex" in generatedBody, false, "generate never echoes the raw key back over the wire (sol 3-2) — Reveal is the only disclosure path");
  assert.ok(existsSync(generatedBody.keyFilePath), "generate actually wrote the key file");

  const revealed = await fetch(`${baseUrl}${BASE}/reveal`, { method: "POST", headers: { cookie } });
  assert.equal(revealed.status, 200);
  const revealedBody = (await revealed.json()) as { hex?: string; active: boolean; fingerprint?: string };
  assert.equal(revealedBody.active, true);
  assert.equal(revealedBody.hex?.length, 64, "32 raw bytes, hex-encoded — the ONE place this route family discloses the value");
  assert.equal(revealedBody.fingerprint, generatedBody.fingerprint, "reveal's fingerprint matches the key generate just wrote");
  assert.equal(revealedBody.hex, readFileSync(generatedBody.keyFilePath, "utf8").trim());
  assert.equal(fingerprintSiteKeyHex(revealedBody.hex!), revealedBody.fingerprint);
});

test("generate's response never carries the raw key — only status/reveal-relevant metadata (sol finding 3-2)", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const generated = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });
  assert.equal(generated.status, 201);
  const generatedBody = (await generated.json()) as Record<string, unknown>;
  assert.equal(
    "hex" in generatedBody,
    false,
    "the admin controller (use-site-key.hooks.ts's generate()) only ever reads fingerprint/keyFilePath/runtimeMode from this response — the raw key has no consumer here"
  );
  assert.equal(typeof generatedBody.fingerprint, "string");
  assert.equal(typeof generatedBody.keyFilePath, "string");
});

test("reveal and generate responses carry Cache-Control: no-store; GET status does not carry key material", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const generated = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });
  assert.equal(generated.status, 201);
  assert.equal(generated.headers.get("cache-control"), "no-store");

  const revealed = await fetch(`${baseUrl}${BASE}/reveal`, { method: "POST", headers: { cookie } });
  assert.equal(revealed.status, 200);
  assert.equal(revealed.headers.get("cache-control"), "no-store");

  const status = await fetch(`${baseUrl}${BASE}`, { headers: { cookie } });
  assert.equal(status.status, 200);
  const statusBody = (await status.json()) as Record<string, unknown>;
  assert.equal("hex" in statusBody, false, "GET status never carries key material regardless of caching");
});

test("GET status: state is 'missing' when nothing is configured, 'active' after generate, and 'invalid' for a malformed per-site file (site-key plan §A3b)", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const before = await fetch(`${baseUrl}${BASE}`, { headers: { cookie } });
  assert.equal(before.status, 200);
  const beforeBody = (await before.json()) as { state: string; active: boolean };
  assert.equal(beforeBody.state, "missing");
  assert.equal(beforeBody.active, false);

  const generated = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });
  assert.equal(generated.status, 201);
  const generatedBody = (await generated.json()) as { keyFilePath: string };

  const after = await fetch(`${baseUrl}${BASE}`, { headers: { cookie } });
  assert.equal(after.status, 200);
  const afterBody = (await after.json()) as { state: string; active: boolean };
  assert.equal(afterBody.state, "active");
  assert.equal(afterBody.active, true);

  // Corrupt the file generate just wrote — 'invalid', not silently 'missing'.
  writeFileSync(generatedBody.keyFilePath, "not-hex-at-all");
  const invalid = await fetch(`${baseUrl}${BASE}`, { headers: { cookie } });
  assert.equal(invalid.status, 200);
  const invalidBody = (await invalid.json()) as { state: string; active: boolean; invalid: boolean };
  assert.equal(invalidBody.state, "invalid");
  assert.equal(invalidBody.active, false);
  assert.equal(invalidBody.invalid, true);
});

test("GET status: state is 'missing-with-data' when nothing resolves but this site's content.db holds key-dependent data (site-key plan §A.6)", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);

  // Seed a key-dependent row directly, before the app even boots — `findKeyDependentData`'s own
  // `webhook_subscriptions` check (no `sealed_ciphertext` column required) is the smallest fixture
  // that trips it.
  const contentDbPath = path.join(deps.siteBinding.dir, CONTENT_DB_FILENAME);
  const db = new Database(contentDbPath);
  db.exec("CREATE TABLE webhook_subscriptions (id INTEGER PRIMARY KEY)");
  db.prepare("INSERT INTO webhook_subscriptions DEFAULT VALUES").run();
  db.close();

  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const status = await fetch(`${baseUrl}${BASE}`, { headers: { cookie } });
  assert.equal(status.status, 200);
  const statusBody = (await status.json()) as { state: string; active: boolean };
  assert.equal(statusBody.active, false, "nothing was ever generated in this isolated site/home pair");
  assert.equal(statusBody.state, "missing-with-data");
});

test("GET status: state is 'missing-with-data' for a Postgres site whose connection string is sealed with the missing key (.storage-secret.json, no content.db)", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  writeFileSync(path.join(deps.siteBinding.dir, ".site-meta.json"), JSON.stringify({ storage: { kind: "postgres", secretRef: "site" } }));
  writeFileSync(path.join(deps.siteBinding.dir, ".storage-secret.json"), JSON.stringify({ version: 1, sealed: { ciphertext: "c", nonce: "n" } }));

  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const statusBody = (await (await fetch(`${baseUrl}${BASE}`, { headers: { cookie } })).json()) as { state: string };
  assert.equal(statusBody.state, "missing-with-data");
});

test("GET status: state is 'missing-with-data' when the site's open store (PGlite, no content.db) holds key-dependent rows", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const kernel = openPgliteKernel<ContentDatabase>();
  t.after(() => kernel.close());
  await kernel.execute(sql`CREATE TABLE webhook_subscriptions (id serial PRIMARY KEY)`);
  await kernel.execute(sql`INSERT INTO webhook_subscriptions DEFAULT VALUES`);
  const deps = { ...createRouteDeps(), contentKernel: kernel };
  assertSiteDirIsolated(deps);

  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const statusBody = (await (await fetch(`${baseUrl}${BASE}`, { headers: { cookie } })).json()) as { state: string };
  assert.equal(statusBody.state, "missing-with-data");
});

test("GET status: state is 'mismatch' when .site-meta.json's stamped fingerprint disagrees with the resolved key's own fingerprint (site-key plan §A.6)", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);

  // A commit-marker `.site-meta.json` must already exist for `generate` to have anything to stamp
  // a fingerprint into (`stampSiteKeyFingerprint`'s own "no meta yet → nothing written" no-op) —
  // same minimal shape the per-site-file test below seeds.
  const siteMetaPathBefore = path.join(deps.siteBinding.dir, ".site-meta.json");
  writeFileSync(siteMetaPathBefore, JSON.stringify({ siteId: "mismatch-test-site" }));

  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const generated = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });
  assert.equal(generated.status, 201);

  const active = await fetch(`${baseUrl}${BASE}`, { headers: { cookie } });
  const activeBody = (await active.json()) as { state: string };
  assert.equal(activeBody.state, "active", "generate re-stamps a matching fingerprint (site-key plan item 2)");

  // Simulate the physical key file being substituted for a different one after the stamp was
  // written — the case `resolveSiteKeyFingerprint`'s own doc describes.
  const siteMetaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  const meta = JSON.parse(readFileSync(siteMetaPath, "utf8")) as Record<string, unknown>;
  writeFileSync(siteMetaPath, JSON.stringify({ ...meta, siteKeyFingerprint: "0000deadbeef" }));

  const mismatch = await fetch(`${baseUrl}${BASE}`, { headers: { cookie } });
  assert.equal(mismatch.status, 200);
  const mismatchBody = (await mismatch.json()) as { state: string; active: boolean };
  assert.equal(mismatchBody.state, "mismatch");
  assert.equal(mismatchBody.active, true, "the key itself still resolves fine — only the stamp disagrees");
});

test("generate re-stamps .site-meta.json's siteKeyFingerprint to the new key's own fingerprint, preserving every other field (site-key plan §A.6 item 2)", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);

  // A STALE stamp, simulating an old, now-gone key (e.g. the key file was regenerated outside this
  // route once already, or restored from an older backup) — `generate` must overwrite it, not
  // leave it pointing at a fingerprint nothing resolves to any more.
  const siteMetaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  writeFileSync(
    siteMetaPath,
    JSON.stringify({
      siteId: "restamp-test-site",
      createdAt: "2020-01-01T00:00:00.000Z",
      siteKeyFingerprint: "stale0stale0",
    })
  );

  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const generated = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });
  assert.equal(generated.status, 201);
  const generatedBody = (await generated.json()) as { fingerprint: string };

  const metaAfter = JSON.parse(readFileSync(siteMetaPath, "utf8")) as Record<string, unknown>;
  assert.equal(
    metaAfter.siteKeyFingerprint,
    generatedBody.fingerprint,
    "the stale stamp was replaced with the newly generated key's own fingerprint"
  );
  assert.equal(metaAfter.siteId, "restamp-test-site", "every other field survives the re-stamp");
  assert.equal(metaAfter.createdAt, "2020-01-01T00:00:00.000Z", "every other field survives the re-stamp");

  const status = await fetch(`${baseUrl}${BASE}`, { headers: { cookie } });
  assert.equal(status.status, 200);
  const statusBody = (await status.json()) as { state: string };
  assert.equal(statusBody.state, "active", "a matching re-stamp reports 'active', not a spurious 'mismatch'");
});

test("generate writes THIS site's own per-site key file when a siteKeyId is resolvable, not the legacy global default (site-key plan §A3b)", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // siteBinding.dir is this test's own temp site dir (isolateSiteDir) — stamp a resolvable
  // siteKeyId into it so this test proves generate targets the PER-SITE path, not merely "some path".
  const siteMetaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  const priorSiteMeta = existsSync(siteMetaPath) ? readFileSync(siteMetaPath, "utf8") : undefined;
  writeFileSync(siteMetaPath, JSON.stringify({ siteId: "site-key-route-test-site" }));
  t.after(() => {
    if (priorSiteMeta === undefined) rmSync(siteMetaPath, { force: true });
    else writeFileSync(siteMetaPath, priorSiteMeta);
  });

  const generated = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });
  assert.equal(generated.status, 201);
  const generatedBody = (await generated.json()) as { keyFilePath: string };
  assert.equal(
    generatedBody.keyFilePath,
    path.join(process.env.HOME ?? "", ".tovu", "site-keys", "site-key-route-test-site.hex"),
    "generate targets the resolved siteKeyId's own per-site file, not the legacy shared default"
  );
  assert.ok(existsSync(generatedBody.keyFilePath));
});

// ---------------------------------------------------------------------------
// 2026-09-29: generate is safe and self-healing. It runs the same site-key rules boot runs
// (`ensureSiteKeyForSite`, injected): a working key is left alone, the key the site's data was sealed
// with is adopted from wherever it still is, and a new key is never minted over sealed data.
// ---------------------------------------------------------------------------

/** Seeds one key-dependent row into the isolated site's content.db (same fixture as the
 *  'missing-with-data' test above). */
function seedKeyDependentRow(siteDir: string): void {
  const db = new Database(path.join(siteDir, CONTENT_DB_FILENAME));
  db.exec("CREATE TABLE webhook_subscriptions (id INTEGER PRIMARY KEY)");
  db.prepare("INSERT INTO webhook_subscriptions DEFAULT VALUES").run();
  db.close();
}

function perSiteKeyPath(siteKeyId: string): string {
  return path.join(process.env.HOME ?? "", ".tovu", "site-keys", `${siteKeyId}.hex`);
}

function writeLegacySharedKey(hex: string): void {
  mkdirSync(path.join(process.env.HOME ?? "", ".tovu"), { recursive: true });
  writeFileSync(path.join(process.env.HOME ?? "", ".tovu", LEGACY_SITE_KEY_FILENAME), hex, { mode: 0o600 });
}

test("generate with this site's matching key already in place → 200 'already-active', nothing written", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const hex = randomBytes(32).toString("hex");
  const keyPath = perSiteKeyPath("active-site");
  mkdirSync(path.dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, hex, { mode: 0o600 });
  const metaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  const meta = JSON.stringify({ siteId: "active-site", siteKeyFingerprint: fingerprintSiteKeyHex(hex) });
  writeFileSync(metaPath, meta);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });

  assert.equal(res.status, 200);
  const body = (await res.json()) as { outcome: string; fingerprint: string; keyFilePath: string };
  assert.equal(body.outcome, "already-active");
  assert.equal(body.fingerprint, fingerprintSiteKeyHex(hex));
  assert.equal(body.keyFilePath, keyPath);
  assert.equal(readFileSync(keyPath, "utf8"), hex, "the working key is never replaced");
  assert.equal(readFileSync(metaPath, "utf8"), meta, "the stamp is never touched");
});

test("generate with the per-site key gone but the stamped key still in the legacy shared file → 200 'recovered', that key adopted", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const hex = randomBytes(32).toString("hex");
  writeLegacySharedKey(hex);
  const metaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  writeFileSync(metaPath, JSON.stringify({ siteId: "recover-site", siteKeyFingerprint: fingerprintSiteKeyHex(hex) }));
  seedKeyDependentRow(deps.siteBinding.dir);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });

  assert.equal(res.status, 200);
  const body = (await res.json()) as { outcome: string; fingerprint: string };
  assert.equal(body.outcome, "recovered");
  assert.equal(body.fingerprint, fingerprintSiteKeyHex(hex));
  assert.equal(readFileSync(perSiteKeyPath("recover-site"), "utf8"), hex, "the per-site file now holds the SAME key the data was sealed with");
  const metaAfter = JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>;
  assert.equal(metaAfter.siteKeyFingerprint, fingerprintSiteKeyHex(hex), "the stamp is unchanged");
});

test("generate with a WRONG per-site key and the stamped key in the legacy shared file → 200 'recovered', the wrong file kept as a backup", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const rightHex = randomBytes(32).toString("hex");
  const wrongHex = randomBytes(32).toString("hex");
  writeLegacySharedKey(rightHex);
  const keyPath = perSiteKeyPath("wrong-file-site");
  mkdirSync(path.dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, wrongHex, { mode: 0o600 });
  writeFileSync(path.join(deps.siteBinding.dir, ".site-meta.json"), JSON.stringify({ siteId: "wrong-file-site", siteKeyFingerprint: fingerprintSiteKeyHex(rightHex) }));
  seedKeyDependentRow(deps.siteBinding.dir);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });

  assert.equal(res.status, 200);
  const body = (await res.json()) as { outcome: string; fingerprint: string };
  assert.equal(body.outcome, "recovered");
  assert.equal(body.fingerprint, fingerprintSiteKeyHex(rightHex));
  assert.equal(readFileSync(keyPath, "utf8"), rightHex);
  const backups = readdirSync(path.dirname(keyPath)).filter((name) => name.startsWith("wrong-file-site.hex.wrong-"));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(path.join(path.dirname(keyPath), backups[0]!), "utf8"), wrongHex);
});

test("generate with a working legacy key whose fingerprint differs from the stamp, on a site with sealed data → 409 KEY_MISMATCH, nothing shadows it", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const legacyHex = randomBytes(32).toString("hex");
  writeLegacySharedKey(legacyHex);
  const stamp = fingerprintSiteKeyHex(randomBytes(32).toString("hex"));
  const metaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  writeFileSync(metaPath, JSON.stringify({ siteId: "mismatch-site", siteKeyFingerprint: stamp }));
  seedKeyDependentRow(deps.siteBinding.dir);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });

  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string; detail: string };
  assert.equal(body.error, "KEY_MISMATCH");
  assert.equal(
    body.detail,
    "The site key on this computer is not the one this site's saved credentials were locked with, so nothing was changed. Put the original site key back to unlock them."
  );
  assert.equal(existsSync(perSiteKeyPath("mismatch-site")), false, "no per-site file may shadow the working legacy key");
  assert.equal((JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>).siteKeyFingerprint, stamp, "the stamp is never overwritten");
});

test("generate with no key anywhere and sealed data present → 409 KEY_DEPENDENT_DATA, no key minted, stamp kept", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const stamp = fingerprintSiteKeyHex(randomBytes(32).toString("hex"));
  const metaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  writeFileSync(metaPath, JSON.stringify({ siteId: "locked-site", siteKeyFingerprint: stamp }));
  seedKeyDependentRow(deps.siteBinding.dir);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });

  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string; detail: string };
  assert.equal(body.error, "KEY_DEPENDENT_DATA");
  assert.equal(
    body.detail,
    "This site has saved credentials locked with a site key that is not on this computer. A new site key could not open them, so none was created. Put the original site key back to unlock them."
  );
  assert.equal(existsSync(perSiteKeyPath("locked-site")), false, "no key may be minted over sealed data");
  assert.equal((JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>).siteKeyFingerprint, stamp, "the stamp is never overwritten");
});

test("generate with no key anywhere and no sealed data → 201 'created', this site's own key minted and stamped", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const metaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  writeFileSync(metaPath, JSON.stringify({ siteId: "fresh-site" }));
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });

  assert.equal(res.status, 201);
  const body = (await res.json()) as { outcome: string; fingerprint: string; keyFilePath: string };
  assert.equal(body.outcome, "created");
  assert.equal(body.keyFilePath, perSiteKeyPath("fresh-site"));
  assert.equal(fingerprintSiteKeyHex(readFileSync(body.keyFilePath, "utf8")), body.fingerprint);
  assert.equal((JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>).siteKeyFingerprint, body.fingerprint);
});

test("all six endpoints stay 401 anonymously and 403 for a content.read-only session", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);
  const metaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  const metadata = JSON.stringify({ siteId: "restricted-token-site" });
  writeFileSync(metaPath, metadata);
  const hex = randomBytes(32).toString("hex");
  writePerSiteKey("restricted-token-site", hex);
  await sealCredentialRow(deps.siteBinding.dir, "restricted-credential", hex);
  const dbPath = path.join(deps.siteBinding.dir, CONTENT_DB_FILENAME);
  const dbBefore = readFileSync(dbPath);
  const restricted = await loginAsBarePrincipal(deps, baseUrl, { username: "token-reader" });
  const principal = await deps.userRepo.findByUsername({ workspaceId: WORKSPACE, username: "token-reader" });
  assert.ok(principal);
  const policyId = "token-reader-policy";
  await deps.policyRepo.save({ id: policyId, workspaceId: WORKSPACE, name: policyId, isBuiltin: false, isFrozen: false });
  await deps.principalPolicyRepo.save({ id: "token-reader-link", workspaceId: WORKSPACE, principalId: principal.principalId, policyId });
  await deps.policyPermissionRepo.save({ id: "token-reader-read", workspaceId: WORKSPACE, policyId, permission: "content.read", resourceType: null, constraintJson: null });

  for (const attempt of [
    { method: "GET" as const, url: BASE },
    { method: "POST" as const, url: `${BASE}/reveal` },
    { method: "POST" as const, url: `${BASE}/generate` },
    { method: "POST" as const, url: `${BASE}/import` },
    { method: "GET" as const, url: `${BASE}/start-fresh` },
    { method: "POST" as const, url: `${BASE}/start-fresh` },
  ]) {
    const anonymous = await fetch(`${baseUrl}${attempt.url}`, { method: attempt.method });
    assert.equal(anonymous.status, 401, `401 without a credential: ${attempt.method} ${attempt.url}`);
    const denied = await fetch(`${baseUrl}${attempt.url}`, { method: attempt.method, headers: { cookie: restricted } });
    assert.equal(denied.status, 403, `403 without token-management permission: ${attempt.method} ${attempt.url}`);
    const body = await denied.json() as { code: string; details: { permission: string } };
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.details.permission, "admin.security.site-key.manage");
  }
  assert.equal(readFileSync(metaPath, "utf8"), metadata);
  assert.equal(readFileSync(perSiteKeyPath("restricted-token-site"), "utf8"), hex);
  assert.deepEqual(readFileSync(dbPath), dbBefore);
});

test("production generate creates and stamps the durable key, preserves it, and refuses invalid keys or sealed data", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const app = createApp(deps);
  const volumeRoot = mkdtempSync(path.join(tmpdir(), "tovu-site-key-production-"));
  t.after(() => rmSync(volumeRoot, { recursive: true, force: true }));
  t.mock.method(process, "cwd", () => volumeRoot);
  process.env.TOVU_RUNTIME_MODE = "production";
  const metaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  writeFileSync(metaPath, JSON.stringify({ siteId: "production-site", provenance: "preserved" }));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const generate = () => fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });
  const created = await generate();
  assert.equal(created.status, 201);
  const body = await created.json() as { outcome: string; fingerprint: string; keyFilePath: string; runtimeMode: string };
  assert.equal(body.outcome, "created");
  assert.equal(body.runtimeMode, "production");
  assert.equal(body.keyFilePath, path.join(volumeRoot, "sites", ".tovu", "site-key.hex"));
  const keyBytes = readFileSync(body.keyFilePath, "utf8");
  assert.equal(fingerprintSiteKeyHex(keyBytes), body.fingerprint);
  const stamp = readFileSync(metaPath, "utf8");
  const meta = JSON.parse(stamp) as { siteKeyFingerprint: string; provenance: string };
  assert.equal(meta.siteKeyFingerprint, body.fingerprint);
  assert.equal(meta.provenance, "preserved");
  const existing = await generate();
  assert.equal(existing.status, 200);
  assert.equal((await existing.json() as { outcome: string }).outcome, "already-active");
  assert.equal(readFileSync(body.keyFilePath, "utf8"), keyBytes);
  writeFileSync(body.keyFilePath, "not-a-key");
  const invalid = await generate();
  assert.equal(invalid.status, 409);
  assert.equal((await invalid.json() as { error: string }).error, "KEY_INVALID");
  assert.equal(readFileSync(body.keyFilePath, "utf8"), "not-a-key");
  rmSync(body.keyFilePath);
  await sealCredentialRow(deps.siteBinding.dir, "production-locked", randomBytes(32).toString("hex"));
  const sealedBefore = readFileSync(path.join(deps.siteBinding.dir, CONTENT_DB_FILENAME));
  const locked = await generate();
  assert.equal(locked.status, 409);
  assert.equal((await locked.json() as { error: string }).error, "KEY_DEPENDENT_DATA");
  assert.equal(existsSync(body.keyFilePath), false);
  assert.equal(readFileSync(metaPath, "utf8"), stamp);
  assert.deepEqual(readFileSync(path.join(deps.siteBinding.dir, CONTENT_DB_FILENAME)), sealedBefore);
});

// ---------------------------------------------------------------------------
// Last-resort recovery (design 2026-09-14 §4.3/§4.6): "Paste your old token" (`POST .../import`)
// and "Start fresh" (`GET`/`POST .../start-fresh`). Fixtures seal real rows in the site's own
// content.db, so the routes prove a token by opening them, not by trusting a fingerprint.
// ---------------------------------------------------------------------------

/** A minimal `custom_credential_sets` table: the columns its sealed-column descriptor needs. */
function createCredentialTable(siteDir: string): void {
  const db = new Database(path.join(siteDir, CONTENT_DB_FILENAME));
  db.exec(
    "CREATE TABLE IF NOT EXISTS custom_credential_sets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, label TEXT NOT NULL, category TEXT NOT NULL, sealed_key_id TEXT NOT NULL, sealed_ciphertext TEXT NOT NULL, sealed_nonce TEXT NOT NULL, sealed_alg TEXT NOT NULL)"
  );
  db.close();
}

async function sealCredentialRow(siteDir: string, id: string, hex: string): Promise<void> {
  createCredentialTable(siteDir);
  const keyring = new FixedSiteKeyKeyring(hex);
  const sealed = await new AesGcmSecretSealer(keyring).seal({
    plaintext: `secret-${id}`,
    key: await keyring.activeKey(),
    aad: buildCustomCredentialAad({ workspaceId: WORKSPACE as never, id: id as never }),
  });
  const db = new Database(path.join(siteDir, CONTENT_DB_FILENAME));
  db.prepare("INSERT INTO custom_credential_sets VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, WORKSPACE, id, "email", sealed.keyId, sealed.ciphertext, sealed.nonce, sealed.alg);
  db.close();
}

/** The plaintext of a sealed row under `hex`, or `undefined` if it does not open. */
async function openCredentialRow(siteDir: string, id: string, hex: string): Promise<string | undefined> {
  const db = new Database(path.join(siteDir, CONTENT_DB_FILENAME));
  const row = db.prepare("SELECT sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg FROM custom_credential_sets WHERE id = ?").get(id) as
    | { sealed_key_id: string; sealed_ciphertext: string; sealed_nonce: string; sealed_alg: string }
    | undefined;
  db.close();
  if (row === undefined) return undefined;
  try {
    return await new AesGcmSecretSealer(new FixedSiteKeyKeyring(hex)).open({ sealed: { keyId: row.sealed_key_id, ciphertext: row.sealed_ciphertext, nonce: row.sealed_nonce, alg: row.sealed_alg } }, { aad: buildCustomCredentialAad({ workspaceId: WORKSPACE as never, id: id as never }) });
  } catch {
    return undefined;
  }
}

function writePerSiteKey(siteKeyId: string, hex: string): string {
  const keyPath = perSiteKeyPath(siteKeyId);
  mkdirSync(path.dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, hex, { mode: 0o600 });
  return keyPath;
}

function postJson(baseUrl: string, url: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${url}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("import: a value that is not a site key → 400 SITE_KEY_INVALID, nothing written", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  writeFileSync(path.join(deps.siteBinding.dir, ".site-meta.json"), JSON.stringify({ siteId: "bad-token-site" }));
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await postJson(baseUrl, `${BASE}/import`, cookie, { siteKey: "not-a-key" });

  assert.equal(res.status, 400);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = (await res.json()) as { error: string; detail: string };
  assert.equal(body.error, "SITE_KEY_INVALID");
  const retiredBody = await postJson(baseUrl, `${BASE}/import`, cookie, { token: randomBytes(32).toString("hex") });
  assert.equal(retiredBody.status, 400, "C2: the retired request field is not accepted");
  assert.equal(((await retiredBody.json()) as { error: string }).error, "SITE_KEY_INVALID");
  assert.equal(body.detail, "That is not a site key. A site key is 64 characters of 0-9 and a-f.");
  assert.equal(JSON.stringify(body).includes("not-a-key"), false, "the pasted value is never echoed");
  assert.equal(existsSync(perSiteKeyPath("bad-token-site")), false);
});

test("import: a valid token that opens none of this site's credentials → 409 SITE_KEY_DOES_NOT_OPEN, nothing written", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const originalHex = randomBytes(32).toString("hex");
  const metaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  writeFileSync(metaPath, JSON.stringify({ siteId: "wrong-paste-site", siteKeyFingerprint: fingerprintSiteKeyHex(originalHex) }));
  await sealCredentialRow(deps.siteBinding.dir, "cred-1", originalHex);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const pasted = randomBytes(32).toString("hex");

  const res = await postJson(baseUrl, `${BASE}/import`, cookie, { siteKey: pasted });

  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string; detail: string };
  assert.equal(body.error, "SITE_KEY_DOES_NOT_OPEN");
  assert.equal(body.detail, "That site key does not open this site's saved credentials. Nothing was changed.");
  assert.equal(JSON.stringify(body).includes(pasted), false);
  assert.equal(existsSync(perSiteKeyPath("wrong-paste-site")), false, "a token that opens nothing is never written");
  assert.equal((JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>).siteKeyFingerprint, fingerprintSiteKeyHex(originalHex));
});

test("import: the original token unlocks a mismatched site and credentials saved under the wrong key are moved over, not stranded", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const originalHex = randomBytes(32).toString("hex");
  const wrongHex = randomBytes(32).toString("hex");
  const keyPath = writePerSiteKey("unlock-site", wrongHex);
  const metaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  writeFileSync(metaPath, JSON.stringify({ siteId: "unlock-site", siteKeyFingerprint: fingerprintSiteKeyHex(originalHex) }));
  await sealCredentialRow(deps.siteBinding.dir, "cred-original", originalHex);
  await sealCredentialRow(deps.siteBinding.dir, "cred-saved-since", wrongHex);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await postJson(baseUrl, `${BASE}/import`, cookie, { siteKey: originalHex });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const text = await res.text();
  assert.equal(text.includes(originalHex), false, "the token is never echoed");
  const body = JSON.parse(text) as { outcome: string; fingerprint: string; keyFilePath: string; resealed: number; restorePointId: string };
  assert.equal(body.outcome, "unlocked");
  assert.equal(body.fingerprint, fingerprintSiteKeyHex(originalHex));
  assert.equal(body.keyFilePath, keyPath);
  assert.equal(body.resealed, 1);
  assert.equal(typeof body.restorePointId, "string");
  assert.equal(readFileSync(keyPath, "utf8"), originalHex, "the site's key file now holds the original token");
  assert.equal(await openCredentialRow(deps.siteBinding.dir, "cred-original", originalHex), "secret-cred-original");
  assert.equal(await openCredentialRow(deps.siteBinding.dir, "cred-saved-since", originalHex), "secret-cred-saved-since", "saved under the wrong key, now opens under the original");
  const backups = readdirSync(path.dirname(keyPath)).filter((name) => name.startsWith("unlock-site.hex.wrong-"));
  assert.equal(backups.length, 1, "the wrong key file is kept as a backup");

  const status = (await (await fetch(`${baseUrl}${BASE}`, { headers: { cookie } })).json()) as { state: string };
  assert.equal(status.state, "active");
});

test("import: a database connection sealed under the wrong key meanwhile is moved onto the pasted token too", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const originalHex = randomBytes(32).toString("hex");
  const wrongHex = randomBytes(32).toString("hex");
  writePerSiteKey("pg-unlock-site", wrongHex);
  writeFileSync(path.join(deps.siteBinding.dir, ".site-meta.json"), JSON.stringify({ siteId: "pg-unlock-site", siteKeyFingerprint: fingerprintSiteKeyHex(originalHex) }));
  const wrongKeyring = new FixedSiteKeyKeyring(wrongHex);
  await writeSealedConnectionString({ siteDir: deps.siteBinding.dir, connectionString: "postgres://site" }, { sealer: new AesGcmSecretSealer(wrongKeyring), keyring: wrongKeyring });
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await postJson(baseUrl, `${BASE}/import`, cookie, { siteKey: originalHex });

  assert.equal(res.status, 200);
  const body = (await res.json()) as { outcome: string; resealed: number };
  assert.equal(body.outcome, "unlocked");
  assert.equal(body.resealed, 1);
  const opened = await readSealedConnectionString({ siteDir: deps.siteBinding.dir }, { sealer: new AesGcmSecretSealer(new FixedSiteKeyKeyring(originalHex)) });
  assert.equal(opened, "postgres://site");
});

test("start fresh: without the typed confirmation → 400 CONFIRMATION_REQUIRED, nothing changed", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  writeFileSync(path.join(deps.siteBinding.dir, ".site-meta.json"), JSON.stringify({ siteId: "unconfirmed-site", siteKeyFingerprint: fingerprintSiteKeyHex(randomBytes(32).toString("hex")) }));
  await sealCredentialRow(deps.siteBinding.dir, "cred-1", randomBytes(32).toString("hex"));
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await postJson(baseUrl, `${BASE}/start-fresh`, cookie, { confirm: "start fresh" });

  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; detail: string };
  assert.equal(body.error, "CONFIRMATION_REQUIRED");
  assert.equal(body.detail, 'Type START FRESH to confirm. Nothing was changed.');
  assert.equal(existsSync(perSiteKeyPath("unconfirmed-site")), false);
  const db = new Database(path.join(deps.siteBinding.dir, CONTENT_DB_FILENAME));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM custom_credential_sets").get() as { n: number }).n, 1, "the locked credential is still there");
  db.close();
});

test("start fresh: the preview names what goes and which webhooks get a new signing secret; confirming does it after a restore point", async (t) => {
  isolateHomeDir(t);
  isolateSiteDir(t);
  const deps = createRouteDeps();
  assertSiteDirIsolated(deps);
  const lostHex = randomBytes(32).toString("hex");
  const metaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  writeFileSync(metaPath, JSON.stringify({ siteId: "fresh-start-site", siteKeyFingerprint: fingerprintSiteKeyHex(lostHex) }));
  await sealCredentialRow(deps.siteBinding.dir, "cred-locked", lostHex);
  const backupPath = path.join(deps.siteBinding.dir, "before-start-fresh.db");
  deps.dbOps.captureRestorePoint = async () => {
    const source = new Database(path.join(deps.siteBinding.dir, CONTENT_DB_FILENAME));
    try {
      assert.deepEqual(source.prepare("SELECT id FROM custom_credential_sets").all(), [{ id: "cred-locked" }], "capture must run before discarding credentials");
      await source.backup(backupPath);
    } finally {
      source.close();
    }
    return { artifactRef: backupPath, watermarkAtCapture: 0 };
  };
  const now = new Date().toISOString();
  await deps.webhookSubscriptionRepo.insert({
    id: "wh-1" as never, workspaceId: WORKSPACE as never, ownerPrincipalId: "principal-1" as never, label: "Order sync", targetUrl: "https://hooks.example.test/orders",
    topics: [], secretVersion: 1 as never, previousSecretVersion: null, status: "active" as never, createdByPrincipalId: "principal-1" as never, createdByPluginId: null,
    createdAt: now as never, updatedAt: now as never, disabledAt: null,
  });
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const preview = await fetch(`${baseUrl}${BASE}/start-fresh`, { headers: { cookie } });
  assert.equal(preview.status, 200);
  assert.deepEqual(await preview.json(), {
    removes: 1,
    affectedWebhooks: [{ label: "Order sync", targetUrl: "https://hooks.example.test/orders" }],
    detail: "1 saved credential can't be unlocked and will be removed. These webhooks get a new signing secret, so update their receivers: Order sync (https://hooks.example.test/orders).",
    runtimeMode: "local",
  });

  const res = await postJson(baseUrl, `${BASE}/start-fresh`, cookie, { confirm: "START FRESH" });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = (await res.json()) as { outcome: string; fingerprint: string; keyFilePath: string; discarded: number; kept: number; restorePointId: string; affectedWebhooks: unknown; hex?: string };
  assert.equal(body.outcome, "started-fresh");
  assert.equal(body.discarded, 1);
  assert.equal(body.kept, 0);
  assert.equal(typeof body.restorePointId, "string");
  assert.deepEqual(body.affectedWebhooks, [{ label: "Order sync", targetUrl: "https://hooks.example.test/orders" }]);
  assert.equal("hex" in body, false, "the new key is never in the body; Reveal shows it");
  assert.equal(body.keyFilePath, perSiteKeyPath("fresh-start-site"));
  const installed = readFileSync(body.keyFilePath, "utf8");
  assert.equal(fingerprintSiteKeyHex(installed), body.fingerprint);
  assert.notEqual(body.fingerprint, fingerprintSiteKeyHex(lostHex));
  assert.equal((JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>).siteKeyFingerprint, body.fingerprint);
  const db = new Database(path.join(deps.siteBinding.dir, CONTENT_DB_FILENAME));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM custom_credential_sets").get() as { n: number }).n, 0, "the credential nothing could open is gone");
  db.close();
  const restorePoints = await deps.restorePointsRepo.list();
  assert.ok(restorePoints.some((row) => row.id === body.restorePointId && row.trigger === "site-key-start-fresh"), "a restore point was saved first");
  const point = restorePoints.find((row) => row.id === body.restorePointId);
  assert.equal(point?.artifactRef, backupPath);
  const backup = new Database(backupPath, { readonly: true });
  try {
    assert.deepEqual(backup.prepare("SELECT id FROM custom_credential_sets").all(), [{ id: "cred-locked" }], "the backup contains the credential removed from the live database");
  } finally {
    backup.close();
  }

  const status = (await (await fetch(`${baseUrl}${BASE}`, { headers: { cookie } })).json()) as { state: string };
  assert.equal(status.state, "active");
});

for (const failure of ["unavailable", "capture-failed"] as const) {
  test(`start fresh refuses to mutate credentials when a restore point is ${failure}`, async (t) => {
    isolateHomeDir(t);
    isolateSiteDir(t);
    const deps = createRouteDeps();
    assertSiteDirIsolated(deps);
    const metaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
    const metadata = JSON.stringify({ siteId: "no-backup-site", siteKeyFingerprint: fingerprintSiteKeyHex(randomBytes(32).toString("hex")) });
    writeFileSync(metaPath, metadata);
    await sealCredentialRow(deps.siteBinding.dir, "locked-without-backup", randomBytes(32).toString("hex"));
    const dbPath = path.join(deps.siteBinding.dir, CONTENT_DB_FILENAME);
    const before = readFileSync(dbPath);
    let captures = 0;
    if (failure === "unavailable") {
      deps.dbOps.getCapabilities = async () => ({ restorePoint: { costClass: "unavailable", kind: "external" } });
    }
    deps.dbOps.captureRestorePoint = async () => {
      captures += 1;
      throw new Error("backup-capture-private-detail");
    };
    const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
    const response = await postJson(baseUrl, `${BASE}/start-fresh`, cookie, { confirm: "START FRESH" });
    assert.equal(response.status, failure === "unavailable" ? 409 : 500);
    const text = await response.text();
    if (failure === "unavailable") assert.equal((JSON.parse(text) as { error: string }).error, "RESTORE_POINT_UNAVAILABLE");
    assert.ok(!text.includes("backup-capture-private-detail"));
    assert.equal(captures, failure === "unavailable" ? 0 : 1);
    assert.equal(readFileSync(metaPath, "utf8"), metadata);
    assert.deepEqual(readFileSync(dbPath), before);
    assert.equal(existsSync(perSiteKeyPath("no-backup-site")), false);
    assert.deepEqual(await deps.restorePointsRepo.list(), []);
  });
}
