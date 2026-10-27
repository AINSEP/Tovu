import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SqlSettingsRepo } from "#src/features/settings/repo";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";

/**
 * @file The boot settings chain (`seoReady` ... `siteTitleReady` in `deps.ts`) is fire-and-forget, and
 * composition then awaits provider-plugin boot before anything reads the chain's tail. RED (Codex check
 * 2026-10-27): a settings registration that failed during that pause left the tail rejected with no
 * handler, an unhandled rejection (which ends the process by default). The tail is observed at once;
 * its consumers still see the rejection.
 */
test("a settings registration failing while provider boot is still pending is never an unhandled rejection, and settingsReady still rejects", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-boot-settings-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  t.after(() => { process.off("unhandledRejection", onUnhandled); });
  // Only the chain's first registration (`site.seo.*`) fails, so the rejection travels the chain alone.
  const saveDefinition = SqlSettingsRepo.prototype.saveDefinition;
  t.mock.method(SqlSettingsRepo.prototype, "saveDefinition", async function (this: SqlSettingsRepo, record: Parameters<typeof saveDefinition>[0]) {
    if (record.namespace === "site.seo") throw new Error("injected settings failure");
    return saveDefinition.call(this, record);
  });
  let releaseProviders!: () => void;
  const providersReleased = new Promise<void>(resolve => { releaseProviders = resolve; });
  let close: (() => Promise<void>) | undefined;
  const siteDir = path.join(dir, "site");
  for (const folder of ["themes", "uploads"]) fs.mkdirSync(path.join(siteDir, folder), { recursive: true });
  const pending = createSiteRouteDeps(path.join(dir, "content.db"), {
    themesDir: path.join(siteDir, "themes"), uploadsDir: path.join(siteDir, "uploads"),
    siteBinding: { dir: siteDir, name: "site", dirOverridden: true, switcherCompatible: false },
    onStoreOpened: store => { close = () => store.close(); },
    bootProviderPlugins: async (...args) => {
      // Several macrotask turns with the settings chain already rejected: Node reports an unobserved
      // rejection at the end of the turn it happened in.
      for (let turn = 0; turn < 5; turn++) await new Promise(resolve => setTimeout(resolve, 20));
      await providersReleased;
      const { bootProviderPlugins } = await import("#src/server/runtime/composition/provider-plugins");
      return bootProviderPlugins(...args);
    },
  });
  t.after(() => close?.());
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.deepEqual(unhandled.map(String), [], "the rejected settings tail is observed while composition is paused");
  releaseProviders();
  const deps = await pending;
  await assert.rejects(deps.siteTitleReady!, /injected settings failure/);
  assert.deepEqual(unhandled.map(String), []);
});
