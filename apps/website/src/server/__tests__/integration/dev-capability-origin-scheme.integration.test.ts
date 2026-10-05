import assert from "node:assert/strict";
import fs from "node:fs";
import type { PathLike } from "node:fs";
import os from "node:os";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import test from "node:test";

import { createSiteRouteDeps } from "../../runtime/composition/deps.js";

/**
 * @file Regression coverage for the `dev-capability` origin `createSiteRouteDeps`
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

for (const hasCerts of [true, false]) {
  test(`a fresh boot derives ${hasCerts ? "https" : "http"} from controlled TLS material`, async (t) => {
    const dbPath = mkTempDbPath();
    const names = ["TOVU_DISABLE_DEV_TLS", "TOVU_PUBLIC_URL", "TOVU_RUNTIME_MODE", "PORT"];
    const original = new Map(names.map(name => [name, process.env[name]]));
    const exists = fs.existsSync;
    const read = fs.readFileSync;
    const isTlsFile = (file: unknown) => /\/\.certs\/localhost(?:-key)?\.pem$/.test(String(file));
    const existsMock = t.mock.method(fs, "existsSync", (file: PathLike) => isTlsFile(file) ? hasCerts : exists(file));
    const readMock = t.mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => isTlsFile(args[0]) ? Buffer.from("fixture PEM; no listener is started") : read(...args));
    syncBuiltinESMExports();
    delete process.env.TOVU_DISABLE_DEV_TLS;
    delete process.env.TOVU_PUBLIC_URL;
    process.env.TOVU_RUNTIME_MODE = "local";
    process.env.PORT = "3000";
    try {
      const deps = await createSiteRouteDeps(dbPath);
      const origin = await deps.originRegistry.canonicalOrigin({ workspaceId: deps.workspaceId });
      assert.equal(origin.scheme, hasCerts ? "https" : "http");
      assert.equal(origin.host, "localhost");
      assert.equal(origin.port, 3000);
      await Promise.all(Object.values(deps).filter(value => value instanceof Promise));
    } finally {
      existsMock.mock.restore();
      readMock.mock.restore();
      syncBuiltinESMExports();
      for (const [name, value] of original) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    }
  });
}

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
    const deps = await createSiteRouteDeps(dbPath);
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
