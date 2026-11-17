# R13 sheet: host presets and frozen forwarders (+ G-SERVER-LOGIC)

Read `COMMON.md` first. Sites: `sites/R13.sites.tsv` (51): `server` 35 in 12 files, `cli` 1, `sqlite` 11 (one file), `infra` 4 (two files).

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
| R13d | receive the Q8 adapters (after R8, R11): package entries, tests, docs | 40k |

## R13a: Q2 forwarders
1. Coordinator-only file `scripts/injection-exceptions.json`: one entry per `{owner, target, specGlob}` for `sqlite → chat|daemon|db|registry` and `infra → db`, each with `ownerQuestion: "Q2"`, `approved: "2026-11-15"`, and a `removeAt: "next major"` note. The lane writes the exact JSON into its report; it does not edit the file. Read `scripts/injection-exceptions.json` and `scripts/lib/injection-edges.ts` first for the real entry schema.
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

## R13d: Q8 adapters arrive (after R8 and R11; depends on OD-3)
R8 moves `daemon/terminal.adapter.ts`; R11a moves `agent-plugins/lifecycle/node.ts`; R11b/c move or parameterize `sidecar/supervision/supervisor-node.ts`, `integrations/media-providers/dispatch/node.ts`, `devops/deploy/node.ts`; `plugins/host/node/*` and `agentic/skills/install/node-filesystem.ts` are named by DESIGN §2.3 (agentic has **no** remaining cross-package import in the census: verify `rg -n "@jini-ai/platform" packages/agentic/src -g '!**/__tests__/**'`; if empty, it needs no move).
1. All arrivals live under `packages/server/src/adapters/`, one file per adapter, each with its moved test. Add `"./adapters/<name>"` exports (node runtime) **only if OD-3 = yes** (hosts other than the preset may import them). If OD-3 = no, no export: the preset uses them internally and Tovu keeps its own bindings.
2. New dependencies of `@jini-ai/server` this creates: `agent-plugins`, `integrations`, `devops`, `sidecar` (already), `platform` (already). Each is an **optional peer** unless the preset's default daemon uses it; report the list for the coordinator (manifest + lockfile).
3. The owner rule in this run's brief says runtime adapter packages "never assemble services", while `@jini-ai/server` is by definition the package that assembles the standard daemon. Putting the adapters there couples "I want the Node file-lock binding" to "I depend on the whole preset". This is **OD-3** in INDEX; R13d does not start until it is answered.

## Tests to write first (R13c/d)
- R13c: a source-level export test for `@jini-ai/server` index that lists allowed exports; `createFrontendControl` absent (RED before the deletion).
- R13d: each adapter's moved test runs unchanged in its new home; plus one `runtime-port-bindings.typecheck.ts` line per adapter (the file exists from the daemon prerequisites: `packages/server/src/__tests__/runtime-port-bindings.typecheck.ts`) asserting the binding `satisfies` the core port **without casts**.

## STOP
- R13b: a vault function has a second owner already (extend it, do not add a parallel one), or a characterization test cannot be made to fail under its mutation.
- R13d: OD-3 unanswered.
