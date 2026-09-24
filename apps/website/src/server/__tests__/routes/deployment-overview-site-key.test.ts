import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";

/**
 * @file Site-key plan §A3b — the Deployment Overview's `TOVU_INTEGRATIONS_ROOT_KEY` row must
 * resolve THIS site's own source order (`resolveSiteTokenSources`, `routes/system/site-token.ts`) —
 * the same seam `site-token.ts`'s own `GET`/`reveal`/`generate` verbs already use — instead of the
 * module-level `inspectRootKeyMaterial()` hardcoded env-then-legacy-default precedence. Mirrors
 * `admin-site-token-routes.test.ts`'s "generate writes THIS site's own per-site key file" proof, but
 * read-only: stamps a resolvable `siteKeyId` and writes a valid key file directly at the PER-SITE
 * path, never at the legacy default a non-site-aware read would still check — so a non-site-aware
 * implementation reports "missing" here while a site-aware one reports "active".
 */

/** Redirects `homedir()`-based default key-file resolution to a throwaway temp dir for the life of
 *  one test, and clears the env var so only the per-site file this test writes can make the row
 *  active — same pattern `admin-site-token-routes.test.ts`'s own `isolateHomeDir` uses. */
function isolateHomeDir(t: import("node:test").TestContext): string {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-deployment-overview-test-home-"));
  const originalHome = process.env.HOME;
  const originalRootKey = process.env.TOVU_INTEGRATIONS_ROOT_KEY;
  process.env.HOME = dir;
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;
  t.after(() => {
    process.env.HOME = originalHome;
    if (originalRootKey === undefined) delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;
    else process.env.TOVU_INTEGRATIONS_ROOT_KEY = originalRootKey;
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

test("deployment-overview: TOVU_INTEGRATIONS_ROOT_KEY row is site-aware — reads THIS site's per-site key file, not just the legacy default (site-key plan §A3b)", async (t) => {
  const home = isolateHomeDir(t);
  const deps = createRouteDeps();

  const siteMetaPath = path.join(deps.siteBinding.dir, ".site-meta.json");
  writeFileSync(siteMetaPath, JSON.stringify({ siteId: "deployment-overview-site-key-test" }));
  t.after(() => rmSync(siteMetaPath, { force: true }));

  // A valid 32-byte key written ONLY at the per-site path — never at the legacy default
  // (`~/.tovu/integrations-root-key.hex`) a non-site-aware read would still check.
  const perSiteKeyPath = path.join(home, ".tovu", "site-keys", "deployment-overview-site-key-test.hex");
  mkdirSync(path.dirname(perSiteKeyPath), { recursive: true });
  writeFileSync(perSiteKeyPath, "ab".repeat(32));

  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/deployment-overview`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { envVars: Array<{ name: string; set: boolean; source?: string }> };
  const rootKeyRow = body.envVars.find((row) => row.name === "TOVU_INTEGRATIONS_ROOT_KEY");
  assert.ok(rootKeyRow, "the TOVU_INTEGRATIONS_ROOT_KEY row is present");
  assert.equal(rootKeyRow?.set, true, "the per-site key file must be found and counted as active");
  assert.equal(rootKeyRow?.source, "file");
});

test("deployment-overview: falls back to today's behavior when this site has no resolvable siteKeyId", async (t) => {
  isolateHomeDir(t);
  const deps = createRouteDeps();

  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/deployment-overview`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { envVars: Array<{ name: string; set: boolean; source?: string }> };
  const rootKeyRow = body.envVars.find((row) => row.name === "TOVU_INTEGRATIONS_ROOT_KEY");
  assert.ok(rootKeyRow, "the TOVU_INTEGRATIONS_ROOT_KEY row is present");
  assert.equal(rootKeyRow?.set, false, "nothing is configured at the env var or the legacy default file");
  assert.equal(rootKeyRow?.source, "none");
});
