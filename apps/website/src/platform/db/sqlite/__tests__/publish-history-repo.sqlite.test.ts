import assert from "node:assert/strict";
import test from "node:test";

import type { PublishHistoryEntry } from "../../../../features/deployments/static-publish/publish-history.js";
import { openContentDb } from "../content-db.js";
import { SqlitePublishHistoryStore } from "../publish-history-repo.sqlite.js";
import { workspaces } from "../../schema.js";

/**
 * @file `SqlitePublishHistoryStore` against a real, migrated `content.db` (`:memory:`) — the thing
 * worth proving here is that migration `0043`'s `publish_history` table (append-only, real FK to
 * `workspaces`, `NOT NULL` core columns, nullable per-target extras) round-trips through this
 * adapter's `getLast`/`list`/`recordSuccess`, and that the append-only shape actually holds against a
 * real SQLite table (not just the in-memory double — `publish-history.unit.test.ts` covers that side).
 * Mirrors `publish-credential-repo.sqlite.test.ts`'s fixture shape for the sibling table.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";

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
    branch: "gh-pages",
    commitSha: "abc123",
    deploymentId: "abc123",
    triggeredBy: "admin_ui",
    ...overrides,
  };
}

function seedWorkspaces(db: ReturnType<typeof openContentDb>, ids: string[]): void {
  for (const id of ids) {
    db.insert(workspaces).values({ id, name: id, slug: id, createdAt: "2026-08-16T00:00:00.000Z" }).onConflictDoNothing().run();
  }
}

function openSeededDb() {
  const db = openContentDb(":memory:");
  seedWorkspaces(db, [WORKSPACE, OTHER_WORKSPACE]);
  return db;
}

test("getLast returns null when no row exists", async () => {
  const store = new SqlitePublishHistoryStore(openSeededDb());
  assert.equal(await store.getLast({ workspaceId: WORKSPACE, target: "github-pages" }), null);
});

test("recordSuccess then getLast round-trips every field exactly, including the per-target-optional ones", async () => {
  const store = new SqlitePublishHistoryStore(openSeededDb());
  const recorded = entry();
  await store.recordSuccess({ workspaceId: WORKSPACE, entry: recorded });
  const found = await store.getLast({ workspaceId: WORKSPACE, target: "github-pages" });
  assert.deepEqual(found, recorded);
});

test("a target with none of the github-pages-only fields round-trips with them genuinely ABSENT keys, not present-but-undefined ones", async () => {
  const store = new SqlitePublishHistoryStore(openSeededDb());
  await store.recordSuccess({
    workspaceId: WORKSPACE,
    entry: entry({
      target: "vercel",
      url: "https://demo.vercel.app",
      owner: undefined,
      repo: undefined,
      basePath: undefined,
      branch: undefined,
      commitSha: undefined,
      deploymentId: "dpl_abc",
      triggeredBy: "agent_tool",
    }),
  });
  const found = await store.getLast({ workspaceId: WORKSPACE, target: "vercel" });
  // Compared against a literal with the per-target-optional keys genuinely OMITTED (not set to
  // `undefined`) — `toRecord`'s own conditional-spread mapping must produce absent keys, the same
  // shape a JSON.stringify of this object would actually carry, not `{owner: undefined, ...}`.
  assert.deepEqual(found, {
    target: "vercel",
    url: "https://demo.vercel.app",
    reachable: true,
    status: "ready",
    projectName: "tovu-demo",
    publishedAt: "2026-08-16T00:00:00.000Z",
    deploymentId: "dpl_abc",
    triggeredBy: "agent_tool",
  });
  assert.equal(found?.commitSha, undefined, "vercel must never carry a commitSha — it is not a git publish");
});

test("APPEND-ONLY: a second recordSuccess for the same (workspace, target) does not overwrite the first — both rows persist, getLast returns the newer one", async () => {
  const store = new SqlitePublishHistoryStore(openSeededDb());
  await store.recordSuccess({ workspaceId: WORKSPACE, entry: entry({ url: "https://old.example.test", publishedAt: "2026-08-15T00:00:00.000Z" }) });
  await store.recordSuccess({ workspaceId: WORKSPACE, entry: entry({ url: "https://new.example.test", publishedAt: "2026-08-16T00:00:00.000Z" }) });

  const last = await store.getLast({ workspaceId: WORKSPACE, target: "github-pages" });
  assert.equal(last?.url, "https://new.example.test");

  const rows = await store.list({ workspaceId: WORKSPACE });
  assert.equal(rows.length, 2, "the real table must retain both rows — this is the whole point of the DB rework");
  assert.deepEqual(rows.map((r) => r.url), ["https://new.example.test", "https://old.example.test"]);
});

test("list: newest first, workspace-isolated, optionally target-scoped, and limit-bounded", async () => {
  const store = new SqlitePublishHistoryStore(openSeededDb());
  await store.recordSuccess({ workspaceId: WORKSPACE, entry: entry({ target: "github-pages", url: "u1", publishedAt: "2026-08-14T00:00:00.000Z" }) });
  await store.recordSuccess({
    workspaceId: WORKSPACE,
    entry: entry({ target: "vercel", url: "u2", publishedAt: "2026-08-15T00:00:00.000Z", owner: undefined, repo: undefined, basePath: undefined, branch: undefined, commitSha: undefined }),
  });
  await store.recordSuccess({ workspaceId: WORKSPACE, entry: entry({ target: "github-pages", url: "u3", publishedAt: "2026-08-16T00:00:00.000Z" }) });
  await store.recordSuccess({ workspaceId: OTHER_WORKSPACE, entry: entry({ target: "github-pages", url: "other-workspace-row" }) });

  const all = await store.list({ workspaceId: WORKSPACE });
  assert.deepEqual(all.map((r) => r.url), ["u3", "u2", "u1"]);

  const githubOnly = await store.list({ workspaceId: WORKSPACE, target: "github-pages" });
  assert.deepEqual(githubOnly.map((r) => r.url), ["u3", "u1"]);

  const limited = await store.list({ workspaceId: WORKSPACE, limit: 1 });
  assert.deepEqual(limited.map((r) => r.url), ["u3"]);

  const otherWorkspace = await store.list({ workspaceId: OTHER_WORKSPACE });
  assert.deepEqual(otherWorkspace.map((r) => r.url), ["other-workspace-row"]);
});
