import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSitesWorkspace } from "./shared-sites.ts";
import { ensureIndependentSiteIdentity } from "./site-directory-identity.ts";

test("a copied directory gets its own site identity without losing its explicit key identity", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-copied-identity-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = path.join(root, "original");
  const copy = path.join(root, "copy");
  const marker = ".site-meta.json";
  const originalMeta = { siteId: "original-id", siteKeyId: "older-key-id", schemaVersion: 58, extra: { kept: true } };
  fs.mkdirSync(original);
  fs.writeFileSync(path.join(original, marker), JSON.stringify(originalMeta));
  fs.cpSync(original, copy, { recursive: true });

  const workspace = createSitesWorkspace({}, { env: {}, homeDir: root, sourceRoots: [] });
  workspace.registry({}).merge({ entries: [{ id: "original-id", path: original, name: "Original", createdBy: "Desktop", lastOpened: null }] });
  let minted = 0;
  const options = { workspace, newIdentity: () => { minted++; return "copy-id"; } };
  ensureIndependentSiteIdentity({ siteDir: copy }, options);
  ensureIndependentSiteIdentity({ siteDir: copy }, options);

  assert.equal(minted, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(copy, marker), "utf8")), { ...originalMeta, siteId: "copy-id" });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(original, marker), "utf8")), originalMeta);
  assert.equal(workspace.registry({}).list({}).find(({ id }) => id === "original-id")?.path, original);
});
