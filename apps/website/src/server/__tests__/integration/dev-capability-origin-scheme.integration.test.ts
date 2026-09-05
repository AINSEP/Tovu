import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSqliteRouteDeps } from "../../runtime/composition/deps.js";

/**
 * @file Regression coverage for the `dev-capability` origin `createSqliteRouteDeps`
 * (`server/runtime/composition/deps.ts`) seeds at boot via `seedDevCapabilityOrigin`
 * (`platform/db/sqlite/origin-repo.sqlite.ts`).
 *
 * Commit 51c59f5c ("feat(dev): terminate TLS on the API dev server too, so both dev servers agree
 * on one scheme") made the real dev API server on :3000 HTTPS-only (mkcert), but this seed's
 * `scheme` stayed a hardcoded `"http"` literal — the same drift class `apps/admin/src/lib/
 * site-url.ts`'s dev fallback had. `originRegistry.canonicalOrigin` backs real absolute-URL
 * construction (redirects' `canonicalOrigin`, newsletter confirmation/unsubscribe links, site
 * evidence collection), so a stale scheme here silently ships broken `http://` links from a
 * dev/self-hosted boot whose API only accepts `https://`.
 */

function mkTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-dev-capability-origin-"));
  return path.join(dir, "content.db");
}

test("a fresh boot's dev-capability origin resolves to scheme https, matching the dev API server's own TLS termination (51c59f5c)", async () => {
  const dbPath = mkTempDbPath();
  try {
    const deps = createSqliteRouteDeps(dbPath);
    const origin = await deps.originRegistry.canonicalOrigin({ workspaceId: deps.workspaceId });
    assert.equal(origin.scheme, "https");
    assert.equal(origin.host, "localhost");
    assert.equal(origin.port, 3000);
  } finally {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

/**
 * REGRESSION (2026-09-05 audit finding, Chunk D finding 3): `seedDevCapabilityOrigin`'s `scheme`
 * was a hardcoded `"https"` literal that never consulted `resolveDevTls`/`deriveDevScheme`
 * (`server/runtime/boot/dev-tls.ts`) — the very functions this window's own commit introduced for
 * exactly this purpose. Two real, disclosed dev/CI environments boot the API on plain HTTP:
 * a fresh clone with no `.certs/` (dev-tls.ts's own header), and `TOVU_DISABLE_DEV_TLS`, which every
 * hermetic Playwright `webServer` under `development/*.config.ts` sets. In both, this seed kept
 * stamping `https://localhost:3000/...` into canonical-origin-derived URLs (redirects, newsletter
 * confirmation/unsubscribe links, site evidence) while the server only ever answered on `http://`.
 *
 * This exercises the `TOVU_DISABLE_DEV_TLS` case directly rather than deleting the real cert pair
 * this repo's checkout happens to have under `.certs/` (that would make the test destructive and
 * order-dependent on other suites) — it is the same "TLS inactive" branch `resolveDevTls` itself
 * unit-tests, reached here through the real composition root end to end.
 */
test("REGRESSION: the dev-capability origin's scheme is http, not hardcoded https, when TOVU_DISABLE_DEV_TLS disables dev TLS", async () => {
  const dbPath = mkTempDbPath();
  const originalDisableFlag = process.env.TOVU_DISABLE_DEV_TLS;
  process.env.TOVU_DISABLE_DEV_TLS = "1";
  try {
    const deps = createSqliteRouteDeps(dbPath);
    const origin = await deps.originRegistry.canonicalOrigin({ workspaceId: deps.workspaceId });
    assert.equal(origin.scheme, "http");
    assert.equal(origin.host, "localhost");
    assert.equal(origin.port, 3000);
  } finally {
    if (originalDisableFlag === undefined) delete process.env.TOVU_DISABLE_DEV_TLS;
    else process.env.TOVU_DISABLE_DEV_TLS = originalDisableFlag;
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});
