import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { contentHash } from "../content-hash.js";
import { createRawFileSitePort } from "#src/platform/site-dir/publish-backstop-file";
import { contributeRawFilePublish, undoRawFile } from "../raw-file-contributor.js";
import { createFileBlobIndex } from "../file-blob-index.js";
import { InMemoryBlobStore, InMemoryVersionedMediaRepo, InMemoryAssetBlobRepo, InMemoryMediaContentTypeStore } from "#src/features/media/index";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import type { PackedEntity, PublishContentDeps } from "../type-registry.js";

async function fixture(t: test.TestContext) {
  const siteDir = await mkdtemp(path.join(tmpdir(), "backstop-files-"));
  t.after(() => rm(siteDir, { recursive: true, force: true }));
  const files = createRawFileSitePort({ siteDir });
  const blobs = new InMemoryBlobStore();
  const outbox = new InMemoryOutbox();
  let id = 0;
  const deps: PublishContentDeps = { workspaceId: "ws", clock: { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") },
    idGen: { newId: () => `id-${++id}` }, changeSets: new InMemoryChangeSetRepo([], [], outbox), outbox,
    authorize: async () => ({ allowed: true, reason: "test" }), ports: { media: {
      repo: new InMemoryVersionedMediaRepo(), assetBlobRepo: new InMemoryAssetBlobRepo({}), blobStore: blobs, contentTypeStore: new InMemoryMediaContentTypeStore(),
    } },
    backstop: { files, blobs, fileBlobIndex: createFileBlobIndex(), fileRollbacks: [], coveredTables: [], coveredRoots: ["themes"], selection: { files: ["snippets/footer.html"] } } };
  const handler = contributeRawFilePublish().build(deps);
  const pack = async () => { const entities: PackedEntity[] = []; for await (const entity of handler.pack()) entities.push(entity); return entities; };
  await mkdir(path.join(siteDir, "snippets"));
  return { siteDir, files, deps, blobs, handler, pack };
}

test("source policy blocks private paths and covered roots, naming each blocked selection", async (t) => {
  const f = await fixture(t);
  for (const relPath of [".env", "plugins/x", "themes/static/basic/x.html"]) {
    const handler = contributeRawFilePublish().build({ ...f.deps, backstop: { ...f.deps.backstop!, selection: { files: [relPath] } } });
    const entities = []; for await (const entity of handler.pack()) entities.push(entity);
    assert.deepEqual(entities, []);
    assert.equal((await handler.listSkipped!()).length, 1);
  }
});

test("destination rechecks deny paths, links and actual blob secrets without trusting the sender", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.siteDir, "snippets/footer.html"), "footer");
  const [entity] = await f.pack();
  assert.ok(entity);
  assert.match((await f.handler.precheck({ ...entity, id: ".env", state: { ...entity.state, path: ".env" } }))!, /never|environment/);
  await mkdir(path.join(f.siteDir, "other"));
  await symlink(path.join(f.siteDir, "other"), path.join(f.siteDir, "link"));
  assert.match((await f.handler.precheck({ ...entity, id: "link/footer.html", state: { ...entity.state, path: "link/footer.html" } }))!, /[Ll]ink/);
  const planted = Buffer.from("sk-ant-api03-" + "X".repeat(120));
  await writeFile(path.join(f.siteDir, "snippets/footer.html"), planted);
  assert.deepEqual(await f.pack(), []);
  assert.match((await f.handler.listSkipped!())[0]!.reason, /looks like it holds a key/);
  const sha256 = createHash("sha256").update(planted).digest("hex");
  await f.blobs.putIfAbsent({ workspaceId: "ws", sha256, bytes: planted });
  const state = { ...entity.state, sha256, size: planted.byteLength };
  const forged = { ...entity, state, contentHash: contentHash("raw-file", state), requiredBlobs: [sha256] };
  assert.match((await f.handler.precheck(forged))!, /looks like it holds a key/);
});

