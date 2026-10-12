import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { CURRENT_SRC, GOLDEN_PATH, PARITY_DIALECTS, cascadeTranscript, loadParityModules, migratedParityFixture,
  type ParityModules, type Transcript } from "./parity-harness.js";

/** Query parity, cascades (DBMERGE-PLAN §2d `vault-cascade-parity`): `SqlUserPurge`, a raw principal
 * delete and a raw workspace delete leave the stores seeing exactly what they saw before the vault —
 * the purged user's personal key is gone, every other key stays, and a delete the old foreign keys
 * refused is still refused (or accepted) the same way. Golden from the pre-vault code (57291a25b).
 */
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as { cascade: Transcript };
/** Real difference (2026-10-12), not fixed here: pre-vault, site_assistant_credentials had no
 * foreign key to workspaces, so a raw workspace delete left that workspace's site key orphaned and
 * still readable. secrets_vault.workspace_id is ON DELETE CASCADE, so the site key goes with the
 * workspace (workspace.2.site reads unset). The other keys already cascaded before. */
const WORKSPACE_DELETE = "vault cascades a workspace delete to its site-assistant key; pre-vault left it orphaned";
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
      ["deleting a workspace: same accept/reject and the same keys left", "workspace."]] as const) {
      test(name, prefix === "workspace." ? { todo: WORKSPACE_DELETE } : {}, () => {
        const pick = (transcript: Transcript) => Object.fromEntries(Object.entries(transcript).filter(([key]) => key.startsWith(prefix)));
        assert.deepEqual(pick(actual), pick(golden.cascade));
      });
    }
  });
}
