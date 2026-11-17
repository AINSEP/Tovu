# INDEX: notes second app (2026-11-17)

Status: **PARTIAL, revision 2** (2026-11-17). Revision 2 answers `CODEX-JUDGE.md` (5 blockers, 18 majors, 3 minors):
**26 accepted, 0 rebutted**; 22 are fixed in the plan, 4 are only partly fixed. What is still open is numbered in
"Revision 2 - still open" at the end of this file; **do not dispatch a sheet that list names**.
Planning only: nothing was built, typechecked or run. Design and gap list: `DESIGN.md`. Shared rules: `sheets/COMMON.md`.
Revision 2 was verified against `integ/merge-a-2026-11-16` (Jini `dde69a6d`, Tovu `e801e9ae`); `integ/merge-final-2026-11-16`
did not exist. Revision 1 read Jini at `integ/merge-b-2026-11-16@674a19ea`. The two branches have diverged, so every
sheet starts with its inventory commands and COMMON's base rule.

**How to read a sheet now:** each revised sheet starts with a "Revision 2 corrections" block. It is authoritative and
replaces the steps it names. The older step text below it has not been rewritten in place yet (open item 1).

## 0. Revision 2 changes to the sheet list

| Change | Sheet | Why (judge finding) |
|---|---|---|
| New, runs before N1 / N2 | `GA-admin-entity-seams.md` (150k) | create vs persisted fields, mutation-failure seam, refresh seam, `search` in the list query (6, 7, 8, 12) |
| New, runs before N3 | `G19-entry-tool-body.md` (70k) | the update tool cannot change a body (11) |
| Withdrawn | `G8-mcp-bin.md` | `@jini-ai/mcp` already exports `./bin` (23) |
| Rescoped to "consume lane S's adapter" (about 50k) | `G2-entries-sql.md` | lane S sheet S2 already owns `cms/entries/sql` (1, 13) |
| Home changed to `@jini-ai/node-adapters`; matching stays in core | `G1-node-server.md` | owner-approved package for Node bindings; core owns the route table (21) |
| Blocked | `N3-assistant-server.md` (open item 2), `D2-desktop-packaging.md` (OD-N11) | 15, 25 |

New order: `N0 → GA → N1 → { N2 ‖ (G19 → N3) }`, then `G7 → N4 → N5`, then wave C `{ G1 ‖ G2 } and G6 → G5 → G4`
(G1 needs `@jini-ai/node-adapters`; G2 needs lane S2), then `D0 → D1 → D2`.
New estimate: **about 1.75M Sonnet for 17 runs** (16 − G8 + GA + G19; G2 smaller; D0, N2, N4, N5, G6 each about 20k
larger for the added tests), plus one Opus design pass of about 60k for open item 2. Revision 1 said 1.6M for 16.

Gap owners after revision 2 (the gap list stays complete; ids continue `DESIGN.md` §5):

| Gap | Owner | State |
|---|---|---|
| G2 SQL entry repository | lane S, sheet S2 (`plan/lanes-s-u-2026-11-16`) | consume, do not build |
| G8 MCP bin path | none | closed: not a gap |
| G15 durable identity repository | lane S, sheet S3 (`S/S3-identity-sql.md`, `user-management/server/sql`) | existing owner; no new design asked |
| G16 entity port concurrency / object arguments | owner decision OD-N10, **before** G6 (new adapters would freeze the positional form) | open |
| G19 (new) update tool forwards `body` | `G19-entry-tool-body.md` | sheeted |
| G20 (new) page API and a real read bound for `listEntries`; memory-repo transaction semantics | lane S, S2's owner | not sheeted here |
| G21 (new) a version conflict from an entry tool reaches the model as an input error, not an internal error | cms entry tools owner; follows G19 | not sheeted; N3 characterizes today's answer |
| G22 (new) MCP callback credential for a host-assembled daemon | this plan, open item 2 | design missing |
| Node `fs` / lock / process bindings, `node:http` adapter | `@jini-ai/node-adapters` (xpkg plan) | prerequisite of G1, D1 |