test("replace then undo restores bytes, and a later live edit is skipped", async (t) => {
  const f = await fixture(t);
  const file = path.join(f.siteDir, "snippets/footer.html");
  await writeFile(file, "new footer");
  const [entity] = await f.pack();
  assert.ok(entity);
  const sha256 = entity.state.sha256 as string;
  await f.blobs.putIfAbsent({ workspaceId: "ws", sha256, bytes: Buffer.from("new footer") });
  await writeFile(file, "old footer");
  const inverse = await f.files.capture({ relPath: entity.id });
  const inspected = await f.handler.inspect(entity.id);
  await f.handler.apply({ entity, expectedVersion: inspected!.version, principalId: "admin", idempotencyKey: "replace" });
  assert.equal(await readFile(file, "utf8"), "new footer");
  assert.equal(await undoRawFile({ deps: f.deps, entity, before: inverse, afterHash: entity.contentHash }), null);
  assert.equal(await readFile(file, "utf8"), "old footer");
  await writeFile(file, "changed live");
  assert.match((await undoRawFile({ deps: f.deps, entity, before: inverse, afterHash: entity.contentHash }))!, /changed on live/);
  assert.equal(await readFile(file, "utf8"), "changed live");
});

test("creating then undoing removes only the new file, never other live files", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.siteDir, "snippets/footer.html"), "new");
  const [entity] = await f.pack();
  assert.ok(entity);
  await f.blobs.putIfAbsent({ workspaceId: "ws", sha256: entity.state.sha256 as string, bytes: Buffer.from("new") });
  await rm(path.join(f.siteDir, entity.id));
  const before = await f.files.capture({ relPath: entity.id });
  await writeFile(path.join(f.siteDir, "snippets/live-only.html"), "live only");
  await f.handler.apply({ entity, expectedVersion: undefined, principalId: "admin", idempotencyKey: "create" });
  assert.equal(await undoRawFile({ deps: f.deps, entity, before, afterHash: entity.contentHash }), null);
  assert.equal(await f.handler.inspect(entity.id), null);
  assert.equal(await readFile(path.join(f.siteDir, "snippets/live-only.html"), "utf8"), "live only");
});

test("L044 validation rejects malformed metadata before reading blobs", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.siteDir, "snippets/footer.html"), "footer");
  const [entity] = await f.pack();
  assert.ok(entity);
  const states = [{ sha256: 1 }, { sha256: "bad" }, { size: "6" }, { size: 1.5 }, { size: -1 }, { size: 50 * 1024 * 1024 + 1 }, { mode: 0o777 }];
  for (const patch of states) assert.equal(await f.handler.precheck({ ...entity, state: { ...entity.state, ...patch } }), "The raw file has an invalid address, size, mode or checksum.");
  for (const requiredBlobs of [[], ["wrong"], [entity.state.sha256 as string, "extra"]]) {
    assert.match((await f.handler.precheck({ ...entity, requiredBlobs }))!, /invalid address/);
  }
  assert.match((await f.handler.precheck({ ...entity, id: "different" }))!, /invalid address/);
  assert.equal(await f.handler.precheck({ ...entity, state: { ...entity.state, path: 1 } }), "Choose a regular file inside the site folder.");
  assert.match((await f.handler.precheck(entity))!, /verified bytes are missing/);
  await f.blobs.putIfAbsent({ workspaceId: "ws", sha256: entity.state.sha256 as string, bytes: Buffer.from("footer") });
  assert.equal(await f.handler.precheck(entity), null);
  assert.match((await f.handler.precheck({ ...entity, contentHash: "wrong" }))!, /checked content hash/);
  const noMedia = contributeRawFilePublish().build({ ...f.deps, ports: {} });
  assert.equal(await noMedia.precheck(entity), "Library documents cannot be published");
  const unavailable = contributeRawFilePublish().build({ ...f.deps, backstop: undefined });
  assert.equal(await unavailable.precheck(entity), "Send by hand is not available on this destination.");
});

test("L044 pack preserves missing/read-error skips, resets skips and enforces selection caps", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.pack(), []);
  assert.equal((await f.handler.listSkipped!())[0]!.reason, "The selected file no longer exists.");
  await writeFile(path.join(f.siteDir, "snippets/footer.html"), "footer");
  assert.equal((await f.pack()).length, 1);
  assert.deepEqual(await f.handler.listSkipped!(), []);
  for (const error of [new Error("read failed"), "opaque"]) {
    const handler = contributeRawFilePublish().build({ ...f.deps, backstop: { ...f.deps.backstop!, files: { ...f.files, read: async () => { throw error; } } } });
    for await (const _entity of handler.pack()) assert.fail("must skip");
    assert.equal((await handler.listSkipped!())[0]!.reason, error instanceof Error ? error.message : "This file cannot be sent safely.");
  }
  const tooMany = contributeRawFilePublish().build({ ...f.deps, backstop: { ...f.deps.backstop!, selection: { files: Array(51).fill("snippets/footer.html") } } });
  await assert.rejects(async () => { for await (const _entity of tooMany.pack()) {} }, /at most 50 files/);
});

