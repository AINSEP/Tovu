import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createCustomCredential, resolveCustomCredentialByLabel } from "#src/features/custom-credentials/index";
import type { RouteDeps } from "#src/server/routes/types";
import { openProjectStore } from "#src/server/runtime/composition/project-store";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";

/**
 * @file The real composition root (`deps.ts`) wires custom credentials project-first (owner
 * 2026-10-25): a key saved from site A lands in the shared `project.db` and site B of the same project
 * reads it; with a project store that cannot open, saves stay in the site's own vault.
 */

function withSiteKey(t: TestContext, hex: string): void {
  const previous = process.env.TOVU_SITE_KEY;
  process.env.TOVU_SITE_KEY = hex;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_SITE_KEY; else process.env.TOVU_SITE_KEY = previous; });
}

async function bootSite(required: { siteDir: string; openProjectStore: () => ReturnType<typeof openProjectStore> }): Promise<{ deps: RouteDeps; close: () => Promise<void> }> {
  fs.mkdirSync(required.siteDir, { recursive: true });
  let close = async () => {};
  const deps = await createSiteRouteDeps(path.join(required.siteDir, "content.db"), { openProjectStore: required.openProjectStore,
    siteBinding: { dir: required.siteDir, name: path.basename(required.siteDir), dirOverridden: true, switcherCompatible: false },
    onStoreOpened: (store) => { close = () => store.close(); } });
  await deps.identityReady;
  return { deps, close: async () => { await deps.pluginRuntimeReady; await close(); } };
}

const saveKey = (deps: RouteDeps, token: string) => createCustomCredential({ repo: deps.customCredentialSetRepo, sealer: deps.siteAssistantSecretSealer,
  keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen },
{ workspaceId: deps.workspaceId, label: "hosting", category: "hosting", baseUrl: "https://api.example.test", connection: { token } });

test("a key saved from site A lands in project.db and site B of the same project uses it", async (t) => {
  withSiteKey(t, "ab".repeat(32));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-project-credentials-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sitesHome = path.join(root, "Tovu");
  const projectStore = () => openProjectStore({ sitesHome, home: path.join(root, "home") });
  const token = `tok-${"s".repeat(14)}`;
  const a = await bootSite({ siteDir: path.join(sitesHome, "site-a"), openProjectStore: projectStore });
  try {
    const saved = await saveKey(a.deps, token);
    assert.equal(saved.scope, "project");
    assert.equal(JSON.stringify(saved).includes(token), false);
  } finally { await a.close(); }
  const b = await bootSite({ siteDir: path.join(sitesHome, "site-b"), openProjectStore: projectStore });
  try {
    const resolved = await resolveCustomCredentialByLabel({ repo: b.deps.customCredentialSetRepo, sealer: b.deps.siteAssistantSecretSealer }, { workspaceId: b.deps.workspaceId, label: "hosting" });
    assert.equal(resolved?.connection.token, token);
  } finally { await b.close(); }
});

test("a project store that can't open: a key still saves, in the site's own vault", async (t) => {
  withSiteKey(t, "cd".repeat(32));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-project-credentials-down-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const originalWarn = console.warn;
  console.warn = () => {};
  t.after(() => { console.warn = originalWarn; });
  const site = await bootSite({ siteDir: path.join(root, "site"), openProjectStore: () => Promise.reject(Object.assign(new Error("EACCES"), { code: "EACCES" })) });
  try {
    const saved = await saveKey(site.deps, `tok-${"d".repeat(14)}`);
    assert.equal("scope" in saved, false, "site-only: no project store attached");
    assert.equal((await site.deps.customCredentialSetRepo.listByWorkspace({ workspaceId: site.deps.workspaceId })).length, 1);
  } finally { await site.close(); }
});
