/**
 * @file The redirects feature barrel (`../index.ts`): its runtime surface is exactly the Tovu-side
 * SQLite repo, table declaration and routing phase-handler wiring, each the owning module's own binding.
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as barrel from "#src/features/redirects/index";
import { registerRedirectsPhaseHandlers } from "#src/features/redirects/phase-handler";
import { SqliteRedirectRepo } from "#src/features/redirects/repo.sqlite";
import { REDIRECT_TABLES } from "#src/contracts/core/redirect-tables";

test("the redirects barrel exports exactly the SQLite repo and phase-handler registrar; table names live in contracts", () => {
  assert.deepEqual(Object.keys(barrel).sort(), ["SqliteRedirectRepo", "registerRedirectsPhaseHandlers"]);
  assert.equal("REDIRECT_TABLES" in barrel, false);
  assert.equal(barrel.SqliteRedirectRepo, SqliteRedirectRepo);
  assert.equal(barrel.registerRedirectsPhaseHandlers, registerRedirectsPhaseHandlers);
  assert.equal(typeof barrel.registerRedirectsPhaseHandlers, "function");
});
