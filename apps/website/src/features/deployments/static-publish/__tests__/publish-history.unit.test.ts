import assert from "node:assert/strict";
import test from "node:test";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqlitePublishHistoryStore } from "#src/platform/db/sqlite/publish-history-repo.sqlite";
import { workspaces } from "#src/platform/db/schema.sqlite";

import { InMemoryPublishHistoryStore, listPublishDestinations, listStaticPublishDestinations, publicPublishConfigFields, type PublishHistoryEntry } from "../publish-history.js";
import { loadBundledDeployTargets } from "../../deploy-targets/__tests__/bundled-deploy-targets.fixture.js";
import {
  MAX_PUBLISH_HISTORY_LIST_LIMIT,
  resolvePublishHistoryListLimit,
} from "#src/contracts/core/publish-history-list-limit";

/**
 * @file Publish-history port and in-memory double: persistent append-only history, not a last-value
 * cache. The concrete SQLite adapter's tests own on-disk atomicity; this suite owns the port contract.
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

test("both publish-history adapters return newest recorded first, even when publishedAt is out of order", async (t) => {
  const db = openContentDb(":memory:");
  t.after(() => db.$client.close());
  db.insert(workspaces).values({ id: WORKSPACE_A, name: WORKSPACE_A, slug: WORKSPACE_A, createdAt: "2026-08-16T00:00:00.000Z" }).run();
  for (const store of [new InMemoryPublishHistoryStore(), new SqlitePublishHistoryStore(db)]) {
    await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ url: "u1", publishedAt: "2026-08-16T00:00:00.000Z" }) });
    await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ url: "u2", publishedAt: "2026-08-14T00:00:00.000Z" }) });
    await store.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ target: "vercel", url: "u3", publishedAt: "2026-08-15T00:00:00.000Z" }) });
    assert.equal((await store.getLast({ workspaceId: WORKSPACE_A, target: "github-pages" }))?.url, "u2");
    assert.deepEqual((await store.list({ workspaceId: WORKSPACE_A })).map(row => row.url), ["u3", "u2", "u1"]);
    assert.deepEqual((await store.list({ workspaceId: WORKSPACE_A, target: "github-pages", limit: 1 })).map(row => row.url), ["u2"]);
    assert.deepEqual(await store.list({ workspaceId: WORKSPACE_B }), []);
  }
});

test("Publish destinations: both adapters retain latest successful project across full ledger, isolate workspaces, and omit partial/legacy runs", async t => {
  const db = openContentDb(":memory:");
  t.after(() => db.$client.close());
  for (const id of [WORKSPACE_A, WORKSPACE_B]) {
    db.insert(workspaces).values({ id, name: id, slug: id, createdAt: "2026-10-18T00:00:00Z" }).run();
  }
  const registry = await loadBundledDeployTargets();
  for (const historyStore of [new InMemoryPublishHistoryStore(), new SqlitePublishHistoryStore(db)]) {
    const list = () => listStaticPublishDestinations({ workspaceId: WORKSPACE_A, historyStore, registry });
    assert.deepEqual(await list(), []);
    const saved = entry({ target: "vercel", projectName: "first", credentialId: "connection-a", configFields: { teamId: "team-a", token: "NEVER_RETURN", unknown: "NEVER_RETURN" } });
    await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: saved });
    await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: { ...saved, projectName: "second" } });
    // More than list()'s 50/default and 200/max: derive before limiting, never from a recent page.
    for (let i = 0; i < 205; i++) {
      await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: { ...saved, projectName: "second", url: `https://run-${i}.example.test` } });
    }
    await historyStore.recordSuccess({ workspaceId: WORKSPACE_B, entry: { ...saved, projectName: "foreign" } });
    await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: { ...saved, projectName: "partial", reachable: false } });
    await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: { ...saved, projectName: "legacy", configFields: undefined } });
    // A newer partial must not replace the last confirmed success for the same destination.
    await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: { ...saved, reachable: false, url: "https://partial.example.test" } });
    const destinations = await list();
    assert.deepEqual(destinations.map(row => row.projectName), ["second", "first"]);
    assert.equal(destinations[0]!.url, "https://run-204.example.test");
    assert.equal(destinations[1]!.credentialId, "connection-a");
    assert.equal(destinations[1]!.lastPublishedAt, saved.publishedAt);
    assert.deepEqual(destinations[1]!.configFields, { teamId: "team-a" });
    assert.equal(JSON.stringify(destinations).includes("NEVER_RETURN"), false);
  }
});

test("Publish destinations: sorts by publication time rather than insertion order", async () => {
  const historyStore = new InMemoryPublishHistoryStore();
  const registry = await loadBundledDeployTargets();
  const newer = entry({ projectName: "newer", configFields: {}, publishedAt: "2026-10-18T02:00:00Z" });
  const older = entry({ projectName: "older", configFields: {}, publishedAt: "2026-10-18T01:00:00Z" });
  await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: newer });
  await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: older });
  const destinations = await listStaticPublishDestinations({ workspaceId: WORKSPACE_A, historyStore, registry });
  assert.deepEqual(destinations.map(row => [row.projectName, row.lastPublishedAt]), [
    ["newer", newer.publishedAt], ["older", older.publishedAt],
  ]);
});

test("Publish destinations: descriptor secrets and credential/config name collisions are never stored", async () => {
  const descriptor = (await loadBundledDeployTargets()).get("vercel")!.descriptor;
  const safe = publicPublishConfigFields({
    descriptor: { ...descriptor, configFields: [
      ...descriptor.configFields,
      { name: "privateConfig", label: "private", required: false, secret: true },
      { name: descriptor.credential!.tokenField, label: "collision", required: false },
    ] },
    config: { teamId: "team-a", privateConfig: "SECRET", [descriptor.credential!.tokenField]: "SECRET", undeclared: "SECRET" },
  });
  assert.deepEqual(safe, { teamId: "team-a" });
});

test("Publish destinations: over 200 distinct destinations refuses instead of silently truncating", async () => {
  const historyStore = new InMemoryPublishHistoryStore();
  for (let i = 0; i < 201; i++) {
    await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ target: "vercel", projectName: `site-${i}`, configFields: {} }) });
  }
  await assert.rejects(listStaticPublishDestinations({ workspaceId: WORKSPACE_A, historyStore, registry: await loadBundledDeployTargets() }), /limit exceeded/);
});


test("mixed destination kinds group independently, retain latest successes, and omit removed/never-pushed peers in both adapters", async t => {
  const db = openContentDb(":memory:");
  t.after(() => db.$client.close());
  for (const id of [WORKSPACE_A, WORKSPACE_B]) db.insert(workspaces).values({ id, name: id, slug: id, createdAt: "2026-10-18T00:00:00Z" }).run();
  const registry = await loadBundledDeployTargets();
  for (const historyStore of [new InMemoryPublishHistoryStore(), new SqlitePublishHistoryStore(db)]) {
    const staticRow = entry({ target: "vercel", projectName: "site", configFields: {}, publishedAt: "2026-10-18T01:00:00Z" });
    const peerRow = entry({ kind: "tovu-peer", target: "saved", projectName: "", configFields: undefined, url: "https://live.test", publishedAt: "2026-10-18T03:00:00Z" });
    const deployRow = entry({ kind: "deploy", target: "vercel", projectName: "site", configFields: undefined, url: "https://live.test/", publishedAt: "2026-10-18T02:00:00Z" });
    for (const row of [staticRow, peerRow, deployRow, { ...peerRow, publishedAt: "2026-10-18T04:00:00Z" },
      { ...peerRow, reachable: false, url: "https://failed.test" }, { ...peerRow, target: "deleted" }]) {
      await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: row });
    }
    await historyStore.recordSuccess({ workspaceId: WORKSPACE_B, entry: { ...peerRow, target: "foreign" } });
    const peers = [{ id: "saved", label: "Live", baseUrl: "https://live.test" },
      { id: "never-pushed", label: "Unused", baseUrl: "https://unused.test" },
      { id: "foreign", label: "Foreign", baseUrl: "https://foreign.test" }];
    const rows = await listPublishDestinations({ workspaceId: WORKSPACE_A, historyStore, registry, peers });
    assert.deepEqual(rows.map(row => [row.kind, row.lastPublishedAt]), [["tovu-peer", "2026-10-18T04:00:00Z"], ["deploy", deployRow.publishedAt], ["static", staticRow.publishedAt]]);
    assert.equal(rows[1]!.kind === "deploy" && rows[1]!.linkedPeerId, "saved");
    assert.equal((await historyStore.getLast({ workspaceId: WORKSPACE_A, target: "vercel" }))?.kind, undefined,
      "server deploys must not replace static capabilities even when target/project collide");
    assert.deepEqual((await listPublishDestinations({ workspaceId: WORKSPACE_A, historyStore, registry, peers: [] })).map(row => row.kind), ["deploy", "static"]);
  }
});

test("both adapters expose accepted deploys only as pending, including legacy reachable started rows", async t => {
  const db = openContentDb(":memory:");
  t.after(() => db.$client.close());
  db.insert(workspaces).values({ id: WORKSPACE_A, name: WORKSPACE_A, slug: WORKSPACE_A, createdAt: "2026-10-18T00:00:00Z" }).run();
  const registry = await loadBundledDeployTargets();
  for (const historyStore of [new InMemoryPublishHistoryStore(), new SqlitePublishHistoryStore(db)]) {
    for (const reachable of [false, true]) {
      await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ kind: "deploy", target: "server",
        projectName: String(reachable), url: "https://live.test", reachable, status: "started" }) });
    }
    const destinations = await listPublishDestinations({ workspaceId: WORKSPACE_A, historyStore, registry, peers: [] });
    assert.equal(destinations.length, 2);
    for (const destination of destinations) {
      assert.equal(destination.kind, "deploy");
      if (destination.kind !== "deploy") assert.fail("expected deploy destination");
      assert.equal(destination.status, "started");
      assert.equal(destination.statusMessage, "Deploy started, not confirmed");
    }
    assert.equal((await historyStore.listDestinationHistory({ workspaceId: WORKSPACE_A })).length, 2);
  }
});

test("destination selection pins replay eligibility, kind grouping, latest eligible row and the 201-row sentinel", async () => {
  const historyStore = new InMemoryPublishHistoryStore();
  assert.deepEqual(await historyStore.listDestinationHistory({ workspaceId: WORKSPACE_A }), []);
  const rows = [
    entry({ projectName: "legacy" }),
    entry({ projectName: "static", configFields: {} }),
    entry({ projectName: "static", configFields: {}, reachable: false }),
    entry({ kind: "tovu-peer", projectName: "static" }),
    entry({ kind: "tovu-peer", projectName: "failed-peer", reachable: false }),
    entry({ kind: "deploy", projectName: "pending", reachable: false, status: "started" }),
    entry({ kind: "deploy", projectName: "failed", reachable: false, status: "failed" }),
    entry({ kind: "deploy", projectName: "confirmed" }),
    entry({ kind: "deploy", projectName: "confirmed", url: "https://latest.test" }),
  ];
  for (const row of rows) await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: row });
  assert.deepEqual(await historyStore.listDestinationHistory({ workspaceId: WORKSPACE_A }), [rows[8], rows[5], rows[3], rows[1]]);
  assert.deepEqual(await historyStore.listDestinationHistory({ workspaceId: WORKSPACE_B }), []);
  for (let i = 0; i < 202; i++) {
    await historyStore.recordSuccess({ workspaceId: WORKSPACE_B, entry: entry({ projectName: `site-${i}`, configFields: {} }) });
  }
  const capped = await historyStore.listDestinationHistory({ workspaceId: WORKSPACE_B });
  assert.equal(capped.length, 201);
  assert.equal(capped[0]!.projectName, "site-201");
  assert.equal(capped[200]!.projectName, "site-1");
  await assert.rejects(listPublishDestinations({ workspaceId: WORKSPACE_B, historyStore, registry: await loadBundledDeployTargets(), peers: [] }), /limit exceeded/);
});

test("mixed projection pins empty deploy URLs, exact peer paths, pending status and saved peer identity", async () => {
  const historyStore = new InMemoryPublishHistoryStore();
  const registry = await loadBundledDeployTargets();
  const rows = [
    entry({ kind: "tovu-peer", target: "saved", projectName: "peer", url: "https://stale.test" }),
    entry({ kind: "tovu-peer", target: "deleted", projectName: "deleted" }),
    entry({ kind: "deploy", projectName: "empty", url: "", status: "started", reachable: false }),
    entry({ kind: "deploy", projectName: "root", url: "https://live.test/", status: "started", reachable: true }),
    entry({ kind: "deploy", projectName: "path", url: "https://live.test/other", reachable: true }),
    entry({ kind: "deploy", projectName: "pending", url: "https://pending.test", status: "started", reachable: false }),
  ];
  for (const row of rows) await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: row });
  const destinations = await listPublishDestinations({ workspaceId: WORKSPACE_A, historyStore, registry,
    peers: [{ id: "saved", label: "Current label", baseUrl: "https://live.test" }] });
  assert.deepEqual(destinations, [
    { id: "deploy:github-pages:pending", kind: "deploy", target: "github-pages", label: "pending", url: "https://pending.test", status: "started", statusMessage: "Deploy started, not confirmed", lastPublishedAt: rows[5]!.publishedAt },
    { id: "deploy:github-pages:path", kind: "deploy", target: "github-pages", label: "path", url: "https://live.test/other", status: "confirmed", lastPublishedAt: rows[4]!.publishedAt },
    { id: "deploy:github-pages:root", kind: "deploy", target: "github-pages", label: "root", url: "https://live.test/", status: "started", statusMessage: "Deploy started, not confirmed", lastPublishedAt: rows[3]!.publishedAt, linkedPeerId: "saved" },
    { id: "tovu-peer:saved", kind: "tovu-peer", peerId: "saved", label: "Current label", url: "https://live.test", lastPublishedAt: rows[0]!.publishedAt },
  ]);
});

test("a deploy that neither reached its host nor was accepted is not a destination; more than 200 history rows is refused", async () => {
  const registry = await loadBundledDeployTargets();
  // Both shipped stores pre-filter; the listing still refuses a port that hands back an unconfirmed row.
  const failed = entry({ kind: "deploy", target: "vercel", projectName: "site", configFields: undefined, reachable: false, status: "failed", url: "https://failed.test/" });
  const unfiltered = { listDestinationHistory: async () => [failed] } as unknown as InMemoryPublishHistoryStore;
  assert.deepEqual(await listPublishDestinations({ workspaceId: WORKSPACE_A, historyStore: unfiltered, registry, peers: [] }), []);
  const crowded = { listDestinationHistory: async () => Array.from({ length: 201 }, (_, i) => entry({ projectName: `p-${i}` })) } as unknown as InMemoryPublishHistoryStore;
  await assert.rejects(listPublishDestinations({ workspaceId: WORKSPACE_A, historyStore: crowded, registry, peers: [] }), { message: "publish destination limit exceeded (200)" });
});

test("in-memory listLiveUrls returns the workspace's distinct URLs sorted, stopping after 201", async () => {
  const historyStore = new InMemoryPublishHistoryStore();
  assert.deepEqual(await historyStore.listLiveUrls({ workspaceId: WORKSPACE_A }), []);
  for (const url of ["https://b.example", "https://a.example", "https://b.example"]) await historyStore.recordSuccess({ workspaceId: WORKSPACE_A, entry: entry({ url }) });
  await historyStore.recordSuccess({ workspaceId: WORKSPACE_B, entry: entry({ url: "https://foreign.example" }) });
  assert.deepEqual(await historyStore.listLiveUrls({ workspaceId: WORKSPACE_A }), ["https://a.example", "https://b.example"]);
  for (let i = 0; i < 250; i++) await historyStore.recordSuccess({ workspaceId: WORKSPACE_B, entry: entry({ url: `https://s${i}.example` }) });
  assert.equal((await historyStore.listLiveUrls({ workspaceId: WORKSPACE_B })).length, 201);
});