## 1. Answer in one screen

- **Where it lives:** Jini `examples/`: `notes-app` (exists, server), `notes-web` (new), `notes-desktop` (new). Not a separate repo yet (OD-N1).
- **Feature set v1:** notes list/create/edit/publish/unpublish (no delete: the entry services have none), text search, an assistant docked in the admin shell that edits notes through the 5 existing entry tools, optional desktop shell. One local owner, no login.
- **Gaps found:** 18 (`DESIGN.md` §5). 13 are closed by sheets here and G3 in part; G9 (Express-bound daemon preset) and G10 (package closure) belong to existing xpkg lanes; G3(c), G15, G16 need an owner decision or a design first.
- **How:** Phase A builds the app on today's exports with app-owned glue in `src/gaps/*` under a line budget; Phase B moves each glue file into its Jini owner and deletes it; Phase D adds the desktop shell.

## 2. Sheets (each ONE Sonnet run)

| Sheet | What | Repo files | Needs | Est. |
|---|---|---|---|---|
| `N0-server-baseline.md` | origin guard, cookie fix, split >50-line function, gap ledger | `examples/notes-app` | none | 60k |
| `N1-notes-entity-api.md` | `AdminEntityPort` for notes, JSON entity routes, search, stale-write 409 | `examples/notes-app` | N0 | 90k |
| `N2-web-admin.md` | `notes-web`: `AdminShell` + entity panel + kit binding + search panel; static serving | `examples/notes-web`, one route in notes-app | N1 | 150k |
| `N3-assistant-server.md` | daemon preset + entry tools + MCP bin + same-origin proxy | `examples/notes-app` | N1 | 120k |
| `G7-chat-daemon-transport.md` | move reference-web's daemon chat transport into `@jini-ai/chat` | `packages/chat`, `examples/reference-web` | coordinator edit of `chat/package.json`; see §4 | 100k |
| `N4-chat-ui.md` | `ChatPane` in the shell's assistant slot | `examples/notes-web` | N2, N3, G7 | 90k |
| `N5-web-proof.md` | browser e2e, install-closure baseline, packed-tarball boot | examples | N0–N4 | 80k |
| `G1-node-server.md` | `Server` adapter for `node:http` into `@jini-ai/http-kit` | `packages/http-kit`, examples | OD-N2; N0 | 70k |
| `G2-entries-sql.md` | `@jini-ai/cms/entries/sql` (tables, repo, text + cursor), no-op outbox ports | `packages/cms`, `examples/notes-app` | OD-N3; N1 | 130k |
| `G6-entity-adapters.md` | admin entities: http + memory adapters, conformance, `Server` registrar | `packages/admin`, examples | N2; R1c/R2 landed | 130k |
| `G5-field-renderer-search.md` | `renderField` port + `AdminEntityListQuery.search` + list search box | `packages/admin`, `examples/notes-web` | G6 (same folder, serial) | 110k |
| `G8-mcp-bin.md` | `resolveJiniMcpBin` exported by `@jini-ai/mcp` | `packages/mcp`, examples | N3 | 40k |
| `G4-admin-kit-slices.md` | required core kit + optional feature kits | `packages/admin`, examples, Tovu binding | R1c, R2a, R2b landed; OD-N8 | 90k |
| `D0-desktop-host-ipc-bridge.md` | `desktop-host` `./bridge`, `./ipc`, ready-line launcher option | `packages/desktop-host`, `examples/reference-desktop` | merge-final (has `moves/audit2-desktop`) | 140k |
| `D1-notes-desktop.md` | `examples/notes-desktop`: Electron shell around notes-app; moves the Electron binders into desktop-host (G18) | `examples/notes-desktop`, one file into `packages/desktop-host` | D0, N5 | 120k |
| `D2-desktop-packaging.md` | packaging recipe/template + packaged smoke | `packages/devops` docs/template, `examples/notes-desktop` | D1 | 80k |
| **Total** | **16 runs** | | | **~1.6M Sonnet** |

Plus one batched review (Opus, ~40k) after each wave in §3.

