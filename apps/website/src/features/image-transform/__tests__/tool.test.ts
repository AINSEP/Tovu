import { SharpImageTransformer } from "@jini-ai/cms/media/node";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import sharp from "sharp";
import { nativeToolMetadata } from "#src/contracts/core/tool-metadata/index";

import { FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION } from "../../fs-files/custom-root-permission.js";
import { IMAGE_TRANSFORM_TOOL_ID, buildImageTransformRegistrations, contributeImageTransformTools, imageTransformDerivedRisk } from "../tool.js";

/**
 * @file `image_transform` as the agent calls it: source resolution through the fs-files roots,
 * inspect/dryRun writing nothing, the picked folder going through the fs_write_files card, and a
 * theme destination through the theme binary writer. Every fixture is a temp dir.
 */

import { assetToolHarness, until } from "../../fs-files/__tests__/asset-tool-fixture.js";
const harness = (t: TestContext, options = {}) => assetToolHarness(t, { ...options, build: (deps, surfaces) => buildImageTransformRegistrations({ ...deps, imageCodec: new SharpImageTransformer() }, surfaces), toolId: IMAGE_TRANSFORM_TOOL_ID });

const SOURCE = { root: "site", path: "logo.png" };
const FAVICONS = [{ path: "favicon.ico", format: "ico", icoSizes: [16, 32, 48] }, { path: "apple-touch-icon.png", format: "png", resize: { width: 180, height: 180, fit: "contain" } }];
const listing = (dir: string) => fs.readdirSync(dir, { recursive: true }).map(String).sort();

test("catalog, risk, metadata and contributor agree", () => {
  assert.equal(imageTransformDerivedRisk.get(IMAGE_TRANSFORM_TOOL_ID), "mutates-durable-state");
  assert.deepEqual(nativeToolMetadata.byId[IMAGE_TRANSFORM_TOOL_ID]?.approval, { class: "edit", confirmation: "policy" });
  assert.equal(contributeImageTransformTools().domain, "image-transform");
});

test("inspect (no outputs) reads the source, reports sizes, and writes nothing anywhere", async (t) => {
  const h = await harness(t, { custom: "picked" });
  const before = listing(h.base);
  assert.deepEqual((await h.call({ source: SOURCE }) as { source: unknown }).source, { format: "png", width: 200, height: 100, hasAlpha: true, bytes: fs.statSync(path.join(h.site, "logo.png")).size });
  assert.equal(h.emitted.length, 0, "an inspect asks nothing");
  assert.deepEqual(listing(h.base), before);
});

test("a source outside the allowed roots is refused before any decode", async (t) => {
  const h = await harness(t);
  for (const source of [{ root: "site", path: "../outside.png" }, { root: "repo", path: "outside.png" }, { root: "site", path: "/etc/hosts" }, { mediaId: "m1" }]) {
    await assert.rejects(() => h.call({ source }), `refused: ${JSON.stringify(source)}`);
  }
});

test("picked-folder destination goes through the fs_write_files card: no channel = nothing written; cancel = nothing; confirm = exact files", async (t) => {
  const h = await harness(t, { custom: "picked" });
  await assert.rejects(() => h.call({ source: SOURCE, outputs: FAVICONS, destination: { kind: "picked" } }, false), /NO_CONFIRMATION_CHANNEL/);
  assert.deepEqual(listing(h.picked), ["logo.png"]);

  const declined = h.call({ source: SOURCE, outputs: FAVICONS, destination: { kind: "picked" } });
  await until(() => h.emitted.length === 1);
  const card = JSON.stringify(h.emitted[0]?.payload);
  for (const expected of ["favicon.ico", "apple-touch-icon.png", "2 file(s)", h.picked]) assert.ok(card.includes(expected), `card shows ${expected}`);
  h.answer("cancel");
  assert.equal((await declined as { applied: boolean }).applied, false);
  assert.deepEqual(listing(h.picked), ["logo.png"]);
  assert.ok(h.permissions.includes(FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION));
});

test("confirming the card writes the rendered ico with its requested sizes", async (t) => {
  const h = await harness(t, { custom: "picked" });
  const pending = h.call({ source: SOURCE, outputs: FAVICONS, destination: { kind: "picked" } });
  await until(() => h.emitted.length === 1);
  h.answer("confirm");
  assert.deepEqual((await pending as { written: string[] }).written, ["favicon.ico", "apple-touch-icon.png"]);
  const ico = fs.readFileSync(path.join(h.picked, "favicon.ico"));
  assert.deepEqual([ico.readUInt16LE(4), ico[6], ico[22], ico[38]], [3, 16, 32, 48]);
  assert.equal((await sharp(path.join(h.picked, "apple-touch-icon.png")).metadata()).width, 180);
});

