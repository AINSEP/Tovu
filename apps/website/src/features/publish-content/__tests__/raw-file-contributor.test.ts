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
import { InMemoryBlobStore } from "#src/features/media/index";
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
    authorize: async () => ({ allowed: true, reason: "test" }), ports: {},
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
