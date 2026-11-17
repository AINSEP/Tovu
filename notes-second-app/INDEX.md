# INDEX: notes second app (2026-11-17)

Status: **revision 3** (2026-11-16): the Opus review is fully applied (table "Revision 3 - Opus review response" at the
end). Revision 2 answered `CODEX-JUDGE.md` (26 accepted, 0 rebutted). What is still open is numbered in
"Revision 2 - still open" at the end of this file; **do not dispatch a sheet that list names**.
Planning only: nothing was built, typechecked or run. Design and gap list: `DESIGN.md`. Shared rules: `sheets/COMMON.md`.
Revision 3 was checked read-only against `integ/merge-final-2026-11-16` (Jini `65d73b0d`); revision 2 against
`integ/merge-a-2026-11-16` (Jini `dde69a6d`, Tovu `e801e9ae`). Every sheet starts with its inventory commands and
COMMON's base rule.

**How to read a sheet now:** precedence is COMMON > the sheet's revision-3 block > its revision-2 block > its step text
(COMMON "Revision 3"). A step a block contradicts is void, not a STOP. Rewritten in place in revision 3 (block and steps
agree): N0, N2, N5, G1, G7, G19, D1; D0 is a pointer table. The others still carry older step text under their blocks.

## 00. Coordinator decisions (revision 3, 2026-11-16; recorded identically in the desktop plan's INDEX section 0)