test("L044 apply preserves gateway, OCC and undo guards", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.siteDir, "snippets/footer.html"), "footer");
  const [entity] = await f.pack();
  assert.ok(entity);
  await f.blobs.putIfAbsent({ workspaceId: "ws", sha256: entity.state.sha256 as string, bytes: Buffer.from("footer") });
  const input = { entity, principalId: "admin", idempotencyKey: "pin", expectedVersion: undefined };
  await assert.rejects(f.handler.apply(input), /changed on live/);
  await assert.rejects(contributeRawFilePublish().build({ ...f.deps, authorize: undefined }).apply(input), /gateway is not wired/);
  await assert.rejects(f.handler.apply({ ...input, entity: { ...entity, contentHash: "wrong" } }), /checked content hash/);
  const before = await f.files.capture({ relPath: entity.id });
  assert.match((await undoRawFile({ deps: f.deps, entity, before: { ...before, relPath: "other" }, afterHash: entity.contentHash }))!, /does not match/);
  assert.equal(await undoRawFile({ deps: { ...f.deps, backstop: undefined }, entity, before, afterHash: entity.contentHash }), "Send by hand is not available on this destination.");
  assert.match((await undoRawFile({ deps: { ...f.deps, backstop: { ...f.deps.backstop!, coveredRoots: ["snippets/"] } }, entity, before, afterHash: entity.contentHash }))!, /publishes normally/);
});

test("L044 pack availability, aggregate byte cap and byte verification use typed ports", async (t) => {
  const f = await fixture(t);
  for (const backstop of [undefined, { ...f.deps.backstop!, fileBlobIndex: undefined }, { ...f.deps.backstop!, selection: undefined }]) {
    const handler = contributeRawFilePublish().build({ ...f.deps, backstop });
    for await (const _entity of handler.pack()) assert.fail("must be empty");
  }
  const overCap = contributeRawFilePublish().build({ ...f.deps, backstop: { ...f.deps.backstop!, files: {
    ...f.files, read: async () => ({ bytes: new Uint8Array(50 * 1024 * 1024 + 1), absPath: "/unused", mode: 0o644 }),
  } } });
  await assert.rejects(async () => { for await (const _entity of overCap.pack()) {} }, /totaling at most 50 MB/);
  await writeFile(path.join(f.siteDir, "snippets/footer.html"), "footer");
  const [entity] = await f.pack();
  assert.ok(entity);
  const wrongBytes = contributeRawFilePublish().build({ ...f.deps, backstop: { ...f.deps.backstop!, blobs: {
    put: async () => { throw new Error("no writes expected"); },
    exists: async () => true, get: async () => Buffer.from("wrong!"),
    putIfAbsent: async () => { throw new Error("no writes expected"); },
    remove: async () => { throw new Error("no writes expected"); },
  } } });
  assert.match((await wrongBytes.precheck(entity))!, /verified bytes are missing/);
  assert.match((await wrongBytes.precheck({ ...entity, state: { ...entity.state, size: 7 } }))!, /verified bytes are missing/);
});

test("L044 recorded inverses support compensation and reject later drift", async (t) => {
  const f = await fixture(t);
  const target = path.join(f.siteDir, "snippets/footer.html");
  await writeFile(target, "new");
  const [entity] = await f.pack();
  assert.ok(entity);
  await f.blobs.putIfAbsent({ workspaceId: "ws", sha256: entity.state.sha256 as string, bytes: Buffer.from("new") });
  await writeFile(target, "old");
  const inverses: NonNullable<NonNullable<PublishContentDeps["backstop"]>["inverses"]> = [];
  const fileRollbacks: Array<() => Promise<void>> = [];
  const handler = contributeRawFilePublish().build({ ...f.deps, backstop: { ...f.deps.backstop!, inverses, fileRollbacks } });
  const prior = await handler.inspect(entity.id);
  await handler.apply({ entity, expectedVersion: prior!.version, principalId: "admin", idempotencyKey: "compensate" });
  assert.equal(inverses.length, 1);
  assert.equal(fileRollbacks.length, 1);
  await fileRollbacks[0]!();
  assert.equal(await readFile(target, "utf8"), "old");
  await assert.rejects(fileRollbacks[0]!(), /changed on live/);
});

