import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSiteRouteDeps } from "../../runtime/composition/deps.js";
import { runBootLifecycle } from "../../runtime/lifecycle/boot-lifecycle.js";
import type { BootModule } from "../../runtime/lifecycle/boot-lifecycle.js";
import { describeSiteBinding } from "#src/platform/site-dir/site-registry";

// A312: with only `dbPath`, `createSiteRouteDeps` binds to the process's own site (the repo's
// `sites/<id>`) and composes its plugin runtime there. The test pins the disposable `dir` through
// `overrides.siteBinding` and checks the composition's own binding (deterministic in parallel runs).

/**
 * @file SPEC-030 AC-05 — proves the boot-lifecycle wrapper against the REAL `deps.ts` promises
 * (`settingsReady`/`seoReady`/`newsletterReady`), not only fakes. Uses a real on-disk `content.db`
 * (mirrors every other ADR-046 Phase 1 restart-test's real-file pattern) since `createSiteRouteDeps`
 * fires these promises immediately at construction.
 */

test("wrapping the real settings/seo/newsletter promises in BootModules reports every one ready", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-boot-lifecycle-real-deps-"));
  const dbPath = join(dir, "content.db");
  try {
    const deps = await createSiteRouteDeps({}, { dbPath, overrides: { siteBinding: describeSiteBinding({ env: { ...process.env, TOVU_SITE_DIR: dir }, cwd: dir }) } });
    const noop = async (): Promise<void> => {};
    const modules: BootModule[] = [
      { name: "settings", owner: "features/settings", criticality: "critical", prepare: () => deps.settingsReady, start: noop, stop: noop },
      { name: "seo", owner: "seo", criticality: "critical", prepare: () => deps.seoReady, start: noop, stop: noop },
      { name: "newsletter", owner: "newsletter", criticality: "optional", prepare: () => deps.newsletterReady, start: noop, stop: noop },
    ];

    const result = await runBootLifecycle({ modules });

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.modules.map((m) => ({ name: m.name, status: m.lifecycle.status })),
      [
        { name: "settings", status: "ready" },
        { name: "seo", status: "ready" },
        { name: "newsletter", status: "ready" },
      ]
    );
    assert.equal(deps.siteBinding.dir, dir, "the composition must serve the test's disposable site (A312)");
    assert.ok(existsSync(join(dir, "plugins-runtime")), "the plugin runtime is composed inside the disposable site");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
