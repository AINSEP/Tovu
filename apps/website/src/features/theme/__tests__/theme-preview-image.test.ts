import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { themePreviewImage } from "../theme-preview-image.js";

test("D-22: thumbnail discovery reports no image, actual PNG, then preferred JPEG", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-theme-preview-"));
  try {
    assert.equal(themePreviewImage({ dir, id: "tovu-starter" }), null);
    mkdirSync(join(dir, "screenshots"));
    writeFileSync(join(dir, "screenshots", "index.png"), "png");
    assert.equal(themePreviewImage({ dir, id: "tovu-starter" }), "/theme-assets/tovu-starter/screenshots/index.png");
    writeFileSync(join(dir, "screenshots", "index.jpg"), "jpg");
    assert.equal(themePreviewImage({ dir, id: "tovu-starter" }), "/theme-assets/tovu-starter/screenshots/index.jpg");
    assert.equal(themePreviewImage({ dir, id: "tovu-starter" }, { assetsServed: false }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
