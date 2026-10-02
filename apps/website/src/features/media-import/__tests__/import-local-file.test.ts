import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { ForbiddenError } from "@jini-ai/cms/core";
import {
  InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore,
  InMemoryMediaContentTypeStore, InMemoryMediaRepo, InMemoryTransformDefinitionRepo,
  TOVU_MAX_UPLOAD_BYTES,
} from "../../media/index.js";
import { FS_ROOT_IDS } from "../../fs-files/layout.js";
import { mediaImportAgentToolCatalog } from "../agent-tools.js";
import type { MediaImportToolDeps } from "../tool-registrations.js";

/** t06: real local reads, validator, upload service and in-memory storage; no ports or network. */
const TOOL = "media_import_local_file";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=", "base64");
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from("ftypisom"), Buffer.from([0, 0, 0, 0]), Buffer.from("isomiso2avc1mp41")]);
const RECOVERY = "Ask the owner to attach the file to the chat, then use media_promote_chat_attachment, or choose that folder using the folder control ('No folder set') in the admin chat composer, then retry with root 'custom'.";
interface Result {
  media: { id: string; slug: string; title: string; alt: string; caption: string; credit: string; sha256: string; status: string; version: number; publicUrl: string | null; sourceUrl: string };
}
async function setup(t: test.TestContext, options: { allow?: boolean; maxBytes?: number; unsetCustom?: boolean } = {}) {
  const { buildMediaImportRegistrations, contributeMediaImportTools, mediaImportDerivedRisk } = await import("../tool-registrations.js");
  const parent = fs.mkdtempSync(path.join(tmpdir(), "t06-import-"));
  const rootPath = path.join(parent, "root");
  fs.mkdirSync(rootPath);
  t.after(() => { t.mock.restoreAll(); fs.rmSync(parent, { recursive: true, force: true }); });
  const authorizeCalls: unknown[] = [];
  let resolutions = 0;
  let ids = 0;
  const deps: MediaImportToolDeps = {
    workspaceId: "ws-local", clock: { nowIso: () => "2026-10-01T00:00:00.000Z" }, idGen: { newId: () => `local-${++ids}` },
    mediaRepo: new InMemoryMediaRepo(), assetBlobRepo: new InMemoryAssetBlobRepo(), assetRenditionRepo: new InMemoryAssetRenditionRepo(),
    blobStore: new InMemoryBlobStore(), mediaContentTypeStore: new InMemoryMediaContentTypeStore(), transformDefinitionRepo: new InMemoryTransformDefinitionRepo(),
    mediaImportHttpClient: { send: async () => { assert.fail("local import must not use HTTP"); } },
    authorize: async (request) => { authorizeCalls.push(request); return { allowed: options.allow !== false, reason: "no_grant" }; },
    resolveRoots: () => { resolutions++; return { repo: rootPath, site: rootPath, custom: options.unsetCustom ? undefined : rootPath }; },
    mediaImportLocalMaxBytes: options.maxBytes,
  };
  const putSpy = t.mock.method(deps.blobStore, "put");
  function registration() {
    const found = buildMediaImportRegistrations(deps).find((r) => r.descriptor.id === TOOL);
    assert.ok(found, "media_import_local_file must be wired");
    return found;
  }
  async function run(input: Record<string, unknown>): Promise<Result> {
   
    const ctx: ToolExecutionContext = { input, executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, signal: new AbortController().signal };
    return await registration().handler(ctx) as Result;
  }
  async function noWrites() {
    assert.equal(putSpy.mock.callCount(), 0);
    assert.deepEqual(await deps.mediaRepo.list({ workspaceId: "ws-local" }), []);
    assert.deepEqual(await deps.mediaContentTypeStore.getMany({ workspaceId: "ws-local", sha256s: [createHash("sha256").update(PNG).digest("hex")] }), new Map());
  }
  return { parent, rootPath, deps, registration, run, noWrites, putSpy, authorizeCalls, contributeMediaImportTools, mediaImportDerivedRisk, resolutions: () => resolutions };
}
function rejection(message: string) {
  return (error: unknown) => {
    assert.ok(error instanceof ToolInputError, `expected ToolInputError, received ${error instanceof Error ? error.name : typeof error}`);
    const definition = mediaImportAgentToolCatalog.find((tool) => tool.name === TOOL);
    assert.ok(definition);
    assert.equal(error.message, `${message}. Fix the input and retry — this will not resolve on retry without an input change. Schema for '${TOOL}': ${JSON.stringify(definition.inputSchema)}`);
    return true;
  };
}