test("a principal without the destination's permission is refused before any card or write", async (t) => {
  const h = await harness(t, { custom: "picked", allowed: (p: string) => p !== FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION });
  const settled = h.call({ source: SOURCE, outputs: FAVICONS, destination: { kind: "picked" } }).then(() => "resolved", () => "rejected");
  assert.equal(await Promise.race([settled, until(() => h.emitted.length > 0).then(() => "carded")]), "rejected");
  assert.equal(h.emitted.length, 0);
  assert.deepEqual(listing(h.picked), ["logo.png"]);
});

test("theme destination writes through the theme binary writer, no card, and reloads the theme", async (t) => {
  const h = await harness(t);
  const result = await h.call({ source: SOURCE, outputs: [{ path: "assets/og.webp", format: "webp", resize: { width: 120, height: 63, fit: "cover" } }], destination: { kind: "theme", themeId: "match" } }) as { written: string[]; status: string };
  assert.deepEqual(result.written, ["assets/og.webp"]);
  assert.equal(h.emitted.length, 0);
  assert.ok(h.permissions.includes("theme.edit"));
  const meta = await sharp(path.join(h.themesDir, "match", "assets", "og.webp")).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["webp", 120, 63]);
  await assert.rejects(() => h.call({ source: SOURCE, outputs: [{ path: "../escape.png", format: "png" }], destination: { kind: "theme", themeId: "match" } }));
  assert.equal(fs.existsSync(path.join(h.themesDir, "escape.png")), false);
});

test("a write without a destination, an unknown destination, and ico into the media library are refused", async (t) => {
  const h = await harness(t);
  await assert.rejects(() => h.call({ source: SOURCE, outputs: FAVICONS }), /destination/);
  await assert.rejects(() => h.call({ source: SOURCE, outputs: FAVICONS, destination: { kind: "bad" } }), /destination/);
  await assert.rejects(() => h.call({ source: SOURCE, outputs: FAVICONS, destination: { kind: "media" } }), /ico/);
});


test("picked, theme and media sources use the shared asset reader", async t => {
  const h = await harness(t);
  const picked = await h.call({ source: { root: "picked", path: "logo.png" } }) as { source: { width: number } };
  assert.equal(picked.source.width, 200);
  fs.mkdirSync(path.join(h.theme, "assets")); fs.writeFileSync(path.join(h.theme, "assets/logo.png"), h.png);
  const themed = await h.call({ source: { root: "theme", themeId: "match", path: "assets/logo.png" } }) as { source: { width: number } };
  assert.equal(themed.source.width, 200);
  const imported = await h.call({ source: SOURCE, outputs: [{ path: "small.png", format: "png", resize: { width: 40 } }], destination: { kind: "media" } }) as { media: { id: string }[] };
  const inspected = await h.call({ source: { root: "media", path: imported.media[0]!.id } }) as { source: { width: number; height: number } };
  assert.deepEqual([inspected.source.width, inspected.source.height], [40, 20]);
  assert.ok(h.permissions.includes("media.read"));
});

test("site destinations use the existing batch approval and guarded writer", async t => {
  const h = await harness(t);
  const input = { source: SOURCE, outputs: [{ path: "public/social.png", format: "png" }], destination: { kind: "site" } };
  await assert.rejects(() => h.call(input, false), /NO_CONFIRMATION_CHANNEL/);
  const pending = h.call(input); await until(() => h.emitted.length > 0);
  assert.equal(fs.existsSync(path.join(h.site, "public/social.png")), false);
  h.answer("confirm");
  assert.deepEqual((await pending as { written: string[] }).written, ["public/social.png"]);
  assert.equal((await sharp(path.join(h.site, "public/social.png")).metadata()).width, 200);
});

test("denied source files and symlinks are refused even inside the selected folder", async t => {
  const h = await harness(t);
  fs.writeFileSync(path.join(h.picked, ".env"), "private");
  fs.symlinkSync(path.join(h.picked, "logo.png"), path.join(h.picked, "link.png"));
  for (const p of [".env", "link.png", "../outside.png"]) await assert.rejects(() => h.call({ source: { root: "picked", path: p } }));
  assert.equal(h.emitted.length, 0);
});

test("media source cap is checked before the blob payload is fetched", async t => {
  const h = await harness(t);
  const imported = await h.call({ source: SOURCE, outputs: [{ path: "small.png", format: "png" }], destination: { kind: "media" } }) as { media: { id: string }[] };
  h.deps.blobStore.sizeOf = async () => 26 * 1024 * 1024;
  const get = t.mock.method(h.deps.blobStore, "get");
  await assert.rejects(() => h.call({ source: { root: "media", path: imported.media[0]!.id } }), /exceeds/);
  assert.equal(get.mock.callCount(), 0);
});
