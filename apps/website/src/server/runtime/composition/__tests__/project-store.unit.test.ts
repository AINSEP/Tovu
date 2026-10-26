import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { ensureProjectKey, openProjectStore, projectDbPath, projectKeyFilePath } from "../project-store.js";

/**
 * @file `project.db` on a real filesystem (temp dirs only): the project key is minted once (0600,
 * outside the sites root), the same file serves two openers (the web app and the desktop app), its
 * secrets are sealed (plaintext never in the file), and a wrong key cannot read them.
 */

function dirs(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-project-store-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { home: path.join(root, "home"), sitesHome: path.join(root, "home", "Documents", "Tovu") };
}

test("the project key is minted once (0600, under ~/.tovu, never in the sites root) and then reused", (t) => {
  const { home, sitesHome } = dirs(t);
  const first = ensureProjectKey({ home }, { mint: () => "ab".repeat(32) });
  const second = ensureProjectKey({ home }, { mint: () => "cd".repeat(32) });
  assert.equal(first, "ab".repeat(32));
  assert.equal(second, first, "an existing key is never replaced");
  const file = projectKeyFilePath({ home });
  assert.equal(file, path.join(home, ".tovu", "project-key.hex"));
  assert.ok(!file.startsWith(sitesHome));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test("a damaged key file is refused, never overwritten; a non-EEXIST write failure surfaces", (t) => {
  const { home } = dirs(t);
  fs.mkdirSync(path.join(home, ".tovu"), { recursive: true });
  fs.writeFileSync(projectKeyFilePath({ home }), "not-a-key");
  assert.throws(() => ensureProjectKey({ home }), /does not hold a 64-character hex key/);
  assert.equal(fs.readFileSync(projectKeyFilePath({ home }), "utf8"), "not-a-key");
  const blocked = path.join(home, "blocked");
  fs.mkdirSync(path.join(blocked, ".tovu", "project-key.hex"), { recursive: true });
  assert.throws(() => ensureProjectKey({ home: blocked }), (error: NodeJS.ErrnoException) => error.code === "EISDIR" || error.code === "EEXIST" || error.code === "EPERM");
});

test("web and desktop open the SAME project.db: a save through one is read by the other; secrets are sealed at rest", async (t) => {
  const { home, sitesHome } = dirs(t);
  const web = await openProjectStore({ sitesHome, home });
  const desktop = await openProjectStore({ sitesHome, home });
  t.after(() => { web.close({}); desktop.close({}); });
  assert.equal(web.dbPath, projectDbPath({ sitesHome }));
  assert.equal(desktop.dbPath, web.dbPath);
  assert.equal(web.config.scope, "project");
  await web.config.write({ pluginId: "observability-opentelemetry", config: { settings: { endpoint: "https://otlp.example.test" }, secrets: { headers: "Authorization=Basic UFJPSkVDVC1TRUNSRVQ=" } } });
  assert.deepEqual(await desktop.config.read({ pluginId: "observability-opentelemetry" }),
    { settings: { endpoint: "https://otlp.example.test" }, secrets: { headers: "Authorization=Basic UFJPSkVDVC1TRUNSRVQ=" } });
  web.close({});
  desktop.close({});
  const bytes = fs.readFileSync(web.dbPath);
  assert.equal(bytes.includes("UFJPSkVDVC1TRUNSRVQ="), false, "the secret is sealed, not stored in plaintext");
  assert.equal(bytes.includes("otlp.example.test"), false, "plugin-state values are sealed too");
});

test("reopening keeps the data (own migration ledger, idempotent); a different project key cannot read the sealed rows", async (t) => {
  const { home, sitesHome } = dirs(t);
  const first = await openProjectStore({ sitesHome, home }, { clock: { nowMs: () => 0 } });
  await first.config.write({ pluginId: "analytics-posthog", config: { settings: { host: "https://ph.example.test" }, secrets: { apiKey: "phc" } } });
  first.close({});
  const again = await openProjectStore({ sitesHome, home });
  assert.deepEqual(await again.config.readSettings({ pluginId: "analytics-posthog" }), { settings: { host: "https://ph.example.test" }, secretNames: ["apiKey"] });
  again.close({});
  fs.writeFileSync(projectKeyFilePath({ home }), `${"ef".repeat(32)}\n`);
  const wrongKey = await openProjectStore({ sitesHome, home });
  t.after(() => wrongKey.close({}));
  await assert.rejects(wrongKey.config.read({ pluginId: "analytics-posthog" }));
});

test("a project.db that cannot be migrated is closed and the error surfaces", async (t) => {
  const { home, sitesHome } = dirs(t);
  fs.mkdirSync(sitesHome, { recursive: true });
  fs.writeFileSync(projectDbPath({ sitesHome }), "this is not a sqlite database, it is plain text padding ".repeat(20));
  await assert.rejects(openProjectStore({ sitesHome, home }));
});
