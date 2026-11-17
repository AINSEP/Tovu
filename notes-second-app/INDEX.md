# INDEX: notes second app (2026-11-17)

Status: **COMPLETE for the sheets listed in §2** (see the last section for anything marked PARTIAL).
Planning only: nothing was built, typechecked or run. Design and gap list: `DESIGN.md`. Shared rules: `sheets/COMMON.md`.
Jini was read at `integ/merge-b-2026-11-16@674a19ea` (cross-checked with merge-a `96aade8c` and
`refactor/terra` `02edbb68`); Tovu at `refactor/terra@80b00f5b`.

## 1. Answer in one screen

- **Where it lives:** Jini `examples/`: `notes-app` (exists, server), `notes-web` (new), `notes-desktop` (new). Not a separate repo yet (OD-N1).
- **Feature set v1:** notes list/create/edit/publish/unpublish (no delete: the entry services have none), text search, an assistant docked in the admin shell that edits notes through the 5 existing entry tools, optional desktop shell. One local owner, no login.
- **Gaps found:** 17 (`DESIGN.md` §5). 11 get a sheet here; G9 and G10 belong to existing xpkg lanes; G3(c), G15, G16 need an owner decision or a design first.
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
| `D1-notes-desktop.md` | `examples/notes-desktop`: Electron shell around notes-app | `examples/notes-desktop` | D0, N5 | 120k |
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
