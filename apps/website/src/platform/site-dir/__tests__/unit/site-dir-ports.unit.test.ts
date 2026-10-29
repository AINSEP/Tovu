import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { bootSiteDir, closeSiteDirBoot } from "../../boot-site-dir.js";
import { initSite } from "../../init-site.js";
import type { BootSiteDirDeps, InitSiteDeps } from "../../ports.js";
import type { SiteStore } from "../../site-store.js";
import { runtimeSchemaVersion } from "../../schema-guard.js";

test("site-dir entry points and their contracts have no imports into server", () => {
  for (const file of ["init-site.ts", "boot-site-dir.ts", "ports.ts", "site-store.ts"]) {
    const source = fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:from\s+|import\s*\()\s*["'][^"']*(?:#src\/server\/|(?:\.\.\/)+server\/)/, file);
  }
});

test("init awaits the injected repair before its commit marker and cleans up a rejection", async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "init-site-ports-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const dir = path.join(parent, "site");
  let repairs = 0;
  const deps: InitSiteDeps = {
    seedNewSiteOwner: async () => assert.fail("a failed repair must prevent owner seeding"),
    runBootDataRepairs: async ({ kernel }) => {
      repairs++;
      assert.equal(kernel.dialect, "sqlite");
      assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false);
      throw new Error("injected repair failure");
    },
    openSiteStore: async () => assert.fail("SQLite init must not open another store"),
    sealConnectionStringForNewSite: async () => assert.fail("SQLite init must not seal a connection string"),
  };
  await assert.rejects(initSite({ dir, deps }), /injected repair failure/);
  assert.equal(repairs, 1);
  assert.equal(fs.existsSync(dir), false);
});

for (const rejectNormalization of [false, true]) {
  test(`store boot injects opening and normalization, closes on ${rejectNormalization ? "failure" : "shutdown"}`, async (t) => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "boot-site-ports-")));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const runtime = runtimeSchemaVersion();
    const storage = { kind: "pglite" } as const;
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "Ports" }));
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: "ports-site", templateId: "starter", templateVersion: "1", schemaVersion: runtime.index, schemaTag: runtime.tag, createdAt: "2026-10-28", storage }));
    const calls: string[] = [];
    const content = { run: async () => {
      calls.push("workspace");
      return [{ id: "ws", name: "Ports", slug: "ports", created_at: "2026-10-28" }];
    } } as unknown as SiteStore["content"];
    const store: SiteStore = { storage, content, chat: {} as SiteStore["chat"], close: async () => { calls.push("close"); } };
    const failure = new Error("normalization failed");
    const deps: BootSiteDirDeps = {
      runBootDataRepairs: async () => assert.fail("the store opener owns repairs for this storage"),
      openSiteStore: async (input) => {
        assert.deepEqual(input, { storage, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" });
        calls.push("open"); return store;
      },
      normalizeSiteVaultAtBoot: async (input) => {
        assert.equal(input.kernel, content); assert.equal(input.workspaceId, "ws"); assert.equal(input.siteDir, dir);
        calls.push("normalize");
        if (rejectNormalization) throw failure;
      },
    };
    if (rejectNormalization) await assert.rejects(bootSiteDir({ dir, deps }), error => error === failure);
    else {
      const result = await bootSiteDir({ dir, deps });
      assert.equal(result.store, store);
      assert.deepEqual(calls, ["open", "workspace", "normalize"]);
      await closeSiteDirBoot(result);
    }
    assert.deepEqual(calls, ["open", "workspace", "normalize", "close"]);
  });
}
