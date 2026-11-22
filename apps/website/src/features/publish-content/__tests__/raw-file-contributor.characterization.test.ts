/**
 * @file Characterization of `contributeRawFilePublish` decisions that the L044 suite
 * (`raw-file-contributor.test.ts`) left unpinned, written before the contributor was split by
 * responsibility (publish-engine P0.6). Each case names the check it guards; the mutation table
 * (`cloud-results/publish-p0-mutation-table.md`, rows RF*) shows each one fails when its check is removed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createRawFileSitePort } from "#src/features/publish-content/publish-backstop-file";
import { InMemoryVersionedMediaRepo } from "@jini-ai/cms/media";
import { InMemoryAssetBlobRepo, InMemoryBlobStore, InMemoryMediaContentTypeStore } from "#src/features/media/index";

import { PublishContentApplyRowError } from "@jini-ai/cms/publish/transfer";
import type { RawFilePort, RawFileSnapshot } from "@jini-ai/cms/publish/transfer";
import { contentHash } from "@jini-ai/cms/publish/content/content-hash";
import { createFileBlobIndex } from "@jini-ai/cms/publish/transfer";
import { contributeRawFilePublish, undoRawFile } from "../raw-file-contributor.js";
import type { PackedEntity, PublishContentDeps } from "../type-registry.js";

const REL = "snippets/footer.html";

class SpyChangeSets extends InMemoryChangeSetRepo {
  readonly inserted: Array<Parameters<InMemoryChangeSetRepo["insert"]>[0]> = [];
  override async insert(input: Parameters<InMemoryChangeSetRepo["insert"]>[0]) { this.inserted.push(input); return super.insert(input); }
}

async function fixture(t: test.TestContext, { selection = [REL], files: wrap }: { selection?: string[]; files?: (real: RawFilePort) => RawFilePort } = {}) {
  const siteDir = await mkdtemp(path.join(tmpdir(), "raw-file-char-"));
  t.after(() => rm(siteDir, { recursive: true, force: true }));
  await mkdir(path.join(siteDir, "snippets"));
  const real = createRawFileSitePort({ siteDir });
  const files = wrap ? wrap(real) : real;
  const blobs = new InMemoryBlobStore();
  const outbox = new InMemoryOutbox();
  const changeSets = new SpyChangeSets([], [], outbox);
  const index = createFileBlobIndex();
  let id = 0;
  const deps: PublishContentDeps = {
    workspaceId: "ws", clock: { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") }, idGen: { newId: () => `id-${++id}` },
    changeSets, outbox, authorize: async () => ({ allowed: true, reason: "test" }),
    ports: { media: { repo: new InMemoryVersionedMediaRepo({}), assetBlobRepo: new InMemoryAssetBlobRepo({}), blobStore: blobs, contentTypeStore: new InMemoryMediaContentTypeStore() } },
    backstop: { files, blobs, fileBlobIndex: index, fileRollbacks: [], inverses: [], coveredTables: [], coveredRoots: ["themes"], selection: { files: selection } },
  };
  const handler = contributeRawFilePublish().build(deps);
  const pack = async (h = handler) => { const out: PackedEntity[] = []; for await (const e of h.pack()) out.push(e); return out; };
  const write = (rel: string, body: string) => writeFile(path.join(siteDir, rel), body);
  const putBlob = (entity: PackedEntity, body: string) => blobs.putIfAbsent({ workspaceId: "ws", sha256: entity.state.sha256 as string, bytes: Buffer.from(body) });
  return { siteDir, real, files, deps, handler, pack, write, putBlob, changeSets, index };
}

const input = (entity: PackedEntity, expectedVersion?: number) => ({ entity, principalId: "admin", idempotencyKey: "key-1", expectedVersion });

test("the handler declares the raw-file type, its permission and the per-run command key", async (t) => {
  const { handler } = await fixture(t);
  assert.deepEqual([handler.entityType, handler.schemaVersion, handler.permission, handler.dependsOn, handler.idempotencyScope],
    ["raw-file", 1, "publish.backstop", [], "run"]);
  const contributor = contributeRawFilePublish();
  assert.deepEqual([contributor.entityType, contributor.dependsOn], ["raw-file", []]);
});

test("a stated size that differs from the verified bytes is refused even when every hash is consistent", async (t) => {
  const f = await fixture(t);
  await f.write(REL, "footer");
  const [entity] = await f.pack();
  await f.putBlob(entity!, "footer");
  const state = { ...entity!.state, size: 7 };
  const forged = { ...entity!, state, contentHash: contentHash({ entityType: "raw-file", state }) };
  assert.equal(await f.handler.precheck({ entity: forged }), "The file's verified bytes are missing on live; send it again.");
});

test("pack: the blob index records where the bytes live and how big they are; the state carries a normalized mode", async (t) => {
  const reported = { mode: 0o664 };
  const f = await fixture(t, { files: (real) => ({ ...real, check: (a) => real.check(a), capture: (a) => real.capture(a), replace: (a) => real.replace(a), restore: (a) => real.restore(a),
    read: async (a) => { const snapshot = await real.read(a); return snapshot && { ...snapshot, mode: reported.mode }; } }) });
  await f.write(REL, "footer");
  const [entity] = await f.pack();
  assert.equal(entity!.state.mode, 0o644, "group-writable is normalized to the plain file mode");
  assert.deepEqual(f.index.get({ sha256: entity!.state.sha256 as string }), { absPath: path.join(f.siteDir, REL), size: 6 });
  reported.mode = 0o750;
  assert.equal((await f.pack())[0]!.state.mode, 0o755, "any executable bit is normalized to the executable mode");
  assert.equal((await f.handler.inspect({ id: REL }))!.hash, (await f.pack())[0]!.contentHash, "inspect hashes the same normalized state");
});

test("pack: without a blob index nothing is packed or skipped, and 50 selected files are allowed where 51 are refused", async (t) => {
  const f = await fixture(t);
  await f.write(REL, "footer");
  const noIndex = contributeRawFilePublish().build({ ...f.deps, backstop: { ...f.deps.backstop!, fileBlobIndex: undefined } });
  assert.deepEqual(await f.pack(noIndex), []);
  assert.deepEqual(await noIndex.listSkipped!(), []);

  const fifty = Array.from({ length: 50 }, (_, i) => `snippets/f${i}.html`);
  const ok = await fixture(t, { selection: fifty });
  assert.deepEqual(await ok.pack(), []);
  assert.equal((await ok.handler.listSkipped!()).length, 50);
  const tooMany = await fixture(t, { selection: [...fifty, "snippets/f50.html"] });
  await assert.rejects(tooMany.pack(), (err: Error) => err.message === "Choose at most 50 files per send.");
});

test("listSkipped returns a copy", async (t) => {
  const f = await fixture(t);
  await f.pack();
  ((await f.handler.listSkipped!()) as unknown[]).length = 0;
  assert.equal((await f.handler.listSkipped!()).length, 1);
});

test("apply: each missing gateway part is refused with the exact words", async (t) => {
  const f = await fixture(t);
  await f.write(REL, "footer");
  const [entity] = await f.pack();
  await f.putBlob(entity!, "footer");
  for (const missing of ["changeSets", "outbox", "authorize"] as const) {
    const handler = contributeRawFilePublish().build({ ...f.deps, [missing]: undefined });
    await assert.rejects(handler.apply(input(entity!)), (err: Error) => err.message === "The raw file command gateway is not wired.", missing);
  }
});

/** A site port whose capture or read can be pointed at another file state for one apply. */
function steerable(real: RawFilePort, steer: { capture?: Awaited<ReturnType<RawFilePort["capture"]>>; read?: RawFileSnapshot | null }): RawFilePort {
  return {
    ...real,
    capture: async (args) => steer.capture ?? real.capture(args),
    read: async (args) => ("read" in steer ? steer.read ?? null : real.read(args)),
    check: (args) => real.check(args),
    replace: (args) => real.replace(args),
    restore: (args) => real.restore(args),
  };
}

