# R13 sheet: host presets and frozen forwarders (+ G-SERVER-LOGIC)

Revision 2 (judge finding 1; owner decision OD-3). The census now classes all 54 R13 rows as `allowed-preset` (39) or `frozen` (15): **R13 has no import-cleanup work.** What remains is the exception bookkeeping (R13a), moving logic out of the preset (R13b), one shell (R13c) and the adapter audit (R13d, rewritten: adapters no longer arrive in the preset).

Read `COMMON.md` first. Sites: `sites/R13.sites.tsv` (54, revision 3 re-count): `server` 38 in 13 files, `cli` 1 (39 `allowed-preset`), `sqlite` 11 (one file), `infra` 4 (two files) (15 `frozen`).

## What is already true (verified at the merged state)
- `packages/server/package.json` and `packages/cli/package.json` already carry `jini.kind: "host-preset"`, and the gate knows presets (`scripts/lib/injection-edges.ts:14-19,77`: a preset may import anything; "nothing may import a host-preset package"). **The "mark as host-preset" half of the LANES row is done.** The 36 server/cli sites are allowed edges; they are listed only because the census counts every non-base import.
- `sqlite` and `infra` are `jini.kind: "persistence-adapter"`. Their 15 sites are the Q2 frozen forwarders.
- Importers of the preset inside Jini: only `examples/{minimal-host,reference-web,neutral-host}` (hosts). `packages/db/src/owner-store/index.ts:1` names `@jini-ai/server/owner-store` in a comment only.

So R13 is four small jobs, not one big one.

| Sub-sheet | Work | Estimate (Sonnet) |
|---|---|---|
| R13a | Q2 exception entries for `sqlite`/`infra` + a surface freeze test | 25k |
| R13b | G-SERVER-LOGIC: move logic out of the preset | 120k |
| R13c | delete the `createFrontendControl` re-export; `cli → platform` stale dep | 20k |
| R13d | adapter audit after N1, R8b, R10b, R11: nothing Node-specific is left as a default in a domain package; docs | 30k |

