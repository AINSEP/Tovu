import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPublishHistoryStore, type PublishHistoryEntry } from "../publish-history";
import {
  MAX_PUBLISH_HISTORY_LIST_LIMIT,
  resolvePublishHistoryListLimit,
} from "../../../../core/publish-history-list-limit";

/**
 * @file `publish-history.ts`'s port and in-memory double, in isolation — the fix for Defect 2
 * (2026-08-16 live-publish finding): a static publish went live and the assistant had nowhere to look
 * up where. Reworked the same day from a flat-JSON-file, last-publish-only design into this
 * append-only one (owner-requested — see `publish-history.ts`'s own header for the full story); this
 * file now covers the append-only contract itself rather than a file store's on-disk atomicity, since
 * that concrete implementation moved to `db/sqlite/publish-history-repo.sqlite.ts` (covered by its own
 * sibling test in `db/sqlite/__tests__/`).
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
    branch: "gh-pages",
    commitSha: "abc123",
    deploymentId: "abc123",
    triggeredBy: "admin_ui",
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
  await store.recordSuccess({
    workspaceId: WORKSPACE_A,
    entry: entry({ target: "vercel", url: "https://a-vercel.example.test", owner: undefined, repo: undefined, basePath: undefined, branch: undefined, commitSha: undefined, deploymentId: undefined }),
  });
  await store.recordSuccess({ workspaceId: WORKSPACE_B, entry: entry({ target: "github-pages", url: "https://b.github.io/x/" }) });

  assert.equal((await store.getLast({ workspaceId: WORKSPACE_A, target: "github-pages" }))?.url, "https://a.github.io/x/");
  assert.equal((await store.getLast({ workspaceId: WORKSPACE_A, target: "vercel" }))?.url, "https://a-vercel.example.test");
  assert.equal((await store.getLast({ workspaceId: WORKSPACE_B, target: "github-pages" }))?.url, "https://b.github.io/x/");
  assert.equal(await store.getLast({ workspaceId: WORKSPACE_B, target: "vercel" }), null);
});

test("InMemoryPublishHistoryStore: a second recordSuccess for the SAME (workspace, target) is APPENDED, not replaced — getLast still returns the newest", async () => {
  const store = new InMemoryPublishHistoryStore();
  await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ url: "https://old.example.test", publishedAt: "2026-08-15T00:00:00.000Z" }) });
  await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ url: "https://new.example.test", publishedAt: "2026-08-16T00:00:00.000Z" }) });

  const last = await store.getLast({ workspaceId: WORKSPACE_A, target: "github-pages" });
  assert.equal(last?.url, "https://new.example.test");

  // The regression this rework exists to fix: the OLD entry must still be readable through `list`,
  // not silently overwritten the way the original single-slot design discarded it.
  const rows = await store.list({ workspaceId: WORKSPACE_A });
  assert.equal(rows.length, 2, "both publishes must survive — this is a log, not a cache slot");
  assert.deepEqual(
    rows.map((r) => r.url),
    ["https://new.example.test", "https://old.example.test"],
    "list must return newest-first"
  );
});

test("InMemoryPublishHistoryStore.list: newest first, across mixed targets, optionally narrowed to one target", async () => {
  const store = new InMemoryPublishHistoryStore();
  await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ target: "github-pages", url: "u1", publishedAt: "2026-08-14T00:00:00.000Z" }) });
  await store.recordSuccess({
    workspaceId: WORKSPACE_A,
    entry: entry({ target: "vercel", url: "u2", publishedAt: "2026-08-15T00:00:00.000Z", owner: undefined, repo: undefined, basePath: undefined, branch: undefined, commitSha: undefined, deploymentId: undefined }),
  });
  await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ target: "github-pages", url: "u3", publishedAt: "2026-08-16T00:00:00.000Z" }) });

  const all = await store.list({ workspaceId: WORKSPACE_A });
  assert.deepEqual(all.map((r) => r.url), ["u3", "u2", "u1"]);

  const githubOnly = await store.list({ workspaceId: WORKSPACE_A, target: "github-pages" });
  assert.deepEqual(githubOnly.map((r) => r.url), ["u3", "u1"]);

  // A different workspace's rows must never leak into either list.
  assert.deepEqual(await store.list({ workspaceId: WORKSPACE_B }), []);
});

test("InMemoryPublishHistoryStore.list: respects a caller-supplied limit smaller than the full history", async () => {
  const store = new InMemoryPublishHistoryStore();
  for (let i = 0; i < 5; i += 1) {
    await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ url: `u${i}`, publishedAt: `2026-08-1${i}T00:00:00.000Z` }) });
  }
  const limited = await store.list({ workspaceId: WORKSPACE_A, limit: 2 });
  assert.equal(limited.length, 2);
  assert.deepEqual(limited.map((r) => r.url), ["u4", "u3"], "limit keeps the NEWEST rows, not the oldest");
});

test("resolvePublishHistoryListLimit: defaults when omitted, clamps below 1 and above the max ceiling — a caller cannot force an unbounded read", () => {
  assert.equal(resolvePublishHistoryListLimit(undefined), 50);
  assert.equal(resolvePublishHistoryListLimit(0), 1);
  assert.equal(resolvePublishHistoryListLimit(-5), 1);
  assert.equal(resolvePublishHistoryListLimit(1_000_000), MAX_PUBLISH_HISTORY_LIST_LIMIT);
  assert.equal(resolvePublishHistoryListLimit(10), 10);
});
