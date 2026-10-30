import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { nativeToolMetadata } from "#src/contracts/core/tool-metadata/index";
import { EgressRefusedError } from "#src/platform/http/index";
import { buildFilesCopyRegistrations, contributeFilesCopyTools, filesCopyDerivedRisk, FILES_COPY_LIMITS } from "../../asset-transfer/copy-tool.js";
import { assetToolHarness, until } from "./asset-tool-fixture.js";

/** Owner 2026-10-27: copy tool through actual source guards, existing destination writers and cards. */
const harness = (t: TestContext, options = {}) => assetToolHarness(t, { ...options, build: buildFilesCopyRegistrations, toolId: "files_copy" });
const source = { root: "picked", path: "logo.png" };
const theme = { kind: "theme", themeId: "match", path: "assets" };
interface Result { applied: boolean; written: string[]; skipped: string[]; media: { id: string; slug: string; publicUrl: string }[] }

/** Folder fixtures remain under the owner-picked root; nested directory layout matters. */
function folder(dir: string, count: number, bytes: Buffer = Buffer.from("asset")) {
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i++) fs.writeFileSync(path.join(dir, `${i}.png`), bytes);
}

test("copy catalog, metadata and risk declarations register one generic recipe surface", () => {
  assert.equal(contributeFilesCopyTools().domain, "files-copy");
  assert.equal(filesCopyDerivedRisk.get("files_copy"), "mutates-durable-state");
  assert.deepEqual(nativeToolMetadata.byId.files_copy?.approval, { class: "edit", confirmation: "policy" });
});

test("picked → theme copies exact binary bytes, checks theme.edit and reloads without a card", async t => {
  const h = await harness(t);
  const result = await h.call({ sources: [source], destination: theme }) as Result;
  assert.deepEqual(result.written, ["assets/logo.png"]);
  assert.deepEqual(fs.readFileSync(path.join(h.theme, "assets/logo.png")), h.png);
  assert.ok(h.permissions.includes("theme.edit"));
  assert.equal(h.emitted.length, 0);
});

test("theme and site sources reuse the guarded file reader, preserving folder structure for globs", async t => {
  const h = await harness(t);
  fs.mkdirSync(path.join(h.theme, "assets/deep"), { recursive: true });
  fs.writeFileSync(path.join(h.theme, "assets/deep/a.png"), h.png);
  fs.writeFileSync(path.join(h.theme, "assets/deep/a.txt"), "text");
  const result = await h.call({ sources: [{ root: "theme", themeId: "match", path: "assets", glob: "**/*.png" }, { root: "site", path: "logo.png" }], destination: { ...theme, path: "assets/copied" } }) as Result;
  assert.deepEqual(result.written, ["assets/copied/deep/a.png", "assets/copied/logo.png"]);
  assert.equal(fs.existsSync(path.join(h.theme, "assets/copied/deep/a.txt")), false);
});

test("folder glob count and bytes are bounded before any destination write", async t => {
  const h = await harness(t);
  folder(path.join(h.picked, "many"), FILES_COPY_LIMITS.maxFiles + 1);
  await assert.rejects(() => h.call({ sources: [{ root: "picked", path: "many", glob: "*.png" }], destination: theme }), /cap/);
  folder(path.join(h.picked, "big"), 3, Buffer.alloc(9 * 1024 * 1024));
  await assert.rejects(() => h.call({ sources: [{ root: "picked", path: "big", glob: "*.png" }], destination: theme }), /byte cap/);
  assert.equal(fs.existsSync(path.join(h.theme, "assets")), false);
});

test("caps count the combined sources, including individually valid folder globs", async t => {
  const h = await harness(t);
  folder(path.join(h.picked, "first"), 30); folder(path.join(h.picked, "second"), 30);
  await assert.rejects(() => h.call({ sources: ["first", "second"].map(p => ({ root: "picked", path: p, glob: "*.png" })), destination: theme }), /caps/);
  assert.equal(fs.existsSync(path.join(h.theme, "assets")), false);
});

test("URL source calls the injected safe fetch port and persists its complete binary result", async t => {
  const h = await harness(t);
  const url = "https://cdn.example.test/hero.png";
  const result = await h.call({ sources: [{ root: "url", url }], destination: theme }) as Result;
  assert.deepEqual(result.written, ["assets/hero.png"]);
  assert.deepEqual(h.requests.map(request => request.url), [url]);
  assert.deepEqual(fs.readFileSync(path.join(h.theme, "assets/hero.png")), h.png);
  await assert.rejects(() => h.call({ sources: [{ root: "url", url: "file:///etc/passwd" }], destination: theme }));
  assert.equal(h.requests.length, 1, "invalid schemes are refused before fetch");
});