## R13a: Q2 forwarders
1. **Same commit, three files** (no coordinator): (a) `scripts/injection-exceptions.json`: one entry per `{owner, target, specGlob}` for `sqlite → chat|daemon|db|registry` and `infra → db`, each with `ownerQuestion: "Q2"`, `approved: "2026-11-15"` and a `removeAt: "next major"` note (read `InjectionException` in `scripts/lib/injection-debt.ts` for the real schema first; if it has no free-text field, put the note in `_comment`). Its `_comment` today says the file is "empty by owner rule 2026-11-15" and that the forwarders "are deleted in lane R13": **that sentence is superseded by the owner rule in this run's brief (sqlite/infra frozen); reword it, keeping the "never add one to silence the gate" rule.** (b) `scripts/injection-debt.json`: delete the `sqlite`/`infra` keys the new exceptions now cover (the gate fails on a stale allowance). (c) the gate test that pins the exceptions list, if one exists (`rg -n "injection-exceptions" scripts/__tests__`). `pnpm guard` must be green after this one commit; `diff /tmp/guard-before.txt <(pnpm guard 2>&1)` shows no new finding.
2. Freeze test: `packages/sqlite/src/__tests__/old-surface` already pins the surface (GAPS §5 names `old-surface.json`); verify it fails when an export is **added** as well as removed (add a throwaway export locally, run, revert). Add the same pin for `infra` if missing (`packages/infra/src/__tests__/surface.test.ts`: sorted export names of each entry equal a checked-in list).
3. GAPS Q-G2 (keep chat's two `{ db }` wrappers in `sqlite` until the major): follow the recommendation (keep) unless the owner has answered otherwise; C-CHAT-DEPS CH2 creates `chat-history-compat.ts`. R13a does not touch it.

## R13b: G-SERVER-LOGIC (preset = wiring only)
```
jini_files:
  - packages/server/src/owner-store/backup.ts   (161 lines) | logic moves out
  - packages/server/src/owner-store/legacy.ts   (121 lines) | logic moves out
  - packages/server/src/storage/legacy/sqlite.ts (66 lines) | moves to the frozen forwarder
```
Other preset files over the size limit (`builtin-features.ts` 712, `create-local-node-daemon.ts` 524) are wiring; they are R7/R8 and size-design territory. **This sub-sheet does not split them.**

1. **Inventory first (lesson 2):** for each of the three files list every export, every importer (`rg -n "owner-store|storage/legacy" packages apps examples -g '!**/dist/**'`, both repos), every test, and every module-level value. Write the table into the report before moving anything.
2. **`owner-store/backup.ts`** (passphrase re-encryption of vault exports; uses platform's `openWithPassphrase`/`isCopyableKind`): the functions move to platform's `secrets/credential-sets` (it owns the vault service; search there for an existing backup/export owner first, `rg -n "backup|export" packages/platform/src/secrets/credential-sets`). The preset keeps a call. Security (class: secret export and re-encryption): characterization tests **first**, on the old code, with a pinned clock and pinned randomness: (a) export → import round-trip with the right passphrase restores every copyable kind; (b) wrong passphrase → the same typed error; (c) a non-copyable kind is not present in the export; (d) the export contains no plaintext secret (search the bytes for the fixture secret). Each must fail under its mutation: skip re-encryption, accept any passphrase, copy all kinds, write plaintext. Move the existing tests with the code; test count before/after per package.
3. **`owner-store/legacy.ts`** (legacy vault migration; imports db ×3, platform ×2): logic → the same platform folder if it is vault logic, with the db reads behind a small local port (`LegacyOwnerRowsPort`) that the preset binds to db's reader (platform must not import db). The comment in `packages/db/src/owner-store/index.ts:1` names the reader's home; update it if the path changes.
4. **`storage/legacy/sqlite.ts`** (legacy chat/agent-session DDL assembly; imports db, chat, daemon): move to `packages/sqlite` (the Q2 forwarder, deleted at the next major) as `legacy-ddl.ts`, exported from its index **only if** a host imports it today; if only the preset uses it, keep it in the preset (it is wiring three packages' DDL lists together) and record that reading. Do not add a new export to a frozen surface without saying so in the report (it changes R13a's pin).
5. Each move is one commit, green alone, importers repointed in the same commit, no shell left in `packages/server/src/owner-store/index.ts` (6 lines today: it re-exports; delete what moved).

## R13c: small deletions
1. `packages/server/src/index.ts:94` `export { createFrontendControl } from '@jini-ai/daemon/http'` is a re-export shell (ruling (d)). Importers: `rg -n "createFrontendControl" apps packages examples` in both repos; each one that imports it from `@jini-ai/server` switches to `@jini-ai/daemon/http`. Pair if Tovu has one. The second `server/src/index.ts` daemon site (line 95 or near): read it; same rule.
2. `cli → platform` is a declared dependency with no import (G-STALE-DEPS row). `cli → sidecar` (`local-daemon-discovery.ts`) is an allowed preset edge: nothing to do.

## R13d: adapter audit (after N1, R8b, R10b-1, R11a, R11b-1..3)
OD-3 put the Node bindings in `@jini-ai/node-adapters`; nothing moves into the preset. This run checks the end state and fixes only what the commands below print.
1. **No domain package binds platform by default:** `node <U>/sheets-2026-11-16/scripts/census.mjs <jini> <U> /tmp/census && awk -F'\t' '$2=="platform" && $12=="work"' /tmp/census/CENSUS-sites.tsv` prints nothing. A row that is left belongs to the lane named in column 11: report it, do not fix another lane's file.
2. **The adapter package obeys its rule:** N1's commands (surface pin T3, the `rg` for service assembly and for lazy imports) all pass with the entries later lanes added (`./agent-plugins`, `./http`, `./agent-runtime`); `awk -F'\t' '$1=="node-adapters"' /tmp/census/CENSUS-sites.tsv` shows only class `allowed-adapter`.
3. **The preset uses the bindings, it does not re-declare them:** `rg -n "satisfies (FileLockPort|AtomicFileWriterPort|ProcessControlPort|GuardedHttpPort)" packages/server/src examples -g '!**/__tests__/**'` prints nothing (a hand-written binding outside the adapter package is replaced by the import, in this run, if the file is the preset's or an example's).
4. `packages/server/src/adapters/node-pty.ts` stays (native dependency; OD-8). `packages/server/src/__tests__/runtime-port-bindings.typecheck.ts` keeps one line per binding the preset passes, each `satisfies` the core port without a cast.
5. Docs: `packages/node-adapters/README.md` and `source-map.md` list every entry and where each file came from; `CAPABILITIES.md` row; DESIGN §7 Q8 gets a one-line "superseded by OD-3 (2026-11-16)" note.

## Tests to write first (R13c/d)
- R13c: a source-level export test for `@jini-ai/server` index that lists allowed exports; `createFrontendControl` absent (RED before the deletion).
- R13d: no new production code; the three commands of items 1–3 are the tests, pasted into the report.

## STOP
- R13b: a vault function has a second owner already (extend it, do not add a parallel one), or a characterization test cannot be made to fail under its mutation.
- R13d: item 1 or 2 prints a row.