## 3. Order: web first, desktop second

| Wave | Runs (parallel inside a wave unless an arrow says otherwise) | Gate before the next wave |
|---|---|---|
| A (now; examples only) | N0 -> N1 -> { N2 ‖ N3 } | example gates; review |
| B | G7 -> N4 -> N5 | example gates + chat package tests; browser look at the app (Chrome): list, edit, conflict, search, assistant; review |
| C (gap closure) | { G1 ‖ G2 ‖ G8 } and G6 -> G5 -> G4 | Jini repo gates; Tovu typecheck linked to the wave's Jini SHA; **gap lines in both `GAPS.json` go down, never up**; N5's e2e re-run unchanged; review |
| D (desktop) | D0 -> D1 -> D2 | desktop gates; packaged app launches and restarts with data intact; review |

Wave C may start before wave B finishes for G1, G2, G8 (they do not touch chat or notes-web's assistant).
Every G sheet ends by re-running N5's e2e (once N5 exists) with no edit to the e2e file: that is the
characterization test for the glue it deletes.

## 4. Prerequisites, including xpkg lanes

| Prerequisite | Why | Blocks |
|---|---|---|
| A pushed integration base (merge-final, else merge-b) | every cited path was checked there; `moves/audit2-desktop` and the size splits are only on merge-b | all |
| xpkg wave 0 `G-STALE-DEPS` | it edits 14 `package.json` files alone; G sheets add `exports` entries to `chat`, `cms`, `admin`, `http-kit`, `mcp`, `desktop-host` | wave C, G7, D0 (their `package.json` edits; coordinator applies them if the lane rule "coordinator-only `package.json`" is still in force) |
| xpkg **R1c, R2a, R2b** (admin kit call sites, forms catalog, embed comments) | same package, and R1c edits kit call sites; G4 changes `react/kit.tsx` | G4 hard; G5/G6 soft (check `sites/R1.sites.tsv`, `sites/R2.sites.tsv` for `react/entities/**` and `core/ports/entities.ts` at dispatch; planner did not read them) |
| **C-CHAT-DEPS** (R4, includes chat kit C9b) | 18 import sites in `packages/chat`; when it lands the host must bind a chat kit | G7 (file overlap check at dispatch: G7 only adds a new folder + one `exports` line), N4 (handles both states by its preflight) |
| daemon **R7** + preset **R13** | until then the daemon is Express-bound (G9): the app needs `express` installed and the N3 proxy | follow-up N6 only (§6); nothing in §2 waits |
| Owner decisions OD-N2, OD-N3, OD-N8 | they pick a package home or a contract shape | G1, G2, G4 respectively |

Not prerequisites: R6–R13 other than above, G-TESTS, C12-OBS, the size lanes. Wave A touches no file any lane touches.

## 5. Owner decisions

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| OD-N1 | Jini `examples/` or a separate repo? | `examples/` now; N5's packed-tarball boot proves it runs outside the workspace; move to its own repo after the first publish that contains the wave-C exports | nothing (default applied) |
| OD-N2 | Home of the `node:http` `Server` adapter | `@jini-ai/http-kit/node-server` (http-kit already owns HTTP toolkit code; `node:http` is a runtime, not a framework). Alternative: keep it example-only and accept the duplicate in `cookie-consent-standalone` | G1 |
| OD-N3 | May `@jini-ai/cms` ship `./entries/sql`? `entries/index.ts:99` says no adapter "deliberately", but forms/comments/redirects/widgets ship `./sql` | Yes, with a domain-local kernel port (no cms -> db import) and host-named tables, exactly like `forms/sql` | G2 |
| OD-N4 | Sign-in in v1 | Single local owner + Host/Origin guard; real login waits for a durable identity repo (G15) | nothing |
| OD-N5 | Search | v1 = text query on the entity list (G2 + G5). Generalising `@jini-ai/search` away from `siteId`/`url` and shipping an in-process provider is its own design | G3(c) |
| OD-N6 | Run wave A before the xpkg lanes land? | Yes: it touches only `examples/`, and it gives every lane a second consumer that `pnpm -r typecheck` checks | timing only |
| OD-N7 | Which agent does the assistant use? | Whatever CLI the daemon detects; tests and the demo use the scripted agent; BYOK is out of scope | nothing |
| OD-N8 | `AdminKit` split | Required core (what shell + entities use) + optional feature kits (media, html editor, lightbox…); no packaged default binding yet (each host binds; examples show how) | G4 |
| OD-N9 | Desktop server placement | Sidecar under Node, not inside Electron main | D1 |
| OD-N10 | Should `AdminEntityPort.update` gain `expectedVersion` and object arguments (G16)? | Decide after G6: the conformance suite will show how many adapters need it; until then the declared `version` field carries it | nothing |

Revision 2: executors gate on decisions with `grep -nE "^\| OD-N<n> .*\| DECIDED: " notes-second-app/INDEX.md`. State of each:

| # | State |
|---|---|
| OD-N1 | DECIDED: examples/ (default applied) |
| OD-N2 | DECIDED: `@jini-ai/node-adapters` (owner-approved new package; replaces the http-kit recommendation above) |
| OD-N3 | DECIDED: superseded. Lane S sheet S2 ships `cms/entries/sql`; NOTES consumes it |
| OD-N4 | OPEN (no sheet waits) |
| OD-N5 | OPEN (no sheet waits) |
| OD-N6 | OPEN (timing only) |
| OD-N7 | OPEN (no sheet waits) |
| OD-N8 | OPEN: blocks G4 |
| OD-N9 | OPEN: blocks D1 |
| OD-N10 | OPEN: now blocks **G6** (finding 19): decide object arguments and `expectedVersion` on `AdminEntityPort.update` before two new adapters implement the positional form |
| OD-N11 (new) | OPEN: blocks D2. Which Node runs the packaged sidecar: Electron's own (through `node-toolchain` shims; SQLite built for Electron's ABI) or a bundled Node distribution (then `node-toolchain` is not used). Recommendation: Electron's own, because that is what the package provides today |
| OD-N12 (new) | OPEN: blocks D0. May the desktop examples depend on a bundler (esbuild) for the sandboxed preload, if no workspace package already declares it? |

