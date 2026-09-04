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