test("catalog schema, domain registration and derived risk declare a permission-gated durable mutation", async (t) => {
  const definition = mediaImportAgentToolCatalog.find((entry) => entry.name === TOOL);
  assert.ok(definition, "media_import_local_file must be in media-import catalog");
  const f = await setup(t);
  assert.equal(definition.sideEffects, "mutates-durable-state");
  assert.deepEqual(definition.authorization, { permission: "media.upload" });
  const schema = definition.inputSchema as { additionalProperties: boolean; required: string[]; properties: Record<string, { enum?: string[] }> };
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["root", "path"]);
  assert.deepEqual(schema.properties.root.enum, FS_ROOT_IDS);
  assert.deepEqual(Object.keys(schema.properties).sort(), ["alt", "caption", "path", "root", "title"]);
  assert.equal(f.registration().descriptor.readOnly, false);
  assert.equal(f.mediaImportDerivedRisk.get(TOOL), "mutates-durable-state");
  assert.equal(f.contributeMediaImportTools().domain, "media-import");
  assert.equal(TOVU_MAX_UPLOAD_BYTES, 50 * 1024 * 1024);
});

for (const [filename, bytes, contentType, publicUrl, defaultTitle] of [
  ["photo.mp4", PNG, "image/png", null, "photo"],
  ["hero.png", MP4, "video/mp4", "/m/summer-launch/original", "hero"],
] as const) {
  test(`imports ${contentType} by bytes, preserves metadata and blob bytes, and dedupes repeated imports`, async (t) => {
    const f = await setup(t);
    fs.writeFileSync(path.join(f.rootPath, filename), bytes);
    const putSpy = f.putSpy;
    const first = await f.run({ root: "custom", path: filename, title: "Summer launch", alt: "A summer scene", caption: "Launch video" });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    assert.deepEqual(Object.keys(first), ["media"]);
    assert.deepEqual(first.media, { id: "local-2", slug: "summer-launch", title: "Summer launch", alt: "A summer scene", caption: "Launch video", credit: "", sha256, status: "active", version: 1, publicUrl, sourceUrl: "" });
    assert.deepEqual(await f.deps.mediaContentTypeStore.getMany({ workspaceId: "ws-local", sha256s: [sha256] }), new Map([[sha256, contentType]]));
    const stored = await f.deps.blobStore.get({ storageKey: `ws/ws-local/blobs/${sha256.slice(0, 2)}/${sha256}` });
    assert.deepEqual(Buffer.from(stored), bytes);
    const second = await f.run({ root: "custom", path: filename });
    assert.equal(second.media.sha256, sha256);
    assert.equal(second.media.title, defaultTitle);
    assert.equal(putSpy.mock.callCount(), 1);
    assert.notEqual(second.media.id, first.media.id);
    assert.equal((await f.deps.mediaRepo.list({ workspaceId: "ws-local" })).length, 2);
    assert.equal(await f.deps.blobStore.exists({ storageKey: `ws/ws-local/blobs/${sha256.slice(0, 2)}/${sha256}` }), true);
    assert.deepEqual(f.authorizeCalls[0], { principalId: "owner", workspaceId: "ws-local", permission: "media.upload", entityType: "media", entityId: undefined });
  });
}



for (const [relativePath, message] of [
  ["../outside.png", "path '../outside.png' resolves outside the allowed root"],
  [".env", "path '.env' matches a denied filename pattern and cannot be accessed"],
  ["content.db", "path 'content.db' matches a denied filename pattern and cannot be accessed"],
  ["secrets/photo.png", "path 'secrets/photo.png' contains a denied path segment ('secrets') and cannot be accessed"],
]) {
  test(`refuses ${relativePath} with fs_read_file's exact message before reading`, async (t) => {
    const f = await setup(t);
    const target = path.join(f.rootPath, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, PNG);
    const readSpy = t.mock.method(fs, "createReadStream");
    const syncReadSpy = t.mock.method(fs, "readFileSync");
    await assert.rejects(() => f.run({ root: "repo", path: relativePath }), rejection(message));
    assert.equal(readSpy.mock.callCount(), 0);
    assert.equal(syncReadSpy.mock.callCount(), 0);
    await f.noWrites();
  });
}

