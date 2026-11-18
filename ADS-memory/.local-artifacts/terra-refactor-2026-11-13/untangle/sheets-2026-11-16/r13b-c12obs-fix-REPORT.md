# r13b-c12obs-fix: R13b sheet (xpkg lane sheets)

Run 2026-11-18, unattended plan-edit run (plan documents only; no product code changed). Facts were re-read on `origin/refactor/terra`: **Jini `4c1892368` / Tovu `ada11733f`**. The C12-OBS half of this run is reported in `plan/untangle-gaps-2026-11-16` (`untangle/sheets/r13b-c12obs-fix-REPORT.md`).

## Verdict: R13b is EXECUTABLE (revision 4); its item 4 (`storage/legacy/sqlite.ts`) is VOID

The executor stopped on two STOP rules: a second owner, and pins that cannot fail. Both are resolved in the sheet:
1. **Wrong description.** `owner-store/backup.ts` is a read-only decoder of the legacy passphrase backup, not an exporter. The sheet now describes the real code: a decoder, plus a reader of `owner.db` made of 3 SQL reads, the legacy keyring and authorize policy, and a decrypt mapped to a fixed recovery error.
2. **Second owner.** `VaultArchiveEntry` (platform `credential-sets/vault-archive.ts`) is field for field the same as `LegacyOwnerEntry`. Revision 4 **deletes `LegacyOwnerEntry` and reuses `VaultArchiveEntry`**. `isCopyableKind` is already the single kind owner and is reused. `assertPortable` is a different, wider rule, so it is left alone (Q-R13b-1). The logic moves next to its owners:
   - decoder, legacy keyring/authorize policy, recovery error, `ownerContext`: a new platform subpath `@jini-ai/platform/secrets/legacy-owner`;
   - SQL reads: db's `owner-store` entry, which already owns that schema;
   - preset: keeps only file wiring, with `countLegacyOwnerStore` and `readLegacyOwnerStore` signatures unchanged.
3. **Pins that cannot fail.** 16 mutations were run against the existing 53 tests on `4c1892368`. 11 turned red. 5 survived:
   - B1, copyable-kind gate: the existing case uses `custom`, which `VAULT_KINDS` already rejects;
   - L3, `authorize` allows all;
   - L5 and L6, read-write open;
   - L7, workspace filter removed.

   Four new pins were written and proven GREEN on the base and RED under each surviving mutation. They are checked in next to the sheet as `R13b-characterization-pins.test.ts.txt`, with the replay script `R13b-mutations.py.txt`.
4. **Item 4.** `storage/legacy/sqlite.ts` has no importer in Jini or Tovu source, so it stays in the preset as wiring (VOID; the frozen `sqlite` surface is unchanged). This matches the executor's reading.

## What changed
- `R13-hosts.md`:
  - R13b section rewritten (revision 4), covering: the real-code table; the ownership table; the plan decision and the rejected options; prerequisite commands with their exact expected output; step 1 (pins first, mutation table); step 2 (one Jini commit + the paired Tovu commit, the file-by-file move, tests per package, shared files, changeset); step 3 (extra gate commands); and its own STOP list.
  - Summary table row and STOP line updated.
- `INDEX.md`: R13 row notes revision 4. §4 write sets gain the new R13b files: platform manifest/knip (serialized after N1), db owner-store entry, the error-gate-debt row, the server `kysely` peer, and the Tovu owner-store CLI files.
- New: `R13b-characterization-pins.test.ts.txt` and `R13b-mutations.py.txt`.

Command used to prove the pins (Node 24.11.1; `--maxWorkers=2` breaks server's vitest pool config, so it is not used):
```bash
cd packages/server && npx vitest run src/owner-store     # base: 3 files, 53 passed; with pins: 57 passed
python3 -I R13b-mutations.py.txt                         # B1, L3, L5, L6, L7 red only once the pins exist
```

## Still open
- **Owner veto point (plan decision):** keep the legacy import, moved out of the preset. If the owner prefers to delete the legacy import or to keep it in the preset, R13b becomes VOID / a deletion sheet.
- **Q-R13b-1:** platform has two portability rules. `isCopyableKind` (copies) rejects `custom` and `api-connection`. `assertPortable` (archives) lets them through but rejects every principal. Should they be one rule? R13b does not change either.
- `assertPortable`-style duplicate-ID checks exist in both the decoder and `prepareVaultArchiveRestore`. That is intentional: they run at two different boundaries.
- The R13b executor must still run the full COMMON gates. The plan run only ran the server owner-store tests and the mutations; it did not build platform or db with the moved code.
- R13d is unchanged and still waits on its wave.