1. **One owner per shared surface.** The desktop-extraction plan owns `desktop-host` `./bridge` (its D0d), the IPC kit at `./electron/ipc` + `./electron/ipc/preload` (its D1a; `./electron/*` is desktop-host's existing naming; this plan's `./ipc` is withdrawn) and every change to `createNodeSidecarLauncher` (its D3a/D3c1).
2. This plan **consumes** them: sheet D0 is withdrawn (pointer table in `sheets/D0-*`), D1 lists desktop D0d + D1a as prerequisites. `examples/notes-desktop` is owned by this plan only (desktop D2 withdrawn); desktop D3c1 may edit only its launcher binding line(s).
3. `@jini-ai/node-adapters` is created only by xpkg N1. **OD-3 DECIDED (owner, 2026-11-16): fs/lock/process bindings only.** No sheet here needs it now (D1's node-adapters STOP deleted).
4. **G1 reuses `@jini-ai/http-kit/node-bridge`** (`createNodeDispatcher` → `{ server, handle }`, `handle({ incoming, out }, { next })`; `packages/http-kit/src/node-bridge.ts:1-14,331`) instead of new code. Nothing beyond fs/lock/process goes into node-adapters. OD-N2 is therefore **moot**, not "decided: node-adapters".
5. **G19 is on HOLD as an OWNER DECISION (OD-N13).** Letting the agent change note bodies reverses a deliberate design (`packages/cms/src/entries/agent-tools.ts:35-41`: the update schema omits `bodyJson` on purpose; body edits go through `widgets/embed-service.ts`'s guardrail) and changes Tovu's assistant too (it registers the same tools). The field is **`bodyJson`** (TipTap JSON, `unknown | null`; clear = `null`), its schema is in `agent-tools.ts`, not `tool-registrations.ts`. N3/N5 must not depend on body edits: the assistant round trip changes a note's **title**.

## 0. Changes to the sheet list (revisions 2 and 3)

| Change | Sheet | Why |
|---|---|---|
| New, runs before N1 / N2 | `GA-admin-entity-seams.md` (150k) | create vs persisted fields, mutation-failure seam, refresh seam, `search` in the list query (judge 6, 7, 8, 12) |
| New in rev 2; **on HOLD in rev 3** (owner decision OD-N13) | `G19-entry-tool-body.md` (70k if approved) | agent body edits reverse a deliberate absence (`agent-tools.ts:35-41`); nothing waits for it |
| Withdrawn | `G8-mcp-bin.md` | `@jini-ai/mcp` already exports `./bin` (judge 23) |
| Withdrawn (rev 3) | `D0-desktop-host-ipc-bridge.md` | the desktop-extraction plan owns `./bridge` (D0d), `./electron/ipc` (D1a) and the launcher (D3a/D3c1) |
| Rescoped to "consume lane S's adapter" (about 50k) | `G2-entries-sql.md` | lane S sheet S2 already owns `cms/entries/sql` (judge 1, 13) |
| Rewritten (rev 3): adopt `@jini-ai/http-kit/node-bridge`, delete the example adapter (50k) | `G1-node-server.md` | the bridge already exists (judge 21; Opus review) |
| Blocked | `N3-assistant-server.md` (open item 2, G22), `D2-desktop-packaging.md` (OD-N11) | judge 15, 25 |

Order: `N0 → GA → N1 → { N2 ‖ N3 }`, then `G7 → N4 → N5`, then wave C `{ G1 ‖ G2 } and G6 → G5 → G4`
(G1 needs N2; G2 needs lane S2), then `D1 → D2` (D1 needs desktop D0d + D1a). G19 runs only if OD-N13 is decided yes.
Estimate: **about 1.48M Sonnet for 15 runs** (sum of the §2 rows; + 70k for G19 if approved), plus one Opus design
pass of about 60k for open item 2. Revision 2 said 1.75M for 17; revision 1 said 1.6M for 16.

Gap owners (the gap list stays complete; ids continue `DESIGN.md` §5):

| Gap | Owner | State |
|---|---|---|
| G1 `node:http` serving | `@jini-ai/http-kit/node-bridge` (exists); `G1-node-server.md` adopts it | sheeted (examples only) |
| G2 SQL entry repository | lane S, sheet S2 (`plan/lanes-s-u-2026-11-16`) | consume, do not build |
| G8 MCP bin path | none | closed: not a gap |
| G11 IPC kit, G12 renderer-safe `./bridge`, G13 launcher ready line | desktop-extraction plan D1a, D0d, D3a/D3c1 | consumed by notes D1 |
| G15 durable identity repository | lane S, sheet S3 (`S/S3-identity-sql.md`, `user-management/server/sql`) | existing owner; no new design asked |
| G16 entity port concurrency / object arguments | owner decision OD-N10, **before** G6 (new adapters would freeze the positional form) | open |
| G19 agent may change an entry's `bodyJson` | owner decision OD-N13; `G19-entry-tool-body.md` | **on hold** |
| G20 page API and a real read bound for `listEntries`; memory-repo transaction semantics | lane S, S2's owner | not sheeted here |
| G21 a version conflict from an entry tool reaches the model as an input error, not an internal error | cms entry tools owner | not sheeted; N3 characterizes today's answer |
| G22 MCP callback credential for a host-assembled daemon | this plan, open item 2 | design missing |
| Node `fs` / lock / process bindings | `@jini-ai/node-adapters`, created only by xpkg N1 (OD-3: fs/lock/process only) | no sheet here needs it now |

## 1. Answer in one screen

- **Where it lives:** Jini `examples/`: `notes-app` (exists, server), `notes-web` (new), `notes-desktop` (new). Not a separate repo yet (OD-N1).
- **Feature set v1:** notes list/create/edit/publish/unpublish (no delete: the entry services have none), text search, an assistant docked in the admin shell that edits notes (title, fields, publish state) through the 5 existing entry tools, optional desktop shell. One local owner, no login.
- **Gaps found:** 22 (`DESIGN.md` §5 plus G19-G22 above). Owners in the table above; the desktop gaps G11-G13 are the desktop-extraction plan's; G9 (Express-bound daemon preset) and G10 (package closure) belong to existing xpkg lanes; G3(c), G15, G16, G19 need an owner decision or a design first.
- **How:** Phase A builds the app on today's exports with app-owned glue in `src/gaps/*` under a line budget; Phase B moves each glue file into its Jini owner (or adopts the existing one) and deletes it; Phase D adds the desktop shell on the desktop plan's surfaces.

## 2. Sheets (each ONE Sonnet run)

| Sheet | What | Repo files | Needs | Est. |
|---|---|---|---|---|
| `N0-server-baseline.md` | origin guard, `onUnmatched` hook, split >50-line function, gap ledger | `examples/notes-app` | none | 60k |
| `GA-admin-entity-seams.md` | create vs persisted fields, `describeFailure` seam, `refreshToken`, list `search` | `packages/admin` | xpkg R1c/R2 site check (§4) | 150k |
| `N1-notes-entity-api.md` | `AdminEntityPort` for notes, JSON entity routes, search, stale-write 409 | `examples/notes-app` | N0, GA | 90k |
| `N2-web-admin.md` | `notes-web`: `AdminShell` + entity panel + kit binding + search panel; `serveAdminBundle` at `/admin/` | `examples/notes-web`, `examples/notes-app` (`admin-bundle.ts`, one argv option) | N1, GA | 150k |
| `N3-assistant-server.md` | daemon preset + entry tools + MCP bin + same-origin proxy | `examples/notes-app` | N1; **G22 designed** (open item 2) | 120k |
| `G7-chat-daemon-transport.md` | move reference-web's daemon chat transport into `@jini-ai/chat` (own `package.json` commit, COMMON rule 3) | `packages/chat`, `examples/reference-web` | no open desktop D5a/D5b or C-CHAT-DEPS run on `packages/chat` (§4) | 100k |
| `N4-chat-ui.md` | `ChatPane` in the shell's assistant slot | `examples/notes-web` | N2, N3, G7 | 90k |
| `N5-web-proof.md` | browser e2e (assistant round trip changes a title), install-closure baseline, packed-tarball browser boot | examples | N0–N4 | 85k |
| `G1-node-server.md` | notes-app adopts `@jini-ai/http-kit/node-bridge`; example adapter deleted | `examples/notes-app` (+ one core comment) | N0, N2 | 50k |
| `G2-entries-sql.md` | consume lane S2's `cms/entries/sql` in notes-app | `examples/notes-app` | lane S2 landed; N1 | 50k |
| `G6-entity-adapters.md` | admin entities: http + memory adapters, conformance, `Server` registrar | `packages/admin`, examples | N2; OD-N10; R1c/R2 (§4) | 130k |
| `G5-field-renderer-search.md` | `renderField` port + list search box | `packages/admin`, `examples/notes-web` | G6 (same folder, serial) | 110k |
| `G4-admin-kit-slices.md` | required core kit + optional feature kits | `packages/admin`, examples, Tovu binding | R1c, R2a, R2b landed; OD-N8 | 90k |
| `D1-notes-desktop.md` | `examples/notes-desktop`: Electron shell around notes-app on desktop-host's `./bridge` + `./electron/ipc`; moves the Electron binders into desktop-host (G18) | `examples/notes-desktop`, one file into `packages/desktop-host` | desktop D0d + D1a, N5, OD-N9 | 120k |
| `D2-desktop-packaging.md` | packaging recipe/template (owned here) + packaged smoke | `packages/devops` docs/template, `examples/notes-desktop` | D1; OD-N11 | 80k |
| **Total** | **15 runs** (G19 held, G8 and D0 withdrawn) | | | **~1.48M Sonnet** |
| *held* `G19-entry-tool-body.md` | `bodyJson` on the update tool | `packages/cms` | OD-N13 = yes | *70k* |

Plus one batched review (Opus, ~40k) after each wave in §3.

## 3. Order: web first, desktop second

| Wave | Runs (parallel inside a wave unless an arrow says otherwise) | Gate before the next wave |
|---|---|---|
| A (now) | N0 -> GA -> N1 -> { N2 ‖ N3 } (N3 only after G22 is designed) | example gates + admin package gates; review |
| B | G7 -> N4 -> N5 | example gates + chat package tests; browser look at the app (Chrome): list, edit, conflict, search, assistant; review |
| C (gap closure) | { G1 ‖ G2 } and G6 -> G5 -> G4 | Jini repo gates; Tovu typecheck linked to the wave's Jini SHA; **gap lines in both `GAPS.json` go down, never up**; N5's e2e re-run unchanged; review |
| D (desktop) | D1 -> D2 | desktop gates; packaged app launches and restarts with data intact; review |
| held | G19 | only after OD-N13 = yes; then before nothing (no sheet depends on it) |

Wave C may start before wave B finishes for G1 (after N2) and G2 (they do not touch chat or notes-web's assistant).
Every G sheet ends by re-running N5's e2e (once N5 exists) with no edit to the e2e file: that is the
characterization test for the glue it deletes.

## 4. Prerequisites and collisions, including xpkg lanes and the desktop plan

| Prerequisite | Why | Blocks |
|---|---|---|
| The integration base `integ/merge-final-2026-11-16` (else merge-b; COMMON Setup) | every cited path was checked there | all |
| xpkg wave 0 `G-STALE-DEPS` | it edits 14 `package.json` files; G sheets add `exports` entries to `chat`, `admin` | G7, GA, G6 (their `package.json` edits land in the sheet's own commit, COMMON rule 3; wait until G-STALE-DEPS has merged) |
| xpkg **R1c, R2a, R2b** (admin kit call sites, forms catalog, embed comments) | same package, and R1c edits kit call sites; G4 changes `react/kit.tsx` | G4 hard; GA/G5/G6 soft (check `sites/R1.sites.tsv`, `sites/R2.sites.tsv` for `react/entities/**` and `core/ports/entities.ts` at dispatch) |
| **C-CHAT-DEPS** (R4, includes chat kit C9b) | 18 import sites in `packages/chat`; when it lands the host must bind a chat kit | G7 (overlap check at dispatch: G7 adds a new folder + one `exports` line), N4 (handles both states by its preflight) |
| desktop-extraction **D0d + D1a** | `desktop-host` `./bridge`, `./electron/ipc`, `./electron/ipc/preload` | D1 |
| daemon **R7** + preset **R13** | until then the daemon is Express-bound (G9): the app needs `express` installed and the N3 proxy | follow-up N6 only (§6) |
| lane **S2** | owns `cms/entries/sql` | G2 |
| Owner decisions OD-N8, OD-N9, OD-N10, OD-N11, OD-N13 | contract shape, placement, runtime, agent capability | G4, D1, G6, D2, G19 respectively |

**Collisions: one run at a time on each file below** (a sheet STOPs (X4) if the other run has an open branch on it at dispatch).

| File or folder | This plan | Other plan or lane |
|---|---|---|
| `packages/chat/package.json` | G7 | desktop D5a, D5b; xpkg C-CHAT-DEPS |
| `packages/admin/**` (`react/entities`, `core/ports/entities.ts`, `react/kit.tsx`, `package.json`) | GA, G6, G5, G4 | xpkg R1c, R2a, R2b |
| `packages/devops/package.json` | D2 (packaging recipe) | desktop D1c2 (`update-manifest-merge`) |
| `packages/desktop-host/**` (D1 step 1 moves the Electron binders, G18, and may add an export key) | D1 | desktop D0d, D1a, D3a, D3c1, D3d, D1c1, D1c2 (desktop INDEX section 6: landing order D0d, D1a, D3d, D1c1, D1c2, D3c1); D1 lands after D1a and before any later desktop run on that package |
| `examples/notes-desktop/src/main.ts` | D1 (owner) | desktop D3c1 (launcher binding line(s) only, after D1) |
| `packages/cms/src/entries/{agent-tools,tool-registrations}.ts` | G19 (held) | lane S2 (storage only; confirm at dispatch) |

Not prerequisites: R6–R13 other than above, G-TESTS, C12-OBS, the size lanes. N0, N1, N2 touch no file any lane touches.

## 5. Owner decisions

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| OD-N1 | Jini `examples/` or a separate repo? | `examples/` now; N5's packed-tarball boot proves it runs outside the workspace; move to its own repo after the first publish that contains the wave-C exports | nothing (default applied) |
| OD-N2 | Home of the `node:http` `Server` adapter | **Moot (rev 3):** `@jini-ai/http-kit/node-bridge` already exists; G1 adopts it | nothing |
| OD-N3 | May `@jini-ai/cms` ship `./entries/sql`? | Superseded: lane S2 ships it | G2 (via S2) |
| OD-N4 | Sign-in in v1 | Single local owner + Host/Origin guard; real login waits for a durable identity repo (G15) | nothing |
| OD-N5 | Search | v1 = text query on the entity list (GA + G5). Generalising `@jini-ai/search` away from `siteId`/`url` and shipping an in-process provider is its own design | G3(c) |
| OD-N6 | Run wave A before the xpkg lanes land? | Yes for N0, N1, N2 (examples only); GA waits for the R1c/R2 site check | timing only |
| OD-N7 | Which agent does the assistant use? | Whatever CLI the daemon detects; tests and the demo use the scripted agent; BYOK is out of scope | nothing |
| OD-N8 | `AdminKit` split | Required core (what shell + entities use) + optional feature kits (media, html editor, lightbox…); no packaged default binding yet (each host binds; examples show how) | G4 |
| OD-N9 | Desktop server placement | Sidecar under Node, not inside Electron main | D1 |
| OD-N10 | Should `AdminEntityPort.update` gain `expectedVersion` and object arguments (G16)? | Decide **before** G6, so two new adapters do not freeze the positional form | G6 |
| OD-N11 | Which Node runs the packaged sidecar (same question as the desktop plan's **OD-6**, moved here)? | Electron's own (through `node-toolchain` shims; SQLite built for Electron's ABI), because that is what the package provides today | D2 |
| OD-N12 | May the desktop example depend on esbuild for the sandboxed preload? | **Moot (rev 3):** esbuild is already declared by workspace packages (`agent-plugins`, `analytics`, `cookie-consent`, `provider-plugins`); D1 declares it as the example's devDependency, as desktop D1a does | nothing |
| OD-N13 | May `collections_entry_update` change an entry's `bodyJson` (agent body edits; also changes Tovu's assistant)? | Keep the deliberate absence (`cms/src/entries/agent-tools.ts:35-41`) unless a product need appears; v1 edits titles only | G19 only |

Executors gate on decisions with `grep -nE "^\| OD-N<n> .*\| DECIDED: " notes-second-app/INDEX.md`
(G19's gate is `DECIDED: yes`). State of each:

| # | State |
|---|---|
| OD-N1 | DECIDED: examples/ (default applied) |
| OD-N2 | MOOT: `@jini-ai/http-kit/node-bridge` exists (rev 3; the rev-2 "DECIDED: node-adapters" is withdrawn) |
| OD-N3 | DECIDED: superseded. Lane S sheet S2 ships `cms/entries/sql`; NOTES consumes it |
| OD-N4 | OPEN (no sheet waits) |
| OD-N5 | OPEN (no sheet waits) |
| OD-N6 | OPEN (timing only) |
| OD-N7 | OPEN (no sheet waits) |
| OD-N8 | OPEN: blocks G4 |
| OD-N9 | OPEN: blocks D1 |
| OD-N10 | OPEN: blocks **G6** |
| OD-N11 | OPEN: blocks D2 (= desktop plan OD-6) |
| OD-N12 | MOOT: esbuild already declared in the workspace; D0 withdrawn |
| OD-N13 | OPEN: blocks G19 only (held) |


## 6. After these sheets (not sheeted)

- **N6 single listener** (after R7/R13): mount the daemon's routes on the app's `Server`, delete `src/gaps/daemon-proxy.ts` and the `express` dependency. Re-run `scripts/closure.mjs`.
- **Closure ratchet:** each xpkg lane that removes a package edge re-runs `examples/notes-app/scripts/closure.mjs` and updates the README table; the count must not rise.
- **G3(c)** site-shaped search contract, **G15** durable identity repos, **G16** entity port concurrency: owner decisions, then designs.
- Tovu adopting `AdminShell` and the daemon transport is Tovu work, outside this plan.

## 7. How this plan answers the 26 lessons (the ones that apply)

- **Inventory before reuse (2, 9, 19):** §4 of the design lists each export with the file it was read in; the existing `notes-app` and the absence of any `AdminShell` consumer were found by listing `examples/` and export maps, not assumed. Each sheet starts with inventory commands and expected results.
- **Each step green alone (5, 25):** steps are commit-sized; every new `exports` entry is created in the commit that adds its source; G sheets move code first, re-point consumers second, delete glue third.
- **Tests that fail on the named risk (6, 13, 21):** each sheet's test table has a "must fail when" column; security gates get deny tests first and a manual mutation check.
- **Behavioural port compatibility (12):** N1 tabulates positional `update(id, patch)` vs `{ deps, input }` with `expectedVersion`; N3 fixes the proxy's header, body and cancellation contract; the sender check is the desktop plan's D1a, which D1 consumes.
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

1. **In-place rewrite of step text.** Revision 3 rewrote N0, N2, N5, G1, G7, G19 and D1 in place (D0 is a pointer
   table). N1, N3, N4, G2, G4, G5, G6, D2 still carry a block above older step text; COMMON's revision-3 precedence
   makes a contradicted step void (not a STOP), so they can run, but a reviewer should read block-then-steps together
   before dispatch. `DESIGN.md` §4 to §6 carry revision-3 markers on the changed rows only; INDEX section 00 overrides them.
2. **Finding 15: MCP callback credential (G22).** Not designed. Needs a read of `daemon/src/agent-executor/contracts.ts`
   (credential resolver) and `mcp-bridge.ts`, then a contract: who issues the run-scoped credential, how the spawned
   MCP server receives it, how NOTES' daemon validates it, and a real-callback test. **N3 (and so N4, N5) must not be dispatched before this.**
3. **Finding 25 / OD-N11.** Owner decision (= desktop OD-6); D2 waits. OD-N12 is moot (revision 3).
4. **Finding 20, example limits.** No command enforces the 50-line / complexity-10 limits under `examples/`; COMMON asks for a manual count.
5. **Finding 19, G16 / OD-N10.** Must be decided before G6; the adapter sheets assume today's positional `update(id, patch)` until then.
6. **Reuse claims.** Only the export-map facts the judge sampled (18 rows) and the ones this revision touched were
   re-checked at merge-a. The rest of `DESIGN.md` §4 was read at merge-b in revision 1 and was not re-run.
7. **Estimates** are by analogy, not measured; no sheet was dry-run.

## Revision 3 - Opus review response
Review: `opus-review/notes.md`. Code re-checked read-only on `integ/merge-final-2026-11-16` (Jini `65d73b0d`). **Complete**: rows 1-11 in the first pass (`5d30af00f`), rows 12-21 in the second.

| Item | ACCEPT/REBUT | Change | Evidence |
|---|---|---|---|
| Blocker: desktop wave duplicates desktop-extraction | ACCEPT | section 00 decisions 1-2; `sheets/D0` withdrawn (pointer table); `sheets/D1` corrections + Design + Steps rewritten to consume desktop D0d/D1a, today's launcher with HTTP probe | desktop-host exports on merge-final have neither `./bridge` nor any ipc entry; `desktop-host/src/sidecar.ts:52` `waitUntilReady({ probe, isReady })` |
| Judge 11: G19 widens a deliberate absence; wrong field | ACCEPT | section 00 decision 5 (HOLD, OD-N13, `bodyJson`); sheet text not yet rewritten (remaining 2) | `cms/src/entries/agent-tools.ts:35-41`; `tool-registrations.ts:62,100,117,171,177` |
| Judge 21: G1 duplicates `http-kit/node-bridge` | ACCEPT | section 00 decision 4; sheet not yet rewritten (remaining 1) | `http-kit/src/node-bridge.ts:1-14,331`; `http-kit/package.json` `./node-bridge` |
| Major: node-adapters scope creep (OD-N2) | ACCEPT | COMMON rule 5: fs/lock/process only, N1 only, no HTTP adapter; OD-N2 moot | xpkg `N1-node-adapters.md` header |
| Major: notes D1 STOPs on node-adapters for no use | ACCEPT | D1 landed check replaced by the three desktop-host export keys | old D1:12-13 |
| Major: old step text contradicts blocks -> executors STOP | ACCEPT in part | COMMON: precedence COMMON > rev-3 block > rev-2 block > steps; a contradicted step is void, not a STOP; D0/D1 rewritten; N0/N2/G1/G19 in-place rewrite remaining | COMMON "Revision 2" para |
| Major: STOP commands with `\|` do nothing | ACCEPT | COMMON STOP table has no commands; block of X2-X11, G, L fenced | lesson 29 |
| Medium: hook STOP checks `.tsx` added lines only | ACCEPT | COMMON X7: whole `.ts`/`.tsx` files, multiline, + `scripts/check-hook-injection.mjs` | Jini `package.json:29` `check:hooks` |
| Judge 19/20: no command enforces 50 / complexity 10 (examples too) | ACCEPT | COMMON rule 4 + block L (ESLint limits as errors; created/moved pass outright, edited may not grow) | `scripts/check-size.mjs:15,39`; `sourceGlob` packages only (`:14`) |
| OD-N12 (esbuild) | ACCEPT (moot) | D0 pointer + D1: esbuild declared as the example's devDependency, as desktop D1a does | esbuild in `agent-plugins`, `analytics`, `cookie-consent`, `provider-plugins` `package.json` |
| D1 `--web` flag only a replaced N2 step adds | ACCEPT | D1: no `--web`; window loads `/admin/`; bundle argument = what N2 landed, else STOP | N2 corrections block (`/admin/` via `onUnmatched`) |
| G1 sheet still builds an adapter; owner line, re-export, precedence change | ACCEPT | `sheets/G1` rewritten in place: adopt `createNodeDispatcher`, delete `node-server.ts` + test, old adapter tests re-pointed at the bridge (a failing one = STOP for http-kit's owner). Deviation from the remaining-list wording: `/admin/` is routed **before** the dispatcher instead of through `handle(..., { next })`, because `next` also receives 405 and handler failures and would have to rebuild them | `http-kit/src/node-bridge.ts:17,331-345` |
| G19 sheet widens a deliberate absence; wrong field, file, clear value | ACCEPT | `sheets/G19` rewritten: HOLD gate on OD-N13, `bodyJson`, schema in `agent-tools.ts:128`, clear = `null`, the "would-run" sheet kept behind the gate | `agent-tools.ts:35-41`; `write-service.ts:399` |
| N3 depends on G19; landed check matches at base | ACCEPT | `sheets/N3` revision-3 block: G19 prerequisite and `rg -n "body"` check deleted; T1 adds a title update | `tool-registrations.ts:100,117,171` |
| N5 round trip changes a body; stale `--web`, health-boot path, "three notes" | ACCEPT | `sheets/N5` rewritten in place: scripted `retitle` prompt, list updates without a click, `/admin/`, root `scripts/health-boot.ts`, two notes, packed browser boot | `scripts/health-boot.ts`; N2 block |
| N0 stale T3, step 3 "Cookie fix", "no getSetCookie" | ACCEPT | `sheets/N0` rewritten in place: deleted (an existing test already pins two cookies); `onUnmatched` is step 3 / T3 | `notes-app/src/node-server.ts:96-97`; `node-server.test.ts:97` |
| N2 landed check names `onMutationFailure`; `--web` / "register last" | ACCEPT | `sheets/N2` rewritten in place: fenced checks `describeFailure` and `refreshToken` (both required); T5 + steps 6-7 = `serveAdminBundle` on `onUnmatched` under `/admin/`, `--admin-dir`; no slice `index.ts` | GA change 2; `core/src/contracts/server.ts:95-107` |
| G7 "`parseRunStart` or the route spec"; coordinator-only `package.json` | ACCEPT | `sheets/G7` rewritten in place: `runStartRoute` (`daemon/src/http/index.ts:70`, `runs.ts:215`), required `resolveRunInput`, one atomic move with its own `package.json` edit, D5a/D5b collision check | `parseRunCreate` not exported |
| INDEX sections 0-5 stale (G8 row, G1 http-kit, coordinator edits, D0, totals, waves, no collisions, OD-N2/N12) | ACCEPT | sections 0-5 rewritten: 15 runs / ~1.48M, G19 held, D0/G8 withdrawn, waves A-D, collision table (chat, admin, devops, desktop-host, notes-desktop, cms tools), OD-N2 and OD-N12 MOOT, OD-N13 added, OD-N11 = desktop OD-6 | desktop INDEX sections 0, 6, OD-6 |
| DESIGN.md:7 puts the `node:http` adapter in node-adapters | ACCEPT | line 7 corrected; revision-3 summary; G1, G7, G8, G11-G13 rows and rule 3 marked "rev 3" | xpkg `N1-node-adapters.md`; COMMON rule 5 |
| D2 lacks the ownership line | ACCEPT | `sheets/D2` revision-3 block: recipe + packaged proof owned here, desktop D2 withdrawn, OD-N11 = desktop OD-6, devops `package.json` collision with D1c2 | desktop `D2-notes-desktop.md` |
