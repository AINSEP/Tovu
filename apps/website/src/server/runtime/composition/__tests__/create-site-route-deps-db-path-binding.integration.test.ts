// The S3 provider ships in @jini-ai/agent-plugins/s3-compatible: boot over the composed bundle, as the build does.
import "../../../../features/agent-plugins/__tests__/fixtures/composed-bundle-env.js";
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { describeSiteBinding } from "#src/platform/site-dir/index";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { resolveSiteBindingOverride } from "#src/server/runtime/composition/site-deps/overrides";

/**
 * @file A312 — a composition handed only a `dbPath` must serve that database's own folder. It used to
 * bind to the process's site (`sites/<name>` under the repo), so every test that booted a disposable
 * database wrote themes, agent plugins and uploads into the real site.
 */

function tempSite(t: test.TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-dbpath-binding-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Every file path under `dir` (relative), so an added file anywhere shows up. */
function listTree(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return (fs.readdirSync(dir, { recursive: true }) as string[]).map(String).sort();
}

test("A312: a dbPath-only override resolves to the database's own folder, not the process's site", (t) => {
  const dir = tempSite(t);
  const binding = resolveSiteBindingOverride({}, { dbPath: path.join(dir, "content.db") });
  assert.equal(binding.dir, dir);
  assert.equal(binding.name, path.basename(dir));
  assert.equal(binding.switcherCompatible, false, "a database-derived folder is never switchable");
});

test("A312: an in-memory db, an explicit binding and the process's own site keep their bindings", (t) => {
  const own = describeSiteBinding();
  assert.deepEqual(resolveSiteBindingOverride({}, { dbPath: ":memory:" }), own);
  assert.deepEqual(resolveSiteBindingOverride({}), own);
  assert.deepEqual(resolveSiteBindingOverride({}, { dbPath: path.join(own.dir, "content.db") }), own);
  const explicit = { ...own, dir: tempSite(t), name: "explicit" };
  assert.equal(resolveSiteBindingOverride({ siteBinding: explicit }, { dbPath: path.join(own.dir, "content.db") }), explicit);
});

test("A312: booting a composition from only a dbPath writes nothing into the repo's sites/ folder", async (t) => {
  const real = describeSiteBinding().dir;
  const before = listTree(real);
  const dir = tempSite(t);
  const deps = await createSiteRouteDeps({}, { dbPath: path.join(dir, "content.db") });
  t.after(async () => { await deps.contentKernel?.close(); });
  await Promise.all([deps.identityReady, deps.settingsReady, deps.pluginRuntimeReady, deps.blobHydrationReady].map((ready) => Promise.resolve(ready).catch(() => undefined)));
  assert.equal(deps.siteBinding.dir, dir, "the composition is bound to its disposable site");
  assert.deepEqual(listTree(real), before, "nothing was written under the process's real site");
  assert.ok(fs.existsSync(path.join(dir, "themes")), "the disposable site received its own themes");
});
