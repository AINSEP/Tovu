import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { importSiteSlug } from "../../../../features/site-backup/import-backend-steps.js";
import { isInSitesWorkspace } from "../../site-registry.js";
import { createSite } from "#src/server/runtime/composition/site-dir";
import type { SitesWorkspace } from "../../sites-home.js";

const refusal = { name: "ValidationError", message: "Site names must not use Windows device names or end with a dot or space." };
const devices = ["CON", "PRN", "AUX", "NUL", ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`)];

test("site creation and import reject every Windows device name, mixed case and extensions before I/O", async () => {
  for (const device of devices) {
    for (const name of [device, device.toLowerCase(), `${device.toLowerCase()}.txt`, `${device[0]}${device.slice(1).toLowerCase()}.TXT`]) {
      await assert.rejects(createSite({ name }), refusal);
      assert.throws(() => importSiteSlug({ displayName: name }), refusal);
    }
  }
});

test("site creation and import reject trailing dots/spaces instead of trimming them away", async () => {
  for (const name of ["site.", "site ", "site. "]) {
    await assert.rejects(createSite({ name }), refusal);
    assert.throws(() => importSiteSlug({ displayName: name }), refusal);
  }
  assert.throws(() => importSiteSlug({ displayName: "CON!" }), refusal, "slugification must not manufacture a device name");
  for (const name of ["con-site", "com0", "com10", "lpt0", "lpt10", "auxiliary"]) {
    assert.equal(importSiteSlug({ displayName: name }), name);
  }
  assert.equal(importSiteSlug({ displayName: "My Site" }), "my-site");
  assert.equal(importSiteSlug({ displayName: "日本語" }), "imported-site");
});

test("Windows workspace membership resolves case and separators for the home and catalog", () => {
  const workspace = { home: () => "C:\\Users\\Owner\\Tovu\\", registry: () => ({ list: () => [
    { path: "D:\\Saved Sites\\Alpha" },
  ] }) };
  for (const dir of ["c:/users/OWNER/tovu/alpha", "C:\\Users\\Owner\\Tovu\\unused\\..\\alpha"]) {
    assert.equal(isInSitesWorkspace({ dir, workspace }, { platform: "win32" }), true);
  }
  assert.equal(isInSitesWorkspace({ dir: "d:/saved sites/ALPHA/", workspace }, { platform: "win32" }), true);
  for (const dir of ["C:/Users/Owner/Tovu-other/alpha", "C:/Users/Owner/Tovu/nested/alpha", "D:/Saved Sites/Beta"]) {
    assert.equal(isInSitesWorkspace({ dir, workspace }, { platform: "win32" }), false);
  }
});

test("POSIX workspace membership resolves paths but preserves case", () => {
  const workspace = { home: () => "/sites/", registry: () => ({ list: () => [{ path: "/adopted/Alpha" }] }) };
  assert.equal(isInSitesWorkspace({ dir: "/sites/unused/../alpha", workspace }, { platform: "linux" }), true);
  assert.equal(isInSitesWorkspace({ dir: "/Sites/alpha", workspace }, { platform: "linux" }), false);
  assert.equal(isInSitesWorkspace({ dir: "/adopted/Alpha/", workspace }, { platform: "linux" }), true);
  assert.equal(isInSitesWorkspace({ dir: "/adopted/alpha", workspace }, { platform: "linux" }), false);
});
