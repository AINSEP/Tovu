/**
 * @file AW-7 Tier 1 wiring in the REAL composition root (`deps.ts`, SQLite): the shipped
 * `testimonials-faq` sample installs into the site's plugins dir and turning it on writes its two
 * content types to `content.db` through the deferred ports `deps.ts` hands the plugin runtime.
 * (`app.ts`'s hermetic root is covered end to end by `testimonials-faq-sample.integration.test.ts`.)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";

import { setPluginEnabled } from "#src/features/plugin-runtime/activation";
import { bootSiteDir, closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { initSite } from "#src/platform/site-dir/init-site";

const SAMPLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../features/plugin-runtime/samples/testimonials-faq");

test("deps.ts: turning on the tier-1 sample creates its content types in content.db, recorded as the plugin", async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "aw7-wiring-"));
  const dir = path.join(parent, "site");
  const previousPluginsDir = process.env.TOVU_PLUGINS_DIR;
  process.env.TOVU_PLUGINS_DIR = path.join(parent, "plugins");
  await initSite({ dir, name: "AW-7 Wiring Site" });
  const boot = await bootSiteDir({ dir });
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
    db: boot.db,
    workspaceId: boot.workspaceId,
    uploadsDir: path.join(dir, "uploads"),
    themesDir: path.join(dir, "themes"),
    siteBinding: { dir, name: "AW-7 Wiring Site", dirOverridden: true, switcherCompatible: false },
  });
  t.after(async () => {
    await deps.pluginRuntimeReady;
    await closeSiteDirBoot(boot);
    if (previousPluginsDir === undefined) delete process.env.TOVU_PLUGINS_DIR;
    else process.env.TOVU_PLUGINS_DIR = previousPluginsDir;
    fs.rmSync(parent, { recursive: true, force: true });
  });

  const installer = deps.pluginInstaller;
  assert.ok(installer, "the real root always has a plugins dir");
  const preview = await installer.preview({ sourceDir: SAMPLE_DIR });
  await installer.install({ sourceDir: SAMPLE_DIR, expectedDigest: preview.digest });
  await setPluginEnabled({
    deps: { clock: { nowMs: () => Date.now() }, repo: deps.pluginActivationRepo, discovery: await deps.discoverPlugins(), onEnabled: deps.onPluginEnabled, onDisabled: deps.onPluginDisabled },
    input: { workspaceId: deps.workspaceId, pluginId: "testimonials-faq", enabled: true },
  });

  const faq = await deps.contentTypeRepo.findByKey({ workspaceId: deps.workspaceId, key: "faq" });
  assert.deepEqual(faq?.fields.map((field) => field.name), ["answer", "category", "order"]);
  const testimonial = await deps.contentTypeRepo.findByKey({ workspaceId: deps.workspaceId, key: "testimonial" });
  assert.deepEqual(testimonial?.fields.map((field) => field.name), ["quote", "role", "rating", "order"]);
});
