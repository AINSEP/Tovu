/**
 * @file The redirects feature barrel (`../index.ts`): its runtime surface is exactly the Tovu-side
 * SQLite repo, the owning module's own binding. The routing phase-handler registrar lives in
 * `@jini-ai/cms/redirects/site/phase-handler` and is imported from there, never re-exported.
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as barrel from "#src/features/redirects/index";
import { SqliteRedirectRepo } from "#src/features/redirects/repo.sqlite";
import { REDIRECT_TABLES } from "#src/contracts/core/redirect-tables";

test("the redirects barrel exports exactly the SQLite repo; table names live in contracts", () => {
  assert.deepEqual(Object.keys(barrel).sort(), ["SqliteRedirectRepo"]);
  assert.equal("REDIRECT_TABLES" in barrel, false);
  assert.equal("registerRedirectsPhaseHandlers" in barrel, false);
  assert.equal(barrel.SqliteRedirectRepo, SqliteRedirectRepo);
});