## 6. After these sheets (not sheeted)

- **N6 single listener** (after R7/R13): mount the daemon's routes on the app's `Server`, delete `src/gaps/daemon-proxy.ts` and the `express` dependency. Re-run `scripts/closure.mjs`.
- **Closure ratchet:** each xpkg lane that removes a package edge re-runs `examples/notes-app/scripts/closure.mjs` and updates the README table; the count must not rise.
- **G3(c)** site-shaped search contract, **G15** durable identity repos, **G16** entity port concurrency: owner decisions, then designs.
- Tovu adopting `AdminShell` and the daemon transport is Tovu work, outside this plan.

## 7. How this plan answers the 26 lessons (the ones that apply)

- **Inventory before reuse (2, 9, 19):** §4 of the design lists each export with the file it was read in; the existing `notes-app` and the absence of any `AdminShell` consumer were found by listing `examples/` and export maps, not assumed. Each sheet starts with inventory commands and expected results.
- **Each step green alone (5, 25):** steps are commit-sized; every new `exports` entry is created in the commit that adds its source; G sheets move code first, re-point consumers second, delete glue third.
- **Tests that fail on the named risk (6, 13, 21):** each sheet's test table has a "must fail when" column; security gates get deny tests first and a manual mutation check.
- **Behavioural port compatibility (12):** N1 tabulates positional `update(id, patch)` vs `{ deps, input }` with `expectedVersion`; N3 fixes the proxy's header, body and cancellation contract; D0 fixes the sender check.
- **Streaming and transport (14, 18):** the proxy contract separates commitment, production and cancellation; the browser never holds the daemon token.
- **Concurrency (16):** one conflict key (the entry version) for human and assistant writers; tested with a stale client.
- **Owner constraints as acceptance criteria (8, 15):** `DESIGN.md` §7; limits are checked inside each new file; the one existing breach (`registerNotesApp`) is fixed in N0.
- **Generalising types (20):** the site-shaped search contract is not "quickly generalised" inside a sheet.
- **Deletion ledger (23):** every G sheet reports the glue it removed.

