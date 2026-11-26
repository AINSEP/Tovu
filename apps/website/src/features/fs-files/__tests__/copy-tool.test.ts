import { bindFilesCopyToolDeps } from '#src/server/runtime/composition/asset-tool-host';
import { approvalToolHandler } from '#src/contracts/core/human-confirm';
import { describeWriteBatch } from '@jini-ai/cms/fs-files/tool-registrations';
import { ASSET_SOURCE_SCHEMA, type AssetToolDeps } from '#src/features/asset-transfer/asset-sources';
import { buildFilesCopyAgentToolCatalog } from '@jini-ai/cms/asset-transfer/copy-tool';
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { nativeToolMetadata } from "#src/contracts/core/tool-metadata/index";
import { EgressRefusedError } from "#src/platform/http/index";
import { buildFilesCopyRegistrations, contributeFilesCopyTools, filesCopyDerivedRisk, FILES_COPY_LIMITS } from "@jini-ai/cms/asset-transfer/copy-tool";
import { assetToolHarness, until } from "./asset-tool-fixture.js";
import { THEME_IMPORT_ACCEPT, THEME_IMPORT_MAX_BYTES, THEME_IMPORT_POLICY } from "#src/features/theme/asset-operations";

const videoImport = { ports: {}, reportNote: () => assert.fail("image copies must not attempt video conversion") };
/** Owner 2026-10-27: copy tool through actual source guards, existing destination writers and cards. */
const harness = (t: TestContext, options = {}) => assetToolHarness(t, { ...options, build: (deps, surfaces) => buildFilesCopyRegistrations({ deps: bindFilesCopyToolDeps({ deps, videoImport }), surfaces,
    catalog: buildFilesCopyAgentToolCatalog({ sourceSchema: ASSET_SOURCE_SCHEMA, fsReadPermission: 'content.read' }),
    approval: { approvalToolHandler, describeWriteBatch: ({ batch, toolId }) => describeWriteBatch(batch, { toolId }) } }), toolId: "files_copy" });
const source = { root: "picked", path: "logo.png" };
const theme = { kind: "theme", themeId: "match", path: "assets" };
interface Result { applied: boolean; written: string[]; skipped: string[]; media: { id: string; slug: string; publicUrl: string }[] }

/** Folder fixtures remain under the owner-picked root; nested directory layout matters. */
function folder(dir: string, count: number, bytes: Buffer = Buffer.from("asset")) {
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i++) fs.writeFileSync(path.join(dir, `${i}.png`), bytes);
}

test("copy catalog, metadata and risk declarations register one generic recipe surface", () => {
  assert.equal(contributeFilesCopyTools({ catalog: buildFilesCopyAgentToolCatalog({ sourceSchema: ASSET_SOURCE_SCHEMA, fsReadPermission: 'content.read' }),
    approval: { approvalToolHandler, describeWriteBatch: ({ batch, toolId }) => describeWriteBatch(batch, { toolId }) },
    bindDeps: ({ deps }: { deps: AssetToolDeps }) => bindFilesCopyToolDeps({ deps, videoImport }) }).domain, "files-copy");
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

test("a disallowed theme write fails preflight before any byte is written or the theme reloads", async t => {
  const h = await harness(t);
  const before = fs.readdirSync(h.theme, { recursive: true }).sort();
  await assert.rejects(() => h.call({ sources: [source], destination: { ...theme, path: ".trash" } }), /inside the trash and cannot be written to directly/);
  assert.equal(fs.existsSync(path.join(h.theme, ".trash/logo.png")), false);
  assert.deepEqual(fs.readdirSync(h.theme, { recursive: true }).sort(), before);
  assert.equal(h.emitted.length, 0);
});

test("an unknown theme destination is a caller error that carries the tool's schema", async t => {
  // Theme shape errors (`isShapeRejection`) must be classed as caller errors, so the refusal
  // publishes the schema back instead of surfacing as an undecorated failure.
  const h = await harness(t);
  await assert.rejects(() => h.call({ sources: [source], destination: { ...theme, themeId: "no-such-theme" } }), /Schema for 'files_copy'/);
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
  assert.deepEqual(renamed, { applied: true, written: ["assets/logo-1.png", "assets/logo-2.png"], skipped: [],
    status: h.deps.assetHost.findTheme({ themeId: "match" }).status,
    errors: h.deps.assetHost.findTheme({ themeId: "match" }).errors });
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

test("files_copy's per-file cap and URL theme-fetch policy are the theme owner's, bound by the host", async t => {
  // The copy catalog states the cap itself (it is built before any host port exists); this pins it
  // to the theme import cap so the two cannot drift, and pins the host binding to the theme policy.
  assert.equal(FILES_COPY_LIMITS.maxFileBytes, THEME_IMPORT_MAX_BYTES);
  const { deps: { assetHost: host } } = await harness(t);
  assert.equal(host.themeImportFetch.policy, THEME_IMPORT_POLICY);
  assert.equal(host.themeImportFetch.accept, THEME_IMPORT_ACCEPT);
});
