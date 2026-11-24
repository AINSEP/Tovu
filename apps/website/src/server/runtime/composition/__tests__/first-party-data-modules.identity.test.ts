import { contentKernel } from "#src/platform/db/content-kernel";
import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { checkNamespaceAdoption } from "@jini-ai/db/data-modules";

import { FIRST_PARTY_DATA_MODULES } from "../data-modules.js";

/** @file An old site already holds `store`/`lipay` identity rows minted under the host's first-party publisher. */
const RETAINED_PUBLISHER = "tovu-core";

// Mutation: skip the host's publisher binding in `data-modules.ts` (let the engine manifests declare their own
// publisher) -> the retained `store`/`lipay` rows read as a provenance mismatch and these decisions are RED.
test("an old site's retained store and lipay identity rows are adopted unchanged by the bundled manifests", async () => {
  const db = new Database(":memory:");
  const kernel = contentKernel({ store: db });
  const builtins = FIRST_PARTY_DATA_MODULES.filter(module => module.pluginId === "store" || module.pluginId === "lipay");
  assert.deepEqual(builtins.map(module => module.pluginId).sort(), ["lipay", "store"]);
  for (const module of builtins) {
    await checkNamespaceAdoption({ db: kernel, pluginId: module.pluginId, provenance: { sourceUrl: `builtin://${module.pluginId}`, publisher: RETAINED_PUBLISHER } });
  }
  for (const module of builtins) {
    assert.equal(module.provenance.publisher, RETAINED_PUBLISHER);
    const decision = await checkNamespaceAdoption({ db: kernel, pluginId: module.pluginId, provenance: module.provenance });
    assert.deepEqual(decision, { allowed: true, track: "unchanged" }, module.pluginId);
  }
  db.close();
});

test("other provenance still needs consent: a foreign publisher for `store` is refused", async () => {
  const db = new Database(":memory:");
  const kernel = contentKernel({ store: db });
  await checkNamespaceAdoption({ db: kernel, pluginId: "store", provenance: { sourceUrl: "builtin://store", publisher: RETAINED_PUBLISHER } });
  const decision = await checkNamespaceAdoption({ db: kernel, pluginId: "store", provenance: { sourceUrl: "builtin://store", publisher: "someone-else" } });
  assert.equal(decision.allowed, false);
  assert.equal(decision.track, "consent-required");
  db.close();
});