## 8. Not verified

See `DESIGN.md` §9. In addition: sheet estimates are not measured; lane file lists (`sites/*.tsv`) were not
read; no sheet was dry-run.

## Revision 2 - judge response

Each finding was checked at merge-a before deciding. J = Jini `packages/…` or `examples/…`, T = Tovu.

| # | Sev. | Verdict | What changed (file) | Evidence |
|---|---|---|---|---|
| 1 | Blocker | ACCEPT | G2 builds nothing; it consumes lane S's adapter. G15's owner is lane S3 (`sheets/G2-…` block, §0 gap table) | T `features/entries/repo.ts:51,270`; `plan/lanes-s-u-2026-11-16` `S/S2-entries-content-types-sql.md` |
| 2 | Blocker | ACCEPT | Admin mounted at `/admin/`; unmatched requests handled by an adapter hook added in N0; existing HTML routes characterized (`N0`, `N2` blocks) | J `core/src/contracts/server.ts:96`; J `examples/notes-app/src/app.ts:58` |
| 3 | Blocker | ACCEPT | Transport takes a required `resolveRunInput` port; request tested against the real daemon parser (`G7`, `N4` blocks) | J `daemon/src/http/runs.ts:44,119` |
| 4 | Blocker | ACCEPT | Move + exports + callers + tests + delete in one commit; nothing left for a coordinator (`COMMON` rule 3; `G6`, `G7`, `G1` blocks) | old `G6:46-50`, `G7:58-63` |
| 5 | Blocker | ACCEPT | Bundled CJS preload with `electron` external; emitted file tested in a sandboxed window; dependency question is OD-N12 (`D0`, `D1` blocks) | J `examples/reference-desktop/src/preload.cts:1` |
| 6 | Major | ACCEPT | `persistedOnly` fields in new sheet GA; `version` is never a creation input (`GA`, `N1`, `G5` blocks) | J `admin/src/react/entities/rules.ts:103` |
| 7 | Major | ACCEPT | Typed mutation-failure seam with retained draft and Reload (`GA` item 2; `N2` block) | J `admin/src/react/entities/use-entity-edit.ts:113` |
| 8 | Major | ACCEPT | `refreshToken` seam; `useInvalidate` removed; N5 asserts an automatic update (`GA` item 3; `N4`, `N5` blocks) | J `admin/src/react/entities/use-entity-read.ts:7-21` |
| 9 | Major | ACCEPT | Agent inventory route, initial selection and a selectable scripted agent are bound explicitly (`N4` block) | J `chat/src/react/features/chat-pane/components/ChatPane.tsx:189,824` |
| 10 | Major | ACCEPT | Three lifecycle states; unpublish ends in `unpublished`; slug read-only after create (`N1` block) | J `cms/src/entries/types.ts:16` |
| 11 | Major | ACCEPT | New sheet G19 adds `body` to the update tool; N3 waits for it (`G19`, `N3` block) | J `cms/src/entries/tool-registrations.ts` (update handler) |
| 12 | Major | ACCEPT | No `limit` argument; the 200-row claim is removed; `search` contract lands in GA before its consumers; a real bound is G20 (`N1`, `G5` blocks) | J `cms/src/entries/list.ts:42-45` |
| 13 | Major | ACCEPT | Cursor and memory-rollback steps removed; recorded as G20 for S2's owner (`G2` block) | J `cms/src/entries/repo.memory.ts:67` |
| 14 | Major | ACCEPT | Wire protocol carries filter and sort; patch is `{ set, clear }`; conformance through the HTTP round trip (`G6` block) | J `admin/src/react/entities/use-entity-edit.ts:54-58` |
| 15 | Major | ACCEPT, **partly fixed** | Security downgrade removed; N3 blocked until the callback credential is designed (open item 2) | judge's citations; not re-read in this revision |
| 16 | Major | ACCEPT | Invented denial/conflict expectations deleted; today's outcome is characterized; friendlier conflict is G21 (`N3` block) | judge's citations (`registration-kit.ts:539`), confirmed for tool-call-fixes at `core/src/registration-kit.ts` |
| 17 | Major | ACCEPT | Transitive provider inventory command and per-provider tests; chat i18n bound; hooks injected (`N2`, `N4` blocks; `COMMON` rule 8) | J `ui/src/react/components/CustomSelect.tsx:14,532` |
| 18 | Major | ACCEPT | Every shell, stub and slice `index.ts` step removed; `COMMON` rule 6 and a STOP command (`G1`, `G4`, `G6`, `G7`, `N2`, `D0` blocks) | old sheet lines cited by the judge |
| 19 | Major | ACCEPT, **partly fixed** | Option C recorded as the approved exception; STOP list complete with commands; cognitive complexity and error rules added (`COMMON`). G16 is now a decision **before** G6 (OD-N10), still open | J `admin/src/core/ports/entities.ts` |
| 20 | Major | ACCEPT, **partly fixed** | `api:check` / `check:cross-package` removed (not root scripts); real link procedure; moved tests rewritten for the package runner. The example size check is still a manual count (open item 4) | J `package.json:12,22,25,26`; T `package.json:102` |
| 21 | Major | ACCEPT | Adapter calls core's route table; only Node conversion and lifecycle move (`G1` block) | J `core/src/contracts/server/route-table.ts:32,74` |
| 22 | Minor | ACCEPT | Cookie and precedence characterized, not "fixed"; health-boot path and the two-note count corrected (`N0`, `G1`, `N5` blocks) | J `examples/notes-app/src/node-server.ts:96-97`; J `scripts/health-boot.ts` |
| 23 | Minor | ACCEPT | G8 withdrawn (`G8` block) | J `mcp/package.json` `./bin` |
| 24 | Major | ACCEPT | `shutdown({}, options)`; handle kept on readiness failure; three cleanup tests (`D0`, `D1` blocks) | J `desktop-host/src/sidecar.ts` |
| 25 | Major | ACCEPT, **partly fixed** | Wrong claim removed; D2 blocked on new OD-N11 (`D2` block) | J `desktop-host/src/node-toolchain/index.ts:55` |
| 26 | Major | ACCEPT | Packed proof builds and drives the browser app outside the workspace (`N5` block) | J `examples/notes-app/scripts/smoke.ts:3,56` |

