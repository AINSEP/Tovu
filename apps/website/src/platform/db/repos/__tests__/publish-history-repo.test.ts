import assert from "node:assert/strict";
import { test } from "node:test";

import type { Insertable } from "kysely";

import type { PublishHistoryEntry } from "#src/features/deployments/static-publish/index";
import type { ContentKernel } from "../../content-kernel.js";
import type { PublishHistoryTable } from "../../content-database.generated.js";
import { describeEachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlPublishHistoryStore } from "../publish-history-repo.js";

/**
 * @file `SqlPublishHistoryStore` against a real, migrated content database on every dialect
 * (SQLite + PGlite, storage plan §4). `sqlite/__tests__/publish-history-repo.sqlite.test.ts` and
 * `publish-content-repos.dialects.test.ts` cover `getLast`/`list`/`recordSuccess` for static
 * publishes; this file covers what they never reach: the non-static `kind` discriminator (and a
 * legacy NULL one), the replay fields (`credentialId`, `configFields`), the destination-history
 * grouping query and the live-URL projection.
 */

const WS = "workspace-1";
const OTHER = "workspace-2";
const AT = "2026-10-20T00:00:00.000Z";

const STATIC: PublishHistoryEntry = {
  target: "vercel",
  url: "https://demo.vercel.app",
  reachable: true,
  status: "ready",
  projectName: "demo",
  configFields: { team: "acme" },
  publishedAt: AT,
  triggeredBy: "admin_ui",
};

/** Every optional field present, on a non-static kind. */
const FULL: PublishHistoryEntry = {
  kind: "deploy",
  target: "github-pages",
  url: "https://acme.github.io/demo/",
  reachable: true,
  status: "ready",
  projectName: "demo",
  credentialId: "cred-1",
  configFields: { branch: "gh-pages" },
  publishedAt: AT,
  owner: "acme",
  repo: "demo",
  basePath: "/demo",
  deploymentId: "abc123",
  commitSha: "abc123",
  branch: "gh-pages",
  triggeredBy: "agent_tool",
};

function make(base: ContentKernel) {
  const seeded = (async () => {
    await base.run((db) => db.insertInto("workspaces").values([WS, OTHER].map((id) => ({ id, name: id, slug: id, created_at: AT }))).execute());
  })();
  const kernel = heldUntil(base, seeded);
  return { kernel, store: new SqlPublishHistoryStore(kernel) };
}

/** A row written around the store, for shapes `recordSuccess` can no longer produce (a legacy NULL kind). */
async function insertRaw(kernel: ContentKernel, row: Partial<Insertable<PublishHistoryTable>>): Promise<void> {
  await kernel.run((db) => db.insertInto("publish_history").values({
    workspace_id: WS, target: "vercel", url: "https://legacy.vercel.app", reachable: true, status: "ready",
    project_name: "demo", published_at: AT, triggered_by: "admin_ui", ...row,
  }).execute());
}

