import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { freshPostgresDatabase, psql } from "#src/platform/db/__tests__/postgres-database";
import type { ContentDbSeedData } from "#src/platform/db/sqlite/content-db";
import { seededPosts, seededPresentation, seededWorkspace } from "../../configuration/seed.js";
import { openSiteStore } from "../open-site-store.js";

/**
 * @file `openSiteStore` on a real Postgres server: a preparation step that fails after the pool
 * connected (a first-run seed that breaks the posts primary key) closes that pool before the
 * rejection propagates, so no connection to the site's database outlives the failed open.
 * Needs the local server up (`postgres-database.ts`); it fails, never skips, when the server is down.
 */

const DATABASE = "tovu_open_site_store_failure";
const URL_ENV = "TOVU_OPEN_SITE_STORE_PG_URL";
let connectionString: string;
let siteDir: string;

before(() => {
  connectionString = freshPostgresDatabase(DATABASE);
  siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-open-site-store-pg-"));
});

after(() => {
  psql({ database: "postgres", sql: `DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE);` });
  fs.rmSync(siteDir, { recursive: true, force: true });
});

/** Server-side sessions connected to the test database, other than this query's own. */
function sessionsOnDatabase(): number {
  const result = psql({ database: "postgres", sql: `SELECT count(*) FROM pg_stat_activity WHERE datname = '${DATABASE}';` });
  assert.ok(result.ok, result.stderr);
  return Number(result.stdout.trim());
}

test("a failed preparation closes the pool: no session on the site's database survives the rejection", async () => {
  const [post] = seededPosts;
  const seed: ContentDbSeedData = { workspace: seededWorkspace, posts: [post, post], presentation: seededPresentation };
  await assert.rejects(
    openSiteStore(
      { storage: { kind: "postgres", secretRef: { env: URL_ENV } }, dbPath: path.join(siteDir, "content.db"), chatDbPath: path.join(siteDir, "chat.db"), role: "owner" },
      { env: { [URL_ENV]: connectionString }, seed }
    ),
    /duplicate key value violates unique constraint/
  );
  // A closed client's backend exits asynchronously after its Terminate message; an open pool's idle
  // client would stay for node-postgres's 10 s idle timeout, well past this 3 s window.
  let sessions = sessionsOnDatabase();
  for (let i = 0; sessions !== 0 && i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    sessions = sessionsOnDatabase();
  }
  assert.equal(sessions, 0, "every pooled connection is closed");
});