## Revision 2 - still open (PARTIAL)

1. **In-place rewrite of step text.** 15 sheets carry an authoritative corrections block above older step text
   (`N0, N1, N2, N3, N4, N5, G1, G2, G4, G5, G6, G7, G8, D0, D1, D2`); the steps below the block were not rewritten.
   Until they are, a reviewer should read block-then-steps together before dispatch. `DESIGN.md` §4 to §6 were not
   rewritten either: §0 of this file overrides them where they differ.
2. **Finding 15: MCP callback credential (G22).** Not designed. Needs a read of `daemon/src/agent-executor/contracts.ts`
   (credential resolver) and `mcp-bridge.ts`, then a contract: who issues the run-scoped credential, how the spawned
   MCP server receives it, how NOTES' daemon validates it, and a real-callback test. **N3 (and so N4, N5) must not be dispatched before this.**
3. **Finding 25 / OD-N11 and finding 5 / OD-N12.** Owner decisions; D2 and D0 wait.
4. **Finding 20, example limits.** No command enforces the 50-line / complexity-10 limits under `examples/`; COMMON asks for a manual count.
5. **Finding 19, G16 / OD-N10.** Must be decided before G6; the adapter sheets assume today's positional `update(id, patch)` until then.
6. **Reuse claims.** Only the export-map facts the judge sampled (18 rows) and the ones this revision touched were
   re-checked at merge-a. The rest of `DESIGN.md` §4 was read at merge-b in revision 1 and was not re-run.
7. **Estimates** are by analogy, not measured; no sheet was dry-run.
