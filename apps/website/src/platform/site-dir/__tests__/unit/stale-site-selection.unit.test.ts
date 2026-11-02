import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { devSitesHome } from "../../../../../../../development/scripts/dev-sites-home.mjs";
import { createSitesWorkspace } from "../../sites-home.js";
import { resolveSiteRoot } from "../../site-root.js";

for (const reverse of [false, true]) {
  test(`named dev and server selection ignores a stale duplicate without rewriting the catalog (reverse=${reverse})`, () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-stale-selection-")));
    try {
      const cwd = path.join(root, "repo"), home = path.join(root, "sites-home");
      fs.mkdirSync(cwd); fs.mkdirSync(home);
      const live = path.join(root, "adopted", "blog"), stale = path.join(root, "scratch", "blog");
      fs.mkdirSync(live, { recursive: true });
      fs.writeFileSync(path.join(live, "config.json"), "{}");
      fs.writeFileSync(path.join(live, ".site-meta.json"), "{}");
      const env = { TOVU_SITE: "blog", TOVU_SITES_HOME: home };
      const options = { cwd, homeDir: root, env };
      const registry = createSitesWorkspace({}, options).registry({});
      const entries = [live, stale].map((dir, index) => ({ id: `site-${index}`, name: "Blog", path: dir, createdBy: "Web", lastOpened: null }));
      registry.merge({ entries: reverse ? entries.toReversed() : entries });
      const before = registry.list({});

      assert.equal(devSitesHome({ repoRoot: cwd }, options).dir, live);
      assert.equal(resolveSiteRoot(options), live);
      assert.deepEqual(registry.list({}), before, "offline records remain available for explicit ID selection");
      assert.equal(resolveSiteRoot({ ...options, env: { ...env, TOVU_SITE: "site-1" } }), stale);

      // Two complete sites sharing a name (a live scratch copy) warn and pick deterministically,
      // never refusing the boot; the registry ID still selects the other one.
      fs.mkdirSync(stale, { recursive: true });
      fs.writeFileSync(path.join(stale, "config.json"), "{}");
      fs.writeFileSync(path.join(stale, ".site-meta.json"), "{}");
      assert.equal(devSitesHome({ repoRoot: cwd }, options).dir, live);
      assert.equal(resolveSiteRoot(options), live);
      assert.equal(resolveSiteRoot({ ...options, env: { ...env, TOVU_SITE: "site-1" } }), stale);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}