test("absolute paths and symlinks outside the root are refused with actionable recovery in the published schema", async (t) => {
  const f = await setup(t);
  const outside = path.join(f.parent, "outside.png");
  fs.writeFileSync(outside, PNG);
  fs.symlinkSync(outside, path.join(f.rootPath, "alias.png"));
  const readSpy = t.mock.method(fs, "createReadStream");
  await assert.rejects(() => f.run({ root: "site", path: outside }), rejection(`path '${outside}' must be relative to the root, not absolute`));
  await assert.rejects(() => f.run({ root: "site", path: "alias.png" }), rejection("path 'alias.png' resolves outside the allowed root through a symbolic link"));
  const schema = mediaImportAgentToolCatalog.find((tool) => tool.name === TOOL)!.inputSchema as { properties: { path: { description: string } } };
  assert.ok(schema.properties.path.description.includes(RECOVERY));
  assert.equal(readSpy.mock.callCount(), 0);
  await f.noWrites();
});

for (const [format, text] of [["SVG", '<svg xmlns="http://www.w3.org/2000/svg"></svg>'], ["HTML", "<!DOCTYPE html><html></html>"], ["PDF", "%PDF-1.7\nnot a photo"]]) {
  test(`refuses ${format} renamed .png by the actual bytes without writes`, async (t) => {
    const f = await setup(t);
    fs.writeFileSync(path.join(f.rootPath, "fake.png"), text);
    const actualType = format === "SVG" ? "image/svg+xml" : format === "HTML" ? "text/html" : "application/octet-stream";
    await assert.rejects(() => f.run({ root: "custom", path: "fake.png" }), rejection(`'fake.png' is not an importable file: its actual bytes are '${actualType}'. Only image/png, image/jpeg, image/gif, image/webp, image/avif, video/mp4, video/webm can be imported (the file extension is deliberately ignored — the bytes decide).`));
    await f.noWrites();
  });
}

test("over-cap local file throws ToolInputError naming stat size and cap before reading", async (t) => {
  const f = await setup(t, { maxBytes: 32 });
  fs.writeFileSync(path.join(f.rootPath, "big.mp4"), Buffer.alloc(33));
  const readSpy = t.mock.method(fs, "createReadStream");
  await assert.rejects(() => f.run({ root: "custom", path: "big.mp4" }), rejection("file 'big.mp4' is 33 bytes and exceeds the 32-byte import limit"));
  assert.equal(readSpy.mock.callCount(), 0);
  await f.noWrites();
});

test("permission denial happens before root resolution, stat or reading", async (t) => {
  const f = await setup(t, { allow: false });
  const statSpy = t.mock.method(fs, "statSync");
  const readSpy = t.mock.method(fs, "createReadStream");
  await assert.rejects(() => f.run({ root: "custom", path: "photo.png" }), (error: unknown) => {
    assert.ok(error instanceof ForbiddenError);
    assert.equal(error.permission, "media.upload");
    assert.equal(error.message, "principal 'owner' is not authorized for 'media.upload' (no_grant)");
    return true;
  });
  assert.equal(f.resolutions(), 0);
  assert.equal(statSpy.mock.callCount(), 0);
  assert.equal(readSpy.mock.callCount(), 0);
  await f.noWrites();
});

test("unset custom root gives the two owner-controlled ways forward", async (t) => {
  const f = await setup(t, { unsetCustom: true });
  const statSpy = t.mock.method(fs, "statSync");
  await assert.rejects(() => f.run({ root: "custom", path: "photo.png" }), rejection(`no folder has been set for the 'custom' root yet. ${RECOVERY}`));
  assert.equal(statSpy.mock.callCount(), 0);
  await f.noWrites();
});

test("arbitrary root directory strings cannot widen the sandbox", async (t) => {
  const f = await setup(t);
  await assert.rejects(() => f.run({ root: f.parent, path: "outside.png" }), rejection(`'${f.parent}' is not a recognized root — expected one of: repo, site, custom`));
  assert.equal(f.resolutions(), 0);
  await f.noWrites();
});


