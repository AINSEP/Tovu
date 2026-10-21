import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { initSite } from "#src/platform/site-dir/init-site";
import { resolveSiteRoot } from "#src/platform/site-dir/site-root";
import { runPluginInstallCommand } from "../../commands/plugin/install.js";
import { runPluginIntegrityCommand } from "../../commands/plugin/integrity.js";

/**
 * @file `tovu plugin install` against a real, freshly initialised site folder: the default opener
 * boots only the site store, installs the copied package (disabled), and closes the store. Where the
 * copy lands follows `TOVU_PLUGINS_DIR` when set, else `<site>/plugins`.
 */

async function pluginSource(root: string, id: string): Promise<string> {
  const sourceDir = path.join(root, `source-${id}`);
  await mkdir(path.join(sourceDir, "server"), { recursive: true });
  await writeFile(path.join(sourceDir, "server/index.mjs"), "throw new Error('must never run during install');");
  await writeFile(path.join(sourceDir, "jini.plugin.json"), JSON.stringify({ id, name: "Real Site", version: "1.0.0", sdkRange: "*", tier: "tier-3", engine: 1, capabilities: [], hooks: [], fields: [], integrity: {} }));
  await runPluginIntegrityCommand({ dir: sourceDir, write: true }, { output: () => {} });
  return sourceDir;
}

test("install into a real site: default opener, <site>/plugins by default, TOVU_PLUGINS_DIR when set", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "plugin-real-site-")); t.after(() => rm(root, { recursive: true, force: true }));
  const site = path.join(root, "site");
  await initSite({ dir: site, name: "Plugin Install Site" });

  const messages: string[] = [];
  await runPluginInstallCommand({ dir: await pluginSource(root, "real-default"), site, yes: true }, { write: (message) => { messages.push(message); }, env: {} });
  assert.deepEqual(await readdir(path.join(site, "plugins")), ["real-default"]);
  assert.equal(messages.at(-1), "Installed real-default 1.0.0; disabled in every workspace.\n");

  const custom = path.join(root, "custom-plugins");
  await runPluginInstallCommand({ dir: await pluginSource(root, "real-custom"), site, yes: true }, { write: () => {}, env: { TOVU_PLUGINS_DIR: custom } });
  assert.deepEqual(await readdir(custom), ["real-custom"]);
  assert.deepEqual(await readdir(path.join(site, "plugins")), ["real-default"]);
});

test("install into a real PGlite site opens its content store rather than a SQLite handle", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "plugin-real-pglite-")); t.after(() => rm(root, { recursive: true, force: true }));
  const site = path.join(root, "site");
  await initSite({ dir: site, name: "Plugin PGlite Site", storage: { kind: "pglite" } });
  await runPluginInstallCommand({ dir: await pluginSource(root, "real-pglite"), site, yes: true }, { write: () => {}, env: {} });
  assert.deepEqual(await readdir(path.join(site, "plugins")), ["real-pglite"]);
});

test("without --site the install opens the resolved default site root", async () => {
  const opened: string[] = [];
  await assert.rejects(runPluginInstallCommand({ dir: path.join(tmpdir(), "no-such-plugin-source") }, {
    open: async ({ site }) => { opened.push(site); throw new Error("stop after open"); },
  }), /stop after open/);
  assert.deepEqual(opened, [resolveSiteRoot()]);
});
