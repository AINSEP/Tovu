import assert from "node:assert/strict";
import test from "node:test";
import { parseStaticExportInput, allocateStaticExportThemes } from "../static-export-selection.js";

test("static selection preserves ordered IDs, legacy start and resume; rejects malformed batches", () => {
  const jobId = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(parseStaticExportInput({ input: {} }), {});
  assert.deepEqual(parseStaticExportInput({ input: { jobId } }), { jobId });
  assert.deepEqual(parseStaticExportInput({ input: { themeIds: ["zoran-poster", "zoran-editorial"] } }), { themeIds: ["zoran-poster", "zoran-editorial"] });
  for (const input of [null, [], "text", { extra: true }, { jobId: "bad" }, { jobId, themeIds: ["poster"] }, { themeIds: [] }, { themeIds: [1] }, { themeIds: ["a", "a"] }, { themeIds: ["../a"] }, { themeIds: ["%2fa"] }, { themeIds: [""] }]) {
    assert.throws(() => parseStaticExportInput({ input }), { code: "INVALID_INPUT" }, JSON.stringify(input));
  }
  const many = Array.from({ length: 50 }, (_, index) => `theme-${index}`);
  assert.deepEqual(parseStaticExportInput({ input: { themeIds: many } }), { themeIds: many });
});

test("folder allocation strips branding, avoids case/Unicode aliases and stays stable across roster order", () => {
  const themeIds = ["zoran-poster", "poster", "Poster", "zoran-été", "zoran-e\u0301te\u0301"];
  const themes = allocateStaticExportThemes({ themeIds, siteSlug: "zoran-studio" });
  assert.equal(new Set(themes.map(theme => theme.name.normalize("NFC").toLowerCase())).size, 5);
  assert.match(themes.find(theme => theme.themeId === "zoran-poster")!.name, /^poster/);
  assert.deepEqual(new Map(themes.map(theme => [theme.themeId, theme.name])), new Map(allocateStaticExportThemes({ themeIds: [...themeIds].reverse(), siteSlug: "zoran-studio" }).map(theme => [theme.themeId, theme.name])));
});

test("a public URL belongs only to a static export start, never a poll", () => {
  const publicUrl = "https://download.example/site/";
  assert.deepEqual(parseStaticExportInput({ input: { publicUrl } }), { publicUrl });
  assert.deepEqual(parseStaticExportInput({ input: { publicUrl, themeIds: ["none"] } }), { publicUrl, themeIds: ["none"] });
  for (const input of [{ publicUrl: 7 }, { publicUrl: " " }, { jobId: "12345678-1234-1234-1234-123456789012", publicUrl }]) {
    assert.throws(() => parseStaticExportInput({ input }), { code: "INVALID_INPUT" });
  }
});