test("apply: OCC needs BOTH the captured prior version and the current version to equal the expected one", async (t) => {
  const conflict = (err: unknown) => err instanceof PublishContentApplyRowError && err.message === "This file changed on live after it was checked.";
  for (const steered of ["capture", "read"] as const) {
    const steer: Parameters<typeof steerable>[1] = {};
    const f = await fixture(t, { files: (real) => steerable(real, steer) });
    await f.write(REL, "footer");
    const [entity] = await f.pack();
    await f.putBlob(entity!, "footer");
    const expectedVersion = (await f.handler.inspect({ id: entity!.id }))!.version;
    if (steered === "capture") steer.capture = { relPath: REL, backupName: null, sha256: "a".repeat(64), size: 5, mode: 0o644 };
    else steer.read = { bytes: Buffer.from("changed"), mode: 0o644, absPath: path.join(f.siteDir, REL) };
    await assert.rejects(f.handler.apply(input(entity!, expectedVersion)), conflict, steered);
  }
});

test("apply: a failure before the write does not restore a file that was never written", async (t) => {
  const restored: string[] = [];
  const f = await fixture(t, { files: (real) => ({ ...real, check: (a) => real.check(a), read: (a) => real.read(a), capture: (a) => real.capture(a),
    replace: async () => { throw new Error("disk full"); }, restore: async (a) => { restored.push(a.inverse.relPath); } }) });
  await f.write(REL, "footer");
  const [entity] = await f.pack();
  await f.putBlob(entity!, "footer");
  const version = (await f.handler.inspect({ id: entity!.id }))!.version;
  await assert.rejects(f.handler.apply(input(entity!, version)), /disk full/);
  assert.deepEqual(restored, []);
});

