import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initSite, bootSiteDir } from "#src/server/runtime/composition/site-dir";
import { closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { createSiteRouteDeps } from "../deps.js";
import type { SiteStore } from "../open-site-store.js";
import { drainBootReadiness } from "../../../__tests__/helpers/unrun-site-boot.js";

/** deskfx2: real boot must seed a nested override without recreating an unavailable site root. */
test("deskfx2 NIT: existing site boots with a themes override whose parent is absent", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-nested-theme-boot-")), dir = path.join(parent, "site");
  let boot: Awaited<ReturnType<typeof bootSiteDir>> | undefined;
  let deps: Awaited<ReturnType<typeof createSiteRouteDeps>> | undefined;
  let composed: SiteStore | undefined;
  try {
    await initSite({ dir, name: "Nested themes" });
    boot = await bootSiteDir({ dir });
    const themesDir = path.join(dir, "custom", "nested", "themes");
    deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
      db: boot.db, store: boot.store, workspaceId: boot.workspaceId,
      onStoreOpened: (store) => { composed = store; }, uploadsDir: path.join(dir, "uploads"), themesDir,
      siteBinding: { dir, name: "site", dirOverridden: true, switcherCompatible: false },
    });
    await drainBootReadiness(deps);
    assert.equal(deps.themesDir, themesDir);
    assert.equal(fs.existsSync(path.join(themesDir, "static", "tovu-starter", "theme.json")), true);
  } finally {
    if (deps) await drainBootReadiness(deps).catch(() => undefined);
    if (boot) await closeSiteDirBoot(boot, composed);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
