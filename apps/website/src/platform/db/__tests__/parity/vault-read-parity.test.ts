import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { CURRENT_SRC, GOLDEN_PATH, PARITY_DIALECTS, READ_GROUPS, expectedTranscript, knownIssue, loadParityModules, migratedParityFixture,
  readTranscript, unordered, type ParityModules, type Transcript } from "./parity-harness.js";

/** Query parity, read side (DBMERGE-PLAN §2d): legacy rows on the pre-0012 schema → the real pinned
 * 0012 step and the boot re-seal → every vault kind read through the store the routes call, compared
 * with the transcript the PRE-vault stores produced on the same rows (`__fixtures__`, captured by
 * `capture-vault-golden.ts` from 57291a25b). Reviewed changes are `PARITY_DELTAS`; real differences
 * found are `KNOWN_PARITY_ISSUES`, each pinned by a `todo` test that still asserts the old value.
 */
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as { read: Transcript };
const expected = expectedTranscript(golden.read, "read");
const keys = Object.keys(golden.read);
function pick(transcript: Transcript, selected: string[], ordered: boolean) {
  return Object.fromEntries(selected.map(key => [key, ordered ? transcript[key] : unordered(transcript[key])]));
}

let mods: ParityModules;
before(async () => { mods = await loadParityModules(CURRENT_SRC); });

for (const dialect of PARITY_DIALECTS) {
  describe(`vault read parity [${dialect}]`, () => {
    let actual: Transcript;
    before(async () => {
      const fixture = await migratedParityFixture(dialect);
      try { actual = await readTranscript(mods, fixture); } finally { await fixture.kernel.close(); }
    });

    test("the transcript covers every golden key and nothing else", () => {
      assert.deepEqual(Object.keys(actual).sort(), [...keys].sort());
    });

    for (const group of READ_GROUPS) {
      const selected = keys.filter(group.select);
      const blocking = (key: string) => { const issue = knownIssue("read", key); return issue !== undefined && (!issue.orderOnly || group.ordered); };
      const clean = selected.filter(key => !blocking(key));
      if (clean.length > 0) {
        test(group.name, () => assert.deepEqual(pick(actual, clean, group.ordered), pick(expected, clean, group.ordered)));
      }
      for (const id of new Set(selected.filter(blocking).map(key => knownIssue("read", key)!.id))) {
        const issueKeys = selected.filter(key => blocking(key) && knownIssue("read", key)!.id === id);
        test(`${group.name} — ${id}`, { todo: knownIssue("read", issueKeys[0])!.note },
          () => assert.deepEqual(pick(actual, issueKeys, group.ordered), pick(expected, issueKeys, group.ordered)));
      }
    }
  });
}