test("safe fetch refusals propagate in caller-safe form without writing", async t => {
  const h = await harness(t); const logs: string[] = [];
  h.deps.mediaImportEgressRefusalLog = line => logs.push(line);
  h.deps.mediaImportHttpClient.send = async () => { throw new EgressRefusedError({ message: "resolved internal 10.1.2.3" }, { callerSafeMessage: "Host is not public" }); };
  await assert.rejects(() => h.call({ sources: [{ root: "url", url: "https://private.example.test/logo.png" }], destination: theme }), error => /Host is not public/.test(String(error)) && !String(error).includes("10.1.2.3"));
  assert.ok(logs.some(line => line.includes("10.1.2.3")));
  assert.equal(fs.existsSync(path.join(h.theme, "assets")), false);
});

test("denylisted files, symlinks and escapes are refused, including later invalid sources", async t => {
  const h = await harness(t);
  fs.writeFileSync(path.join(h.picked, ".env"), "secret");
  fs.symlinkSync(path.join(h.picked, "logo.png"), path.join(h.picked, "link.png"));
  for (const p of [".env", "link.png", "../outside.png", "/etc/hosts"]) {
    await assert.rejects(() => h.call({ sources: [source, { root: "picked", path: p }], destination: theme }));
  }
  await assert.rejects(() => h.call({ sources: [source], destination: { ...theme, path: "../escape" } }));
  assert.equal(fs.existsSync(path.join(h.theme, "assets")), false);
});

test("skip, overwrite and rename handle disk collisions and repeated paths within the same batch", async t => {
  const h = await harness(t);
  fs.mkdirSync(path.join(h.theme, "assets")); fs.writeFileSync(path.join(h.theme, "assets/logo.png"), "old");
  const skipped = await h.call({ sources: [source], destination: theme, overwrite: "skip" }) as Result;
  assert.deepEqual(skipped.skipped, ["assets/logo.png"]);
  assert.equal(fs.readFileSync(path.join(h.theme, "assets/logo.png"), "utf8"), "old");
  const renamed = await h.call({ sources: [source, source], destination: theme, overwrite: "rename" }) as Result;
  assert.deepEqual(renamed.written, ["assets/logo-1.png", "assets/logo-2.png"]);
  const overwritten = await h.call({ sources: [source], destination: theme, overwrite: "overwrite" }) as Result;
  assert.deepEqual(overwritten.written, ["assets/logo.png"]);
  assert.deepEqual(fs.readFileSync(path.join(h.theme, "assets/logo.png")), h.png);
  await assert.rejects(() => h.call({ sources: [source, source], destination: theme, overwrite: "overwrite" }), /duplicate destination/);
});

test("site destinations share fs_write_files batch approval; picked destinations are never accepted", async t => {
  const h = await harness(t);
  const input = { sources: [source], destination: { kind: "site", path: "public/images" } };
  await assert.rejects(() => h.call(input, false), /NO_CONFIRMATION_CHANNEL/);
  assert.equal(fs.existsSync(path.join(h.site, "public")), false);
  const pending = h.call(input); await until(() => h.emitted.length > 0);
  assert.equal(fs.existsSync(path.join(h.site, "public")), false);
  h.answer("confirm");
  assert.deepEqual((await pending as Result).written, ["public/images/logo.png"]);
  assert.deepEqual(fs.readFileSync(path.join(h.site, "public/images/logo.png")), h.png);
  await assert.rejects(() => h.call({ sources: [source], destination: { kind: "picked" } }), /fs_write_files/);
});

test("media destination uses the importer and media sources read original bytes", async t => {
  const h = await harness(t);
  const imported = await h.call({ sources: [source], destination: { kind: "media" } }) as Result;
  assert.equal(imported.media[0]!.slug, "logo");
  const copied = await h.call({ sources: [{ root: "media", path: imported.media[0]!.id }], destination: theme }) as Result;
  assert.deepEqual(copied.written, ["assets/logo.png"]);
  assert.deepEqual(fs.readFileSync(path.join(h.theme, "assets/logo.png")), h.png);
  assert.ok(h.permissions.includes("media.upload")); assert.ok(h.permissions.includes("media.read"));
  await assert.rejects(() => h.call({ sources: [source], destination: { kind: "media", path: "nested" } }), /do not have folders/);
});

test("destination authorization fails before any source read or fetch", async t => {
  const h = await harness(t, { allowed: (permission: string) => permission !== "theme.edit" });
  await assert.rejects(() => h.call({ sources: [{ root: "url", url: "https://cdn.example.test/logo.png" }], destination: theme }));
  assert.equal(h.requests.length, 0); assert.equal(h.emitted.length, 0);
});
