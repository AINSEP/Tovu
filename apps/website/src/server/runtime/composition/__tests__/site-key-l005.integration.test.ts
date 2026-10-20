import { isolatedCatalogHome } from "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { FixedSiteKeyKeyring } from "#src/features/webhooks/keyring.env";
import { siteKeySources } from "#src/features/webhooks/site-key-sources";
import * as vaultBoot from "../vault-boot.js";

// Exercise the boot caller as well as the key reader: a relocated database cannot choose either
// the site's key or the plugin directory used to build its vault-kind registry.
test("L005: composition discovers the bound site's key and passes its directory to vault boot", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "l005-site-key-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const siteDir = path.join(root, "site");
  const themesDir = path.join(siteDir, "themes");
  const uploadsDir = path.join(siteDir, "uploads");
  await mkdir(themesDir, { recursive: true });
  await mkdir(uploadsDir);
  const siteKeyId = "l005-bound-site";
  await writeFile(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: siteKeyId, siteKeyId }));
  const keyPath = siteKeySources({ mode: "local", env: {}, home: isolatedCatalogHome, cwd: root, siteKeyId })
    .find(source => source.kind === "per-site-file")?.path;
  assert.ok(keyPath);
  await mkdir(path.dirname(keyPath), { recursive: true });
  const material = randomBytes(32).toString("hex");
  await writeFile(keyPath, material, { mode: 0o600 });
  t.after(() => rm(keyPath, { force: true }));
  const runtimeMode = process.env.TOVU_RUNTIME_MODE;
  process.env.TOVU_RUNTIME_MODE = "local";
  t.after(() => {
    if (runtimeMode === undefined) delete process.env.TOVU_RUNTIME_MODE;
    else process.env.TOVU_RUNTIME_MODE = runtimeMode;
  });
  let bootSiteDir: string | undefined;
  t.mock.module("../vault-boot.js", { namedExports: {
    ...vaultBoot,
    normalizeSiteVaultAtBoot: async (...args: Parameters<typeof vaultBoot.normalizeSiteVaultAtBoot>) => {
      bootSiteDir = args[0].siteDir;
      return vaultBoot.normalizeSiteVaultAtBoot(...args);
    },
  } });
  const { createSiteRouteDeps } = await import("../deps.js");
  let close: (() => Promise<void>) | undefined;
  try {
    const deps = await createSiteRouteDeps(path.join(root, "relocated", "content.db"), {
      themesDir, uploadsDir,
      siteBinding: { dir: siteDir, name: "site", dirOverridden: true, switcherCompatible: false },
      onStoreOpened: store => { close = () => store.close(); },
    });
    await deps.identityReady;
    assert.equal(bootSiteDir, siteDir, "vault contributions load from the served site's directory");
    const input = { workspaceId: deps.workspaceId, purpose: "l005-pin", info: "bound-site" };
    assert.deepEqual(await deps.siteAssistantSecretKeyring.derive(input),
      await new FixedSiteKeyKeyring(material).derive(input), "the site's per-site key wins over ambient sources");
  } finally {
    await close?.();
  }
});
