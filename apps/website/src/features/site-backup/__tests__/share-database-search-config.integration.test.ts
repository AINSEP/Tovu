import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { openContentDb } from "#src/platform/db/sqlite/content-db";

const stamp = "2026-11-25T12:00:00.000Z";
const markerId = "tovu.internal.post_search.projection_version";

// The SQLite projection never persists the search config, so the pin observes what the host binding
// hands the post-search backfill: the host's `tovu_search` config and its version-marker setting id.
test("the projected backup database rebuilds search with the host's tovu_search config and keeps private tables out", async t => {
  const actual = await import("@jini-ai/cms/posts/sql");
  const seen: Parameters<typeof actual.backfillPostSearchIndex>[0]["config"][] = [];
  t.mock.module("@jini-ai/cms/posts/sql", { namedExports: { ...actual, backfillPostSearchIndex: async (args: Parameters<typeof actual.backfillPostSearchIndex>[0], optional?: Parameters<typeof actual.backfillPostSearchIndex>[1]) => {
    seen.push(args.config);
    return actual.backfillPostSearchIndex(args, optional);
  } } });
  const { sanitizeShareDatabase } = await import("#src/server/runtime/composition/site-portability");
  const source = openContentDb({ filePath: ":memory:" });
  t.after(() => source.$client.close());
  source.$client.prepare("INSERT INTO workspaces(id,slug,name,created_at) VALUES ('ws','site','Site',?)").run(stamp);
  source.$client.prepare("INSERT INTO posts(id,workspace_id,title,slug,body_json,status,kind,updated_at,version) VALUES ('search-pin','ws','Portable astronomy','portable-astronomy',?,'published','post',?,1)")
    .run('{"type":"doc","content":[]}', stamp);
  // The live site's own projection marker is private runtime state: a share never carries it.
  source.$client.prepare("INSERT INTO setting_values_global(setting_id,value_json,state,def_version,seq,updated_by,updated_at,origin_plugin_id) VALUES (?,?,?,?,?,?,?,NULL)")
    .run(markerId, "99", "set", 0, 0, "system:post-search-reindex", stamp);
  // A legacy private table left behind by an upgrade is skipped, never copied or refused.
  source.$client.exec("CREATE TABLE site_assistant_credentials (id TEXT PRIMARY KEY, secret TEXT); INSERT INTO site_assistant_credentials VALUES ('c', 'PRIVATE_SEARCH_PIN_SENTINEL');");
  const projection = await sanitizeShareDatabase({ snapshot: source.$client.serialize() });
  assert.deepEqual(seen, [{ searchConfig: "tovu_search", projectionVersionSettingId: markerId }]);
  assert.equal(projection.bytes.includes(Buffer.from("PRIVATE_SEARCH_PIN_SENTINEL")), false);
  const shared = new Database(projection.bytes);
  t.after(() => shared.close());
  assert.equal((shared.prepare("SELECT count(*) AS n FROM setting_values_global WHERE setting_id = ?").get(markerId) as { n: number }).n, 0, "the live marker is not shipped");
  assert.equal(shared.prepare("SELECT name FROM sqlite_master WHERE name = 'site_assistant_credentials'").get(), undefined);
  assert.deepEqual(shared.prepare("SELECT post_id, title FROM post_search_document WHERE post_id = ?").get("search-pin"),
    { post_id: "search-pin", title: "Portable astronomy" });
});
