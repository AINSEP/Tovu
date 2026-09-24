import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import { bootAuthenticated, startTestServer } from "./helpers/http-test-server.js";

/**
 * @file Route-level coverage for `GET`/`POST .../reveal`/`POST .../generate` under
 * `/api/admin/v1/workspaces/:workspaceId/system/site-token` (`routes/system/site-token.ts`).
 *
 * 2026-09-14 hardening (ADS-memory design doc `2026-09-14-root-key-regenerate-and-desktop-key-
 * source-design.md`, §3.11 item 1 + item 2): before this pass, every verb here checked only the
 * `admin.security.tokens.manage` permission — never the credential kind — so an `api_key` whose
 * issuance snapshot carried that permission (any key minted from the built-in `admin` policy, or
 * from a custom role granted `admin.integrations.manage`) could read and mint the one value that
 * decrypts every other stored credential this install holds. This file's first block proves that
 * gap is closed the same way `server/__tests__/api-key-routes.test.ts` proves the api-keys family's
 * own escalation guard: mint a real api_key holding the exact permission, then prove refusal is
 * about the CREDENTIAL TYPE, not a missing grant.
 *
 * `isolateHomeDir` exists because `inspectRootKeyMaterial`/`revealRootKeyMaterial`/
 * `generateFileRootKey` resolve their key-FILE fallback from `defaultRootKeyFilePath()` — which is
 * `homedir()`-based in local/dev mode (the mode this test process runs in, `TOVU_RUNTIME_MODE`
 * unset) — with NO per-call override. Every test that exercises a real 200/201 response redirects
 * `HOME` to a throwaway temp dir first, so a passing test run never reads, creates, or touches the
 * operator's actual `~/.tovu/integrations-root-key.hex`. No test in this file ever asserts on or
 * logs a `hex` value; presence/absence and byte length are the only properties checked.
 */

const WORKSPACE = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE}/system/site-token`;

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
    body: JSON.stringify({ displayName: `site-token-probe-${Math.random().toString(36).slice(2, 8)}` }),
  });
  assert.equal(principalRes.status, 201);
  const principal = ((await principalRes.json()) as { principal: { id: string } }).principal;

  const policyId = await builtinPolicyId(baseUrl, ownerCookie, policyName);
  const issueRes = await fetch(`${baseUrl}/api/admin/v1/api-keys`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ principalId: principal.id, label: "site-token-probe", policyIds: [policyId] }),
  });
  assert.equal(issueRes.status, 201);
  const apiKey = ((await issueRes.json()) as { apiKey: { rawKey: string } }).apiKey;
  return { authorization: `Bearer ${apiKey.rawKey}` };
}

/** Redirects `homedir()`-based default key-file resolution to a throwaway temp directory for the
 *  life of one test, and removes it on teardown — see this file's header for why this exists. */
function isolateHomeDir(t: import("node:test").TestContext): void {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-site-token-test-home-"));
  const originalHome = process.env.HOME;
  process.env.HOME = dir;
  t.after(() => {
    process.env.HOME = originalHome;
    rmSync(dir, { recursive: true, force: true });
  });
}

test("an api_key holding admin.security.tokens.manage is refused 403 on GET status, reveal, and generate", async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // The admin built-in policy carries admin.security.tokens.manage (site-token-permission.ts's
  // registerBuiltinRoleGrant), so this key genuinely holds the permission every verb below gates
  // on — any refusal is therefore about the credential type, not a missing grant.
  const bearer = await issueApiKeyBearer(baseUrl, cookie, "admin-builtin-policy");
  const me = await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: bearer });
  const meBody = (await me.json()) as { effectivePermissions: string[] };
  assert.ok(
    meBody.effectivePermissions.includes("admin.security.tokens.manage"),
    "the probe key really does hold admin.security.tokens.manage"
  );

  const attempts: Array<{ method: "GET" | "POST"; url: string }> = [
    { method: "GET", url: BASE },
    { method: "POST", url: `${BASE}/reveal` },
    { method: "POST", url: `${BASE}/generate` },
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
    assert.equal(body.details.permission, "admin.security.tokens.manage");
    assert.equal("hex" in body, false, "a refused body never carries key material");
  }
});

test("session callers keep working: GET, reveal, and generate all still succeed for an admin session", async (t) => {
  isolateHomeDir(t);
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

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
});

test("generate's response never carries the raw key — only status/reveal-relevant metadata (sol finding 3-2)", async (t) => {
  isolateHomeDir(t);
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const generated = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });
  assert.equal(generated.status, 201);
  const generatedBody = (await generated.json()) as Record<string, unknown>;
  assert.equal(
    "hex" in generatedBody,
    false,
    "the admin controller (use-site-token.hooks.ts's generate()) only ever reads fingerprint/keyFilePath/runtimeMode from this response — the raw key has no consumer here"
  );
  assert.equal(typeof generatedBody.fingerprint, "string");
  assert.equal(typeof generatedBody.keyFilePath, "string");
});

test("reveal and generate responses carry Cache-Control: no-store; GET status does not carry key material", async (t) => {
  isolateHomeDir(t);
  const deps = createRouteDeps();
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
  const deps = createRouteDeps();
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

test("generate writes THIS site's own per-site key file when a siteKeyId is resolvable, not the legacy global default (site-key plan §A3b)", async (t) => {
  isolateHomeDir(t);
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // The in-memory composition root's siteBinding.dir points at a real directory on disk
  // (describeSiteBinding()'s own resolution) — stamp a resolvable siteKeyId into it so this test
  // proves generate targets the PER-SITE path, not merely "some path".
  const siteMetaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  const priorSiteMeta = existsSync(siteMetaPath) ? readFileSync(siteMetaPath, "utf8") : undefined;
  writeFileSync(siteMetaPath, JSON.stringify({ siteId: "site-token-route-test-site" }));
  t.after(() => {
    if (priorSiteMeta === undefined) rmSync(siteMetaPath, { force: true });
    else writeFileSync(siteMetaPath, priorSiteMeta);
  });

  const generated = await fetch(`${baseUrl}${BASE}/generate`, { method: "POST", headers: { cookie } });
  assert.equal(generated.status, 201);
  const generatedBody = (await generated.json()) as { keyFilePath: string };
  assert.equal(
    generatedBody.keyFilePath,
    path.join(process.env.HOME ?? "", ".tovu", "site-keys", "site-token-route-test-site.hex"),
    "generate targets the resolved siteKeyId's own per-site file, not the legacy shared default"
  );
  assert.ok(existsSync(generatedBody.keyFilePath));
});

test("all three verbs stay 401 without a credential and 403 for a session lacking the permission", async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  for (const attempt of [
    { method: "GET" as const, url: BASE },
    { method: "POST" as const, url: `${BASE}/reveal` },
    { method: "POST" as const, url: `${BASE}/generate` },
  ]) {
    const anonymous = await fetch(`${baseUrl}${attempt.url}`, { method: attempt.method });
    assert.equal(anonymous.status, 401, `401 without a credential: ${attempt.method} ${attempt.url}`);
  }
});