describeEachDialect("SqlPublishHistoryStore", { tables: ["workspaces", "publish_history"], make }, (makeStore) => {
  test("a non-static entry with every optional field round-trips exactly", async () => {
    const { store } = makeStore();

    await store.recordSuccess({ workspaceId: WS, entry: FULL });

    assert.deepEqual(await store.list({ workspaceId: WS }), [FULL]);
  });

  test("an entry with no optional field round-trips with those keys absent", async () => {
    const { store } = makeStore();
    const bare: PublishHistoryEntry = { target: "netlify", url: "https://demo.netlify.app", reachable: false, status: "uploaded", projectName: "demo", publishedAt: AT, triggeredBy: "admin_ui" };

    await store.recordSuccess({ workspaceId: WS, entry: bare });

    const [found] = await store.list({ workspaceId: WS });
    assert.deepEqual(found, bare);
    assert.deepEqual(Object.keys(found!).sort(), Object.keys(bare).sort());
  });

  test("an entry without a kind is stored as kind 'static'", async () => {
    const { kernel, store } = makeStore();

    await store.recordSuccess({ workspaceId: WS, entry: STATIC });

    assert.deepEqual(await kernel.run((db) => db.selectFrom("publish_history").select("kind").execute()), [{ kind: "static" }]);
  });

  test("an explicit 'static' kind reads back with the kind key absent", async () => {
    const { store } = makeStore();

    await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, kind: "static" } });

    assert.deepEqual(await store.list({ workspaceId: WS }), [STATIC]);
  });

  test("a legacy NULL kind reads back with the kind key absent", async () => {
    const { kernel, store } = makeStore();
    await insertRaw(kernel, { kind: null });

    const [found] = await store.list({ workspaceId: WS });

    assert.equal("kind" in found!, false);
  });

  test("getLast ignores non-static kinds but treats a legacy NULL kind as static", async () => {
    const { kernel, store } = makeStore();
    await insertRaw(kernel, { kind: null, url: "https://legacy.vercel.app" });
    await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, kind: "deploy", url: "https://deploy.vercel.app" } });

    assert.equal((await store.getLast({ workspaceId: WS, target: "vercel" }))?.url, "https://legacy.vercel.app");
  });

  test("listDestinationHistory keeps only the newest row per (kind, target, project), newest first", async () => {
    const { store } = makeStore();
    await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, url: "https://old.vercel.app" } });
    await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, projectName: "other" } });
    await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, url: "https://new.vercel.app" } });

    const rows = await store.listDestinationHistory({ workspaceId: WS });

    assert.deepEqual(rows.map((row) => [row.projectName, row.url]), [["demo", "https://new.vercel.app"], ["other", STATIC.url]]);
  });

  test("listDestinationHistory groups a legacy NULL kind with 'static'", async () => {
    const { kernel, store } = makeStore();
    await insertRaw(kernel, { kind: null, config_fields_json: "{}" });
    await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, kind: "static" } });

    assert.deepEqual((await store.listDestinationHistory({ workspaceId: WS })).map((row) => row.url), [STATIC.url]);
  });

  test("listDestinationHistory skips unreachable rows unless they are a started deploy", async () => {
    const { store } = makeStore();
    await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, reachable: false } });
    await store.recordSuccess({ workspaceId: WS, entry: { ...FULL, target: "unconfirmed", reachable: false, status: "ready" } });
    await store.recordSuccess({ workspaceId: WS, entry: { ...FULL, target: "pending", reachable: false, status: "started" } });

    assert.deepEqual((await store.listDestinationHistory({ workspaceId: WS })).map((row) => row.target), ["pending"]);
  });

  test("listDestinationHistory skips static rows with no replayable config fields, but keeps peer and deploy rows without them", async () => {
    const { store } = makeStore();
    await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, configFields: undefined } });
    await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, kind: "tovu-peer", target: "peer-1", configFields: undefined } });
    await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, kind: "deploy", target: "deploy-1", configFields: undefined } });

    assert.deepEqual((await store.listDestinationHistory({ workspaceId: WS })).map((row) => row.target), ["deploy-1", "peer-1"]);
  });

  test("listDestinationHistory never reads another workspace's rows", async () => {
    const { store } = makeStore();
    await store.recordSuccess({ workspaceId: OTHER, entry: STATIC });

    assert.deepEqual(await store.listDestinationHistory({ workspaceId: WS }), []);
  });

  test("listDestinationHistory returns at most 201 destinations, the newest ones", async () => {
    const { store } = makeStore();
    for (let n = 0; n < 202; n++) await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, projectName: `p${n}` } });

    const rows = await store.listDestinationHistory({ workspaceId: WS });

    assert.equal(rows.length, 201);
    assert.equal(rows[0]?.projectName, "p201");
    assert.equal(rows.at(-1)?.projectName, "p1");
  });

  test("listLiveUrls returns each of the workspace's URLs once, sorted", async () => {
    const { store } = makeStore();
    await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, url: "https://b.example" } });
    await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, url: "https://a.example" } });
    await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, url: "https://b.example" } });
    await store.recordSuccess({ workspaceId: OTHER, entry: { ...STATIC, url: "https://other.example" } });

    assert.deepEqual(await store.listLiveUrls({ workspaceId: WS }), ["https://a.example", "https://b.example"]);
  });

  test("listLiveUrls returns at most 201 URLs", async () => {
    const { store } = makeStore();
    for (let n = 0; n < 202; n++) await store.recordSuccess({ workspaceId: WS, entry: { ...STATIC, url: `https://u${String(n).padStart(3, "0")}.example` } });

    const urls = await store.listLiveUrls({ workspaceId: WS });

    assert.equal(urls.length, 201);
    assert.equal(urls.at(-1), "https://u200.example");
  });
});