test("apply: the file is written with the entity's mode, and the change set records the summary and the reported version", async (t) => {
  const f = await fixture(t);
  const file = path.join(f.siteDir, REL);
  await f.write(REL, "footer");
  await chmod(file, 0o755);
  const [entity] = await f.pack();
  await f.putBlob(entity!, "footer");
  await f.write(REL, "old");
  await chmod(file, 0o644);
  const version = (await f.handler.inspect({ id: entity!.id }))!.version;
  await f.handler.apply(input(entity!, version));
  assert.equal((await stat(file)).mode & 0o777, 0o755);
  const [{ record, items }] = f.changeSets.inserted;
  assert.equal(record.summary, `Send '${REL}' by hand`);
  assert.equal(items[0]!.entityVersionAtApply, Number.parseInt(entity!.contentHash.slice(0, 12), 16));
});

test("undo and pack treat covered roots case-insensitively, in the root and in the path", async (t) => {
  const f = await fixture(t, { selection: [REL, "Snippets/footer.html"] });
  await mkdir(path.join(f.siteDir, "Snippets"));
  await f.write("Snippets/footer.html", "footer");
  await f.write(REL, "footer");
  const entities = await f.pack();
  const upperPath = entities.find((e) => e.id === "Snippets/footer.html")!;
  const before = await f.real.capture({ relPath: upperPath.id });
  const lowerRoot = { ...f.deps, backstop: { ...f.deps.backstop!, coveredRoots: ["snippets/"] } };
  assert.match((await undoRawFile({ deps: lowerRoot, entity: upperPath, before, afterHash: upperPath.contentHash }))!, /already publishes normally/);
  const upperRoot = { ...f.deps, backstop: { ...f.deps.backstop!, coveredRoots: ["SNIPPETS/"] } };
  const lowerPath = entities.find((e) => e.id === REL)!;
  assert.match((await undoRawFile({ deps: upperRoot, entity: lowerPath, before: await f.real.capture({ relPath: REL }), afterHash: lowerPath.contentHash }))!, /already publishes normally/);
  const handler = contributeRawFilePublish().build(upperRoot);
  assert.deepEqual((await f.pack(handler)).map((e) => e.id), []);
  assert.equal((await handler.listSkipped!()).length, 2);
});