test("L044 undo covered roots remain case sensitive (reported, not fixed)", async (t) => {
  const f = await fixture(t);
  const target = path.join(f.siteDir, "snippets/footer.html");
  await writeFile(target, "footer");
  const [entity] = await f.pack();
  assert.ok(entity);
  const before = await f.files.capture({ relPath: entity.id });
  const deps = { ...f.deps, backstop: { ...f.deps.backstop!, coveredRoots: ["SNIPPETS"] } };
  assert.equal(await contributeRawFilePublish().build(deps).inspect(entity.id), null);
  assert.equal(await undoRawFile({ deps, entity, before, afterHash: entity.contentHash }), null);
});

test("a destination without a blob store treats verified bytes as missing, and an unreadable live file inspects as absent", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.siteDir, "snippets/footer.html"), "footer");
  const [entity] = await f.pack();
  assert.ok(entity);
  const noBlobs = contributeRawFilePublish().build({ ...f.deps, backstop: { ...f.deps.backstop!, blobs: undefined } });
  assert.match((await noBlobs.precheck(entity))!, /verified bytes are missing/);
  const unreadable = contributeRawFilePublish().build({ ...f.deps, backstop: { ...f.deps.backstop!, files: { ...f.files, read: async () => { throw new Error("EACCES"); } } } });
  assert.equal(await unreadable.inspect(entity.id), null);
});

test("precheck turns only typed row refusals into reasons; an unexpected port failure still propagates", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.siteDir, "snippets/footer.html"), "footer");
  const [entity] = await f.pack();
  assert.ok(entity);
  const failing = contributeRawFilePublish().build({ ...f.deps, backstop: { ...f.deps.backstop!, files: { ...f.files, check: async () => { throw new Error("disk gone"); } } } });
  await assert.rejects(failing.precheck(entity), /disk gone/);
});

test("apply refuses to write when the stored bytes change between the check and the write", async (t) => {
  const f = await fixture(t);
  const target = path.join(f.siteDir, "snippets/footer.html");
  await writeFile(target, "footer");
  const [entity] = await f.pack();
  assert.ok(entity);
  let gets = 0;
  const blobs = { ...f.blobs,
    exists: async () => true,
    get: async () => Buffer.from(++gets === 1 ? "footer" : "swapped"),
  } as unknown as NonNullable<PublishContentDeps["backstop"]>["blobs"];
  const handler = contributeRawFilePublish().build({ ...f.deps, backstop: { ...f.deps.backstop!, blobs } });
  const inspected = await handler.inspect(entity.id);
  await assert.rejects(handler.apply({ entity, expectedVersion: inspected!.version, principalId: "admin", idempotencyKey: "swap" }), /bytes changed before apply/);
  assert.equal(gets, 2);
  assert.equal(await readFile(target, "utf8"), "footer");
});

test("undo refuses a private path before touching it", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.siteDir, "snippets/footer.html"), "footer");
  const [entity] = await f.pack();
  assert.ok(entity);
  const before = await f.files.capture({ relPath: entity.id });
  const privateEntity = { ...entity, id: ".env" };
  assert.match((await undoRawFile({ deps: f.deps, entity: privateEntity, before: { ...before, relPath: ".env" }, afterHash: entity.contentHash }))!, /never|environment/);
});

test("a change-set write failing after the file was replaced rolls the live file back to its prior bytes", async (t) => {
  const f = await fixture(t);
  const target = path.join(f.siteDir, "snippets/footer.html");
  await writeFile(target, "new");
  const [entity] = await f.pack();
  assert.ok(entity);
  await f.blobs.putIfAbsent({ workspaceId: "ws", sha256: entity.state.sha256 as string, bytes: Buffer.from("new") });
  await writeFile(target, "old");
  const changeSets = f.deps.changeSets!;
  changeSets.insert = async () => { throw new Error("audit store down"); };
  const prior = await f.handler.inspect(entity.id);
  await assert.rejects(f.handler.apply({ entity, expectedVersion: prior!.version, principalId: "admin", idempotencyKey: "rollback" }), /audit store down/);
  assert.equal(await readFile(target, "utf8"), "old");
});
