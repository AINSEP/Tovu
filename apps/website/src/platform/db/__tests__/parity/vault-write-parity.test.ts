import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { CURRENT_SRC, GOLDEN_PATH, WRITE_SEQUENCES, expectedTranscript, knownIssue, loadParityModules, memoryParityDeps,
  migratedParityFixture, unordered, writeTranscript, type ParityModules, type Transcript } from "./parity-harness.js";

/** Query parity, write side (DBMERGE-PLAN §2d): scripted write sequences on upgraded legacy rows —
 * create/rotate/set-default/delete-default/promotion/label collision (vendor, source), custom CRUD
 * and cross-category label uniqueness, peer CRUD with and without a key, atomic media bulk replace,
 * destination last-run patch (missing row = no-op), MCP save/lease/delete, assistant set/delete —
 * compared step by step with the pre-vault transcript. `memory` runs the same script through the
 * route-test fakes over one `InMemoryVaultRepo` seeded with the migrated rows, proving the fake
 * behaves like SQL. Reviewed changes: `PARITY_DELTAS`; real differences: `KNOWN_PARITY_ISSUES` (todo).
 */
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as { write: Transcript };
const expected = expectedTranscript(golden.write, "write");
const keys = Object.keys(golden.write);

let mods: ParityModules;
before(async () => { mods = await loadParityModules(CURRENT_SRC); });

for (const variant of ["sqlite", "pglite", "memory"] as const) {
  describe(`vault write parity [${variant}]`, () => {
    let actual: Transcript;
    before(async () => {
      const fixture = await migratedParityFixture(variant === "pglite" ? "pglite" : "sqlite");
      try {
        actual = await writeTranscript(mods, fixture, variant === "memory" ? { deps: await memoryParityDeps(mods, fixture) } : {});
      } finally { await fixture.kernel.close(); }
    });

    for (const sequence of WRITE_SEQUENCES) {
      const selected = keys.filter(key => key.startsWith(`${sequence}.`));
      if (variant === "memory" && sequence === "mcp") {
        test(`${sequence}: every step matches`, { skip: "MCP server rows live outside the vault; there is no vault-backed MCP fake to compare" }, () => {});
        continue;
      }
      const clean = selected.filter(key => knownIssue("write", key) === undefined);
      const orderOnly = selected.filter(key => knownIssue("write", key)?.orderOnly);
      const pick = (transcript: Transcript, picked: string[], ordered: boolean) =>
        Object.fromEntries(picked.map(key => [key, ordered ? transcript[key] : unordered(transcript[key])]));
      test(`${sequence}: every step matches`, () => {
        assert.deepEqual(pick(actual, [...clean, ...orderOnly], false), pick(expected, [...clean, ...orderOnly], false));
      });
      for (const id of new Set(selected.flatMap(key => knownIssue("write", key)?.id ?? []))) {
        const issueKeys = selected.filter(key => knownIssue("write", key)?.id === id);
        const issue = knownIssue("write", issueKeys[0])!;
        test(`${sequence}: ${id}`, { todo: issue.note },
          () => assert.deepEqual(pick(actual, issueKeys, true), pick(expected, issueKeys, true)));
      }
    }
  });
}