test("growing files are refused during streaming and persist nothing", async (t) => {
  const f = await setup(t, { maxBytes: 32 });
  const target = path.join(f.rootPath, "growing.mp4");
  fs.writeFileSync(target, MP4.subarray(0, 16));
  const original = fs.createReadStream;
  let stream: fs.ReadStream | undefined;
  t.mock.method(fs, "createReadStream", (...args: Parameters<typeof original>) => {
    fs.appendFileSync(target, Buffer.alloc(17));
    stream = original(...args);
    return stream;
  });
  await assert.rejects(() => f.run({ root: "custom", path: "growing.mp4" }), rejection("file 'growing.mp4' is at least 33 bytes and exceeds the 32-byte import limit"));
  assert.ok(stream);
  assert.equal(stream.destroyed, true);
  await f.noWrites();
});

test("a file removed after stat is a model-facing refusal and persists nothing", async (t) => {
  const f = await setup(t);
  const target = path.join(f.rootPath, "vanished.png");
  fs.writeFileSync(target, PNG);
  const original = fs.createReadStream;
  t.mock.method(fs, "createReadStream", (...args: Parameters<typeof original>) => {
    fs.unlinkSync(target);
    return original(...args);
  });
  const resolvedTarget = path.join(fs.realpathSync(f.rootPath), "vanished.png");
  await assert.rejects(() => f.run({ root: "custom", path: "vanished.png" }),
    rejection(`path 'vanished.png' could not be read: ENOENT: no such file or directory, open '${resolvedTarget}'`));
  await f.noWrites();
});


test("empty files are refused without writing media", async (t) => {
  const f = await setup(t);
  fs.writeFileSync(path.join(f.rootPath, "empty.png"), Buffer.alloc(0));
  await assert.rejects(() => f.run({ root: "repo", path: "empty.png" }), rejection("file 'empty.png' is empty — there is nothing to import."));
  await f.noWrites();
});


test("the production cap accepts a binary import above the old 10 MiB upload cap", async (t) => {
  const f = await setup(t);
  const bytes = Buffer.alloc(10 * 1024 * 1024 + 1);
  MP4.copy(bytes);
  fs.writeFileSync(path.join(f.rootPath, "large.mp4"), bytes);
  const result = await f.run({ root: "site", path: "large.mp4" });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(result.media.sha256, sha256);
  const stored = await f.deps.blobStore.get({ storageKey: `ws/ws-local/blobs/${sha256.slice(0, 2)}/${sha256}` });
  assert.deepEqual(Buffer.from(stored), bytes);
});

test("the production 50 MiB cap rejects a sparse oversized file before reading", async (t) => {
  const f = await setup(t);
  const target = path.join(f.rootPath, "huge.mp4");
  fs.writeFileSync(target, MP4);
  fs.truncateSync(target, 50 * 1024 * 1024 + 1);
  const readSpy = t.mock.method(fs, "createReadStream");
  await assert.rejects(() => f.run({ root: "custom", path: "huge.mp4" }), rejection("file 'huge.mp4' is 52428801 bytes and exceeds the 52428800-byte import limit"));
  assert.equal(readSpy.mock.callCount(), 0);
  await f.noWrites();
});

for (const [relativePath, message] of [["missing.png", "file 'missing.png' does not exist"], [".", "path '.' is not a regular file"]]) {
  test(`local importer refuses ${relativePath} without a regular file`, async (t) => {
    const f = await setup(t);
    await assert.rejects(() => f.run({ root: "custom", path: relativePath }), rejection(message));
    await f.noWrites();
  });
}

test("an injected local cap cannot widen the production 50 MiB ceiling", async (t) => {
  const f = await setup(t, { maxBytes: 100 * 1024 * 1024 });
  const target = path.join(f.rootPath, "huge.mp4");
  fs.writeFileSync(target, MP4);
  fs.truncateSync(target, 50 * 1024 * 1024 + 1);
  const readSpy = t.mock.method(fs, "createReadStream");
  await assert.rejects(() => f.run({ root: "custom", path: "huge.mp4" }), rejection("file 'huge.mp4' is 52428801 bytes and exceeds the 52428800-byte import limit"));
  assert.equal(readSpy.mock.callCount(), 0);
  await f.noWrites();
});
