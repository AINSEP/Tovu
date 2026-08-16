import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createFilePublishHistoryStore, InMemoryPublishHistoryStore, type PublishHistoryEntry } from "../publish-history";

/**
 * @file `publish-history.ts` in isolation — the fix for Defect 2 (2026-08-16 live-publish finding):
 * a static publish went live and the assistant had nowhere to look up where. Covers both
 * implementations against the SAME `PublishHistoryStore` contract, plus the file-backed store's own
 * atomicity/corruption/multi-target-merge behavior that only it can exhibit.
 */

const WORKSPACE_A = "ws-a";
const WORKSPACE_B = "ws-b";

function entry(overrides: Partial<PublishHistoryEntry> = {}): PublishHistoryEntry {
  return {
    target: "github-pages",
    url: "https://leonaburime-ucla.github.io/tovu-demo/",
    reachable: true,
    status: "ready",
    projectName: "tovu-demo",
    publishedAt: "2026-08-16T00:00:00.000Z",
    owner: "leonaburime-ucla",
    repo: "tovu-demo",
    basePath: "/tovu-demo",
    ...overrides,
  };
}

test("InMemoryPublishHistoryStore: getLast is null until a record exists, then returns exactly what was recorded", async () => {
  const store = new InMemoryPublishHistoryStore();
  assert.equal(await store.getLast({ workspaceId: WORKSPACE_A, target: "github-pages" }), null);

  const recorded = entry();
  await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: recorded });
  assert.deepEqual(await store.getLast({ workspaceId: WORKSPACE_A, target: "github-pages" }), recorded);
});

test("InMemoryPublishHistoryStore: isolates by BOTH workspace and target", async () => {
  const store = new InMemoryPublishHistoryStore();
  await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ target: "github-pages", url: "https://a.github.io/x/" }) });
  await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ target: "vercel", url: "https://a-vercel.example.test", owner: undefined, repo: undefined, basePath: undefined }) });
  await store.recordSuccess({ workspaceId: WORKSPACE_B, entry: entry({ target: "github-pages", url: "https://b.github.io/x/" }) });

  assert.equal((await store.getLast({ workspaceId: WORKSPACE_A, target: "github-pages" }))?.url, "https://a.github.io/x/");
  assert.equal((await store.getLast({ workspaceId: WORKSPACE_A, target: "vercel" }))?.url, "https://a-vercel.example.test");
  assert.equal((await store.getLast({ workspaceId: WORKSPACE_B, target: "github-pages" }))?.url, "https://b.github.io/x/");
  assert.equal(await store.getLast({ workspaceId: WORKSPACE_B, target: "vercel" }), null);
});

test("InMemoryPublishHistoryStore: a second recordSuccess for the SAME (workspace, target) replaces the prior one — last publish, not a log", async () => {
  const store = new InMemoryPublishHistoryStore();
  await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ url: "https://old.example.test", publishedAt: "2026-08-15T00:00:00.000Z" }) });
  await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ url: "https://new.example.test", publishedAt: "2026-08-16T00:00:00.000Z" }) });

  const last = await store.getLast({ workspaceId: WORKSPACE_A, target: "github-pages" });
  assert.equal(last?.url, "https://new.example.test");
});

// ---------------------------------------------------------------------------
// createFilePublishHistoryStore — the production default
// ---------------------------------------------------------------------------

function withTempDir<T>(fn: (dir: string) => T | Promise<T>): Promise<T> | T {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-publish-history-test-"));
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  const result = fn(dir);
  if (result instanceof Promise) return result.finally(cleanup);
  cleanup();
  return result;
}

test("createFilePublishHistoryStore: getLast on a directory/file that does not exist yet is null, never throws", async () => {
  await withTempDir(async (dir) => {
    const store = createFilePublishHistoryStore({ dir: path.join(dir, "does-not-exist-yet") });
    assert.equal(await store.getLast({ workspaceId: WORKSPACE_A, target: "github-pages" }), null);
  });
});

test("createFilePublishHistoryStore: recordSuccess persists to a real file, getLast reads it back — survives a fresh store instance (simulates a process restart)", async () => {
  await withTempDir(async (dir) => {
    const writer = createFilePublishHistoryStore({ dir });
    await writer.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry() });

    // A brand-new store instance, same dir — proves this is real durable storage, not an in-process
    // cache the module happens to also implement as a file.
    const reader = createFilePublishHistoryStore({ dir });
    const last = await reader.getLast({ workspaceId: WORKSPACE_A, target: "github-pages" });
    assert.deepEqual(last, entry());
  });
});

test("createFilePublishHistoryStore: recording a SECOND target for the same workspace does not clobber the first — one file, multiple keys", async () => {
  await withTempDir(async (dir) => {
    const store = createFilePublishHistoryStore({ dir });
    await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ target: "github-pages" }) });
    await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ target: "vercel", url: "https://demo.vercel.app", owner: undefined, repo: undefined, basePath: undefined }) });

    assert.equal((await store.getLast({ workspaceId: WORKSPACE_A, target: "github-pages" }))?.target, "github-pages");
    assert.equal((await store.getLast({ workspaceId: WORKSPACE_A, target: "vercel" }))?.url, "https://demo.vercel.app");
  });
});

test("createFilePublishHistoryStore: isolates by workspace on disk (one file per workspace, never a shared one)", async () => {
  await withTempDir(async (dir) => {
    const store = createFilePublishHistoryStore({ dir });
    await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ url: "https://a.example.test" }) });
    await store.recordSuccess({ workspaceId: WORKSPACE_B, entry: entry({ url: "https://b.example.test" }) });

    assert.equal((await store.getLast({ workspaceId: WORKSPACE_A, target: "github-pages" }))?.url, "https://a.example.test");
    assert.equal((await store.getLast({ workspaceId: WORKSPACE_B, target: "github-pages" }))?.url, "https://b.example.test");
  });
});

test("createFilePublishHistoryStore: a corrupt history file degrades to no history rather than throwing", async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${encodeURIComponent(WORKSPACE_A)}.json`), "{ not valid json");

    const store = createFilePublishHistoryStore({ dir });
    assert.equal(await store.getLast({ workspaceId: WORKSPACE_A, target: "github-pages" }), null);

    // And a write after a corrupt read must still succeed (self-heals the file rather than being
    // permanently wedged by one bad write).
    await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry() });
    assert.deepEqual(await store.getLast({ workspaceId: WORKSPACE_A, target: "github-pages" }), entry());
  });
});

test("createFilePublishHistoryStore: a workspaceId containing a path separator never escapes the target directory", async () => {
  await withTempDir(async (dir) => {
    const store = createFilePublishHistoryStore({ dir });
    const hostileWorkspaceId = "../../etc/passwd";
    await store.recordSuccess({ workspaceId: hostileWorkspaceId, entry: entry() });

    // The write must have landed INSIDE `dir` (as an encoded filename), never escaped it.
    const filesInDir = fs.readdirSync(dir);
    assert.ok(filesInDir.some((name) => name.endsWith(".json")), "expected an encoded history file inside the target directory");
    assert.ok(!fs.existsSync(path.resolve(dir, "..", "..", "etc", "passwd.json")), "must never write outside the target directory");

    assert.deepEqual(await store.getLast({ workspaceId: hostileWorkspaceId, target: "github-pages" }), entry());
  });
});
