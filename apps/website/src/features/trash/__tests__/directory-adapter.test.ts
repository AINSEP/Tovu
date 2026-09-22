import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDirectoryTrashAdapter, unhideIfRemoveThrows } from "../adapters/directory.js";
import type { TrashAdapter } from "../ports.js";
import { InMemoryTrashRepo } from "../repo.memory.js";
import { createTrashService } from "../write-service.js";

const WS = "workspace-1";
const ENTITY = "plugin";
const ID = "plugin-a";
const AT = "2026-09-22T12:00:00.000Z";

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function harness(t: test.TestContext, forget?: (required: { workspaceId: string; entityId: string }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "tovu-directory-trash-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const liveParent = join(root, "plugins");
  const liveDir = join(liveParent, ID);
  const parkedDir = join(root, "plugins-trash", ID);
  await mkdir(liveParent, { recursive: true });

  const adapter = createDirectoryTrashAdapter({
    entityType: ENTITY,
    locate: async () => ({
      liveParent,
      liveNames: (await pathExists(liveDir)) ? [ID] : [],
      parkedDir,
    }),
    forget,
  });
  return { adapter, liveDir, liveParent, parkedDir };
}

async function makeLive(liveDir: string): Promise<void> {
  await mkdir(liveDir, { recursive: true });
  await writeFile(join(liveDir, "plugin.json"), "plugin-a");
}

function markerArgs() {
  return { workspaceId: WS, entityId: ID, at: AT, expectedVersion: null };
}

test("hide moves a live directory into its parked directory", async (t) => {
  const { adapter, liveDir, parkedDir } = await harness(t);
  await makeLive(liveDir);

  assert.deepEqual(await adapter.hide(markerArgs()), { ok: true, version: null });
  assert.equal(await pathExists(liveDir), false);
  assert.equal(await readFile(join(parkedDir, ID, "plugin.json"), "utf8"), "plugin-a");
});

test("a second hide reports that the directory is already in Trash", async (t) => {
  const { adapter, liveDir } = await harness(t);
  await makeLive(liveDir);
  await adapter.hide(markerArgs());

  assert.deepEqual(await adapter.hide(markerArgs()), {
    ok: false,
    reason: "blocked",
    code: "ALREADY_IN_TRASH",
    count: 1,
  });
});

test("hide reports not-found when there is no live directory", async (t) => {
  const { adapter } = await harness(t);
  assert.deepEqual(await adapter.hide(markerArgs()), { ok: false, reason: "not-found" });
});

test("unhide moves the directory back and removes its park", async (t) => {
  const { adapter, liveDir, parkedDir } = await harness(t);
  await makeLive(liveDir);
  await adapter.hide(markerArgs());

  assert.deepEqual(await adapter.unhide(markerArgs()), { ok: true, version: null });
  assert.equal(await readFile(join(liveDir, "plugin.json"), "utf8"), "plugin-a");
  assert.equal(await pathExists(parkedDir), false);
});

test("unhide refuses when a live directory with the same name exists", async (t) => {
  const { adapter, liveDir, parkedDir } = await harness(t);
  await makeLive(liveDir);
  await adapter.hide(markerArgs());
  await makeLive(liveDir);

  assert.deepEqual(await adapter.unhide(markerArgs()), { ok: false, reason: "version-changed" });
  assert.equal(await pathExists(parkedDir), true);
});

test("unhide reports not-found when nothing is parked", async (t) => {
  const { adapter } = await harness(t);
  assert.deepEqual(await adapter.unhide(markerArgs()), { ok: false, reason: "not-found" });
});

test("purge calls forget once and removes the parked tree", async (t) => {
  const forgotten: string[] = [];
  const { adapter, liveDir, parkedDir } = await harness(t, async ({ entityId }) => void forgotten.push(entityId));
  await makeLive(liveDir);
  await adapter.hide(markerArgs());

  assert.equal(await adapter.purge(markerArgs()), "purged");
  assert.deepEqual(forgotten, [ID]);
  assert.equal(await pathExists(parkedDir), false);
});

test("purge reports already-gone without calling forget when nothing is parked", async (t) => {
  let forgetCalls = 0;
  const { adapter } = await harness(t, async () => void (forgetCalls += 1));

  assert.equal(await adapter.purge(markerArgs()), "already-gone");
  assert.equal(forgetCalls, 0);
});

test("purge restores the parked directory when forget throws", async (t) => {
  const { adapter, liveDir, parkedDir } = await harness(t, async () => {
    throw new Error("forget failed");
  });
  await makeLive(liveDir);
  await adapter.hide(markerArgs());

  await assert.rejects(() => adapter.purge(markerArgs()), /forget failed/);
  assert.equal(await readFile(join(parkedDir, ID, "plugin.json"), "utf8"), "plugin-a");
});

test("hide and unhide preserve a frozen directory's root mode", async (t) => {
  const { adapter, liveDir, parkedDir } = await harness(t);
  await makeLive(liveDir);
  await chmod(join(liveDir, "plugin.json"), 0o444);
  await chmod(liveDir, 0o555);

  await adapter.hide(markerArgs());
  assert.equal((await stat(join(parkedDir, ID))).mode & 0o777, 0o555);
  await adapter.unhide(markerArgs());
  assert.equal((await stat(liveDir)).mode & 0o777, 0o555);
  await chmod(liveDir, 0o755);
});

test("directory adapter works through trash, list, restore, re-trash, and purge", async (t) => {
  const forgotten: string[] = [];
  const { adapter, liveDir, parkedDir } = await harness(t, async ({ entityId }) => void forgotten.push(entityId));
  await makeLive(liveDir);
  const repo = new InMemoryTrashRepo();
  const adapters = new Map<string, TrashAdapter>([[ENTITY, adapter]]);
  let sequence = 0;
  const trash = createTrashService({
    repo,
    adapters,
    idGen: { next: () => `trash-${(sequence += 1)}` },
    transaction: <T>(fn: () => Promise<T>) => fn(),
  });
  const required = {
    workspaceId: WS,
    entityType: ENTITY,
    entityId: ID,
    actor: { principalId: "principal-1" },
    display: { title: "Plugin A" },
    at: AT,
    expectedVersion: null,
  };

  assert.deepEqual(await trash.trash(required), { ok: true, version: null });
  const firstPage = await trash.list({ workspaceId: WS, now: AT, limit: 10 });
  assert.equal(firstPage.items.length, 1);
  assert.equal(firstPage.items[0]?.displayTitle, "Plugin A");

  assert.equal(await trash.restore({ workspaceId: WS, entityType: ENTITY, entityId: ID, at: AT }), "restored");
  assert.equal(await pathExists(liveDir), true);
  assert.deepEqual(await trash.trash(required), { ok: true, version: null });
  const secondPage = await trash.list({ workspaceId: WS, now: AT, limit: 10 });
  const trashId = secondPage.items[0]?.id;
  assert.ok(trashId);

  assert.deepEqual(
    await trash.purgeSelected({
      workspaceId: WS,
      ids: [trashId],
      actor: { principalId: "principal-1" },
      authorizeItem: async () => true,
    }),
    { purged: 1, results: [{ id: trashId, outcome: "purged" }] },
  );
  assert.equal(await pathExists(parkedDir), false);
  assert.deepEqual(forgotten, [ID]);
});

test("unhideIfRemoveThrows moves the folder back when the Trash row write throws after hide", async (t) => {
  const { adapter, liveDir, parkedDir } = await harness(t);
  await makeLive(liveDir);
  const remove = unhideIfRemoveThrows(adapter, async (required: { workspaceId: string; id: string; at: string }) => {
    assert.deepEqual(await adapter.hide({ workspaceId: required.workspaceId, entityId: required.id, at: required.at, expectedVersion: null }), { ok: true, version: null });
    throw new Error("trash row insert failed");
  });

  await assert.rejects(remove({ workspaceId: WS, id: ID, at: AT }), /trash row insert failed/);
  assert.equal(await readFile(join(liveDir, "plugin.json"), "utf8"), "plugin-a");
  assert.equal(await pathExists(parkedDir), false);
});

test("hide refuses a parking root that resolves inside the live parent through a symlink", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "tovu-directory-trash-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const liveParent = join(root, "plugins");
  const liveDir = join(liveParent, ID);
  await makeLive(liveDir);
  await mkdir(join(liveParent, "inner"));
  await symlink(join(liveParent, "inner"), join(root, "plugins-trash"));
  const adapter = createDirectoryTrashAdapter({
    entityType: ENTITY,
    locate: () => ({ liveParent, liveNames: [ID], parkedDir: join(root, "plugins-trash", ID) }),
  });

  await assert.rejects(adapter.hide(markerArgs()), /resolves inside live parent/);
  assert.equal(await pathExists(liveDir), true);
});
