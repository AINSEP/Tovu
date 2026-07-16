import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSqliteRouteDeps } from "../../deps";
import { runBootLifecycle } from "../../boot-lifecycle";
import type { BootModule } from "../../boot-lifecycle";

/**
 * @file SPEC-030 AC-05 — proves the boot-lifecycle wrapper against the REAL `deps.ts` promises
 * (`settingsReady`/`seoReady`/`newsletterReady`), not only fakes. Uses a real on-disk `content.db`
 * (mirrors every other ADR-046 Phase 1 restart-test's real-file pattern) since `createSqliteRouteDeps`
 * fires these promises immediately at construction.
 */

test("wrapping the real settings/seo/newsletter promises in BootModules reports every one ready", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-boot-lifecycle-real-deps-"));
  const dbPath = join(dir, "content.db");
  try {
    const deps = createSqliteRouteDeps(dbPath);
    const noop = async (): Promise<void> => {};
    const modules: BootModule[] = [
      { name: "settings", owner: "features/settings", criticality: "critical", prepare: () => deps.settingsReady, start: noop, stop: noop },
      { name: "seo", owner: "seo", criticality: "critical", prepare: () => deps.seoReady, start: noop, stop: noop },
      { name: "newsletter", owner: "newsletter", criticality: "optional", prepare: () => deps.newsletterReady, start: noop, stop: noop },
    ];

    const result = await runBootLifecycle(modules);

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.modules.map((m) => ({ name: m.name, status: m.lifecycle.status })),
      [
        { name: "settings", status: "ready" },
        { name: "seo", status: "ready" },
        { name: "newsletter", status: "ready" },
      ]
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
