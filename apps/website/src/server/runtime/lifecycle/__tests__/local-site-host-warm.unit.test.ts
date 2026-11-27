import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { SiteBinding } from "@jini-ai/core/contracts/site/platform-site-dir";
import { shutdownLocalSiteHosts, warmSiteServerForHost } from "../local-site-host.js";

/**
 * @file `warmSiteServerForHost`: the warm-dev URL resolver the serving host hands to its Sites
 * HTTP surface. Only the paths that launch no child are exercised here — the serving site's own
 * URL and an unknown site name, which the real supervisor refuses before any spawn. Dev TLS is
 * pinned off so the scheme never depends on whether this checkout has `.certs/`.
 */

const ENV_KEYS = ["TOVU_ENABLE_SITE_SWITCHER", "TOVU_DEV_WARM_SITES", "TOVU_DEV_WARM_CONTROL_URL", "TOVU_DISABLE_DEV_TLS", "PORT", "NODE_ENV", "TOVU_DEV_SUPERVISOR_PID"] as const;

function withEnv(t: test.TestContext, values: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  const saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, { TOVU_DISABLE_DEV_TLS: "1" }, values);
  t.after(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  });
}

function binding(name: string): SiteBinding {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "warm-host-"));
  return { dir: path.join(root, "sites", name), name, dirOverridden: false, switcherCompatible: true } as SiteBinding;
}

test.afterEach(() => shutdownLocalSiteHosts({}));

test("warm site URLs are off unless warm dev sites are enabled on the serving host itself", t => {
  withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1" });
  assert.equal(warmSiteServerForHost({ binding: binding("off-a"), workspaceId: "ws" }), undefined);
  withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1", TOVU_DEV_WARM_SITES: "1", TOVU_DEV_WARM_CONTROL_URL: "http://localhost:3000" });
  assert.equal(warmSiteServerForHost({ binding: binding("off-b"), workspaceId: "ws" }), undefined, "a warm child delegates to its host instead");
  withEnv(t, { TOVU_DEV_WARM_SITES: "1" });
  assert.equal(warmSiteServerForHost({ binding: binding("off-c"), workspaceId: "ws" }), undefined, "no supervisor without site management");
});

test("the serving site's own warm URL is this listener's admin, on PORT or 3000", async t => {
  withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1", TOVU_DEV_WARM_SITES: "1", PORT: "3456" });
  const host = binding("serving-a");
  const resolve = warmSiteServerForHost({ binding: host, workspaceId: "ws" });
  assert.ok(resolve);
  assert.equal(await resolve({ name: "serving-a" }), "http://localhost:3456/admin/");
  delete process.env.PORT;
  assert.equal(await resolve({ name: "serving-a" }), "http://localhost:3000/admin/");
});

test("an unknown site name is refused by the supervisor without handing out a URL", async t => {
  withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1", TOVU_DEV_WARM_SITES: "1", PORT: "3457" });
  const resolve = warmSiteServerForHost({ binding: binding("serving-b"), workspaceId: "ws" });
  assert.ok(resolve);
  await assert.rejects(resolve({ name: "no-such-site" }), (error: unknown) => {
    assert.equal((error as { code?: string }).code, "SITE_NOT_FOUND");
    return true;
  });
});
