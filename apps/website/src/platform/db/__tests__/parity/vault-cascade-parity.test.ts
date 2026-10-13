import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { CURRENT_SRC, GOLDEN_PATH, PARITY_DIALECTS, cascadeTranscript, expectedTranscript, loadParityModules, migratedParityFixture,
  type ParityModules, type Transcript } from "./parity-harness.js";

/** Query parity, cascades (DBMERGE-PLAN §2d `vault-cascade-parity`): `SqlUserPurge`, a raw principal
 * delete and a raw workspace delete leave the stores seeing exactly what they saw before the vault —
 * the purged user's personal key is gone, every other key stays, and a delete the old foreign keys
 * refused is still refused (or accepted) the same way. Golden from the pre-vault code (57291a25b),
 * with the one reviewed change in `PARITY_DELTAS` (a workspace delete now takes its site key along).
 */
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as { cascade: Transcript };
/** Pre-vault, site_assistant_credentials had no foreign key to workspaces, so a raw workspace
 * delete left that workspace's site key orphaned and still readable. secrets_vault.workspace_id is
 * ON DELETE CASCADE (9b20083b6), so the site key now goes with the workspace (workspace.2.site
 * reads unset), like every other workspace key already did. Intended (2026-10-12): workspace delete
 * is a hard delete with no restore or trash, so nothing relied on the orphan. */
const expected = expectedTranscript(golden.cascade, "cascade");
let mods: ParityModules;
before(async () => { mods = await loadParityModules(CURRENT_SRC); });

for (const dialect of PARITY_DIALECTS) {
  describe(`vault cascade parity [${dialect}]`, () => {
    let actual: Transcript;
    before(async () => {
      const fixture = await migratedParityFixture(dialect);
      try { actual = await cascadeTranscript(mods, fixture); } finally { await fixture.kernel.close(); }
    });
    for (const [name, prefix] of [["user purge removes only that user's personal key", "purge."],
      ["deleting a principal: same accept/reject and the same keys left", "principal."],
      ["deleting a workspace: same accept/reject, and all its keys go with it (site key included)", "workspace."]] as const) {
      test(name, () => {
        const pick = (transcript: Transcript) => Object.fromEntries(Object.entries(transcript).filter(([key]) => key.startsWith(prefix)));
        assert.deepEqual(pick(actual), pick(expected));
      });
    }
  });
}
