# Move-to-Jini by KIND: plan (2026-11-15, planning only, nothing executed)

## Summary
1. 8 move kinds cover all 170 backlog features (1,296 files, 233.6k lines): REPOINT, DELETE, MOVE, DEDUPE, HARDEN, SPLIT, UI, SERVER. Each kind has one Sonnet template (T-*.md + COMMON.md). Work runs as 578 slices of 1 to 6 files each.
2. Who writes each feature's fill-in sheet: Sonnet for 96 features, Sonnet with an Opus review for 11, Opus for 63. Counted by slice: 383 Sonnet, 33 Sonnet + review, 152 Opus, 10 script. The Opus slices are mostly big MIXED splits and Express-bound files.
3. Planning tokens: about 5.1M Opus + 6.3M Sonnet, against the 9.35M-Opus per-feature baseline. That baseline assumed pilot-sized features (about 120 lines each; real features average 1,370), so the real saving is larger. Executing the moves is a separate cost: about 23M Sonnet (578 slices, not 170 one-shot recipes).
4. 40 features (17.6k lines) can start now. 78 have some files blocked. 52 are blocked outright: 24 by the cycle cuts C1–C5, 9 by the server port, and 25 by new dependencies. These overlap.
5. Three owner decisions would unblock the most: (a) Jini `*/react` code may import `@jini-ai/ui-kit/react` (option C), 25 features; (b) D2 means pure helpers may go in `@jini-ai/core` and I/O code may not, 41 features / 67 files; (c) policy for new third-party dependencies in Jini, including whether Jini gets a TipTap editor surface, 25 features of which about 10 just need a different target package.

## Files here
| File | What |
|---|---|
| `KINDS.md` | The 8 kinds: definition, signals the script can compute, what goes and what stays, files touched, risks, tier |
| `T-REPOINT.md` `T-DELETE.md` `T-MOVE.md` `T-DEDUPE.md` `T-HARDEN.md` `T-SPLIT.md` `T-UI.md` `T-SERVER.md` | One Sonnet recipe template per kind, with the fill-in sheet format, steps, STOP conditions and the Jini-then-Tovu commit pattern |
| `COMMON.md` | Rules pasted at the end of every assembled recipe (owner rules, STOP-on-mismatch, checks, git, report). Assemble with `cat T-<KIND>.md <sheet>.md COMMON.md` |
| `CLASSIFY.tsv` | One row per feature: kind, kind_mix (lines per kind), confidence, labels, Jini packages, blockers, hard_blocked, depends_on, level, slices, slice tiers, fill_in_cost, token estimates, drift since the survey, judged note |
| `CLASSIFY-files.tsv` | One row per file with the raw signals (the script's evidence) |
| `scripts/signals.py` → `scripts/classify.py` → `scripts/judge.py` | Reproduce: build `drift-num.tsv` from `git diff --numstat c369798de..HEAD -- apps` in the terra clone; run `signals.py <dir>`, `classify.py <dir> <OUT>`, `judge.py <OUT>`. Read-only. |

Sources: the d1 backlog (`/Users/la/Programming/tovu-terra-d1/development/refactor-patterns/move-to-jini/opus-backlog.{md,files.tsv}`; 170 feature lines; survey labels from Tovu c369798), dossier-v4 resolved imports, source text read from the terra clone at `d5f82b44f`, and Jini `package.json` dependencies at `1a73e68c3`.

## How a feature runs
1. A filler script (`scripts/make-sheet.py`, step W0.3) fills the mechanical fields of the sheet: blobs, census hits (`scripts/census.py`), `non_reexport_statements`, the baseline search (`rg -F <path>` over `*.json`/`*.mjs`/`*.cjs`/`*.yml`), the declaration list, Jini guards, the lines next to the exports, and whether a name already exists. It WRITES the sheet to `sheets/<kind>-<slug>.md` before any edit, so a discovery made while executing shows up as a change to a saved sheet (W0: the observability sheet was written after the edit).
2. The tier in `slice_tiers` decides who fills the judgment fields: `Sonnet` fills them (about 12k + 12 tokens per line); `Sonnet+review` has Sonnet fill them and Opus check the split and ports (about 8k + 4 tokens per line of Opus); `Opus` fills them (about 15k + 20 tokens per line).
3. Sonnet 5.5 high executes the assembled recipe from the SAVED sheet (`cat T-<KIND>.md sheets/<kind>-<slug>.md COMMON.md`), one slice per job: a Jini commit then a Tovu commit. An executor never edits before the sheet file exists. A STOP gives a clean SKIP. Within a feature, slices run in the order REPOINT, DELETE, HARDEN, MOVE, DEDUPE, UI, SPLIT, SERVER.
4. Verification happens in one batched cloud run per wave (single-runner rule). It covers the RED/GREEN checks for failing-test-first rows, the Jini gates (subpath isolation, hardwiring, complexity, size) and Tovu typecheck after linking the Tovu clone to `jini-terra-base` (D1 default: linked). UI slices also need a Chrome look.

## Order
**W0 — calibrate (before any fan-out).**
1. Run the pilot recipes E05, E02, E01 and E04 as written; E03 has already landed on the Tovu side as `9484d35f9`. They are the worked examples for SERVER-A, SPLIT, MOVE, UI and DEDUPE.
2. Run three new examples, one per untested template:
   - REPOINT: `website/platform/observability`.
   - DELETE: `website/platform/routing` and `website/platform/headless-browser`.
   - HARDEN: `website/contracts/core/tool-metadata` (9 lines) and `admin/lib/fetch-query`.
3. Have one Sonnet job build `make-sheet.py`, the mechanical sheet filler.
4. Measure tokens per slice against the model above and tighten the caps in `classify.py` (`LIMITS`). The pilot's open question decides the UI cap: if E04's 9 Tovu files land clean, keep 6 files per slice.
5. W0 result (2026-11-15): 3 of 4 REPOINT/DELETE/HARDEN rows were mis-kinded (DELETE headless-browser and routing held real code; HARDEN tool-metadata had no parity row). Templates were fixed (W0-kinds-report.md "Template fixes" 1–14); corrected sheets are `sheets/delete-headless-browser.md`, `sheets/delete-routing.md`, `sheets/dedupe-tool-metadata.md` (old ones kept as `*.skip.md`). REPOINT cost is counted in EDITED FILES (importers), not source lines: observability was 41 lines but 54 edited files plus the census and a baseline search, a full Sonnet job rather than "script". `W1-kind-check.tsv` flags the W1 rows whose kind is suspect; re-check those before filling their sheets.

**W1 — unblocked features, leaf-first by `level` (40 features).**
- Level 0 (22): commands, observability, error-mapping, site-guide, features/plugins, headless-browser, db/postgres, admin dashboard, platform/html, features/workspace, platform/routing, platform/mail, contracts/headless, admin Select, cli/commands, contracts/core/events, db/kernel, admin observability, entry-refs, email-templates, db/migration, plugin-runtime.
- Level 1 (3): web, skills, site-dir.
- Level 2 (3): runtime/services, object-storage, member-login.
- Level 3 (10): admin analytics, members, sites, users, publish-content, database, jini-admin, media-generation, admin media, admin consent.
- Then asset-transfer (level 5) and admin themes (level 6, Opus, 3.4k lines).
- About 0.35M Opus + 0.82M Sonnet for sheets, and about 2.5M Sonnet to execute.

**W2 — the unblocked slices of the 78 partly blocked features.** Every file without its own D2, new-dep, kit-inject or precondition flag (see `CLASSIFY-files.tsv`). A MOVE-AFTER file follows its precondition when that precondition is in the same feature. About 1.6M Opus + 2.8M Sonnet for sheets for the whole group; this wave takes about half of it.

**W3 — after the prerequisites (Opus, once each, d1 backlog cross-feature items).**
- Cycle cuts C1–C5, the 18 type-only edges, 3 admin edges and 2 Jini module cycles. These unblock the 24-feature SCC: project-keys, form-destinations, consent, api-connections, publish-trust, entries, settings, navigation, site-inspection, trash, publish-content, content-types, redirects, site-export, widgets, taxonomy, media, deployments, post, media-import, custom-credentials, source-control, site-backup, theme.
- The feature-level value cycles the script found, each handled as one batch, never feature by feature:
  - S1: admin-http, public-http, inbound/shared, runtime/boot, runtime/composition.
  - S2: admin WidgetPickerDialog, hooks, lib.
  - S3: custom-credentials, site-backup, source-control (= C4/C5).
  - S4: assistant, assistant/mcp-federation.
- Server port O1–O7 merged into Jini. This unblocks T-SERVER form B for 9 features (29k lines; admin-http alone has 130 files). Do 3 Opus form-B sheets first, then Sonnet + review per route group.
- Stretch: once each kind has 3 clean Opus sheets, move its remaining large SPLIT/SERVER slices to Sonnet + Opus review. That would bring Opus down to about 1.7M (Sonnet goes up about 3.3M).

**W4 — after the owner decisions below.** D2 rows, new-dep rows and kit-inject UI rows.

**Leave for last, or STAY:** composition wiring (`server/runtime/composition`, 24 MIXED files that are mostly binding), `admin/lib` (grab-bag: classify per file), and desktop (follow the desktop survey order; needs a packaged-desktop proof per batch).

## Blocked, and on what (`blockers` column; features can carry several)
| Blocker | Features | Notes |
|---|---|---|
| precondition (MOVE-AFTER) | 80 (271 files, 36.5k lines) | Another file or Jini surface must land first. Usually in the same feature (slice order handles it); otherwise named in the survey note. |
| D2 (target `core`) | 41 (67 files, 15.7k lines) | Owner decision (a) below |
| hardening first | 32 | Not a blocker, just the HARDEN template's Jini commit first |
| kit-inject (UI into a non-ui package) | 25 (70 files, 14.5k lines) | Owner decision (b) below |
| new-dep | 25 | About 10 can be fixed by picking a different target package with no decision: kysely → `db`/`cms`, parse5 → `platform/web`/`cms`, micromark → `ui`, zod → `agentic`/`protocol`, yauzl → `agent-plugins`. Truly new: tiptap family, js-yaml, cookie, commander, drizzle-orm, @cfworker/json-schema, html2canvas-pro, @ag-ui/encoder, lowlight. aws4fetch is vendor code and goes to its provider plugin. |
| cycle-cuts (24-feature SCC) | 24 | Opus prerequisite W3 |
| feature SCC S1–S4 | 13 | Batch together |
| server-port | 9 (144 files, 29k lines) | Design d2 must merge into Jini first |
| packaged-desktop proof | 8 | Desktop batches only |
| owner: hosted MCP | 1 (`external-mcp`) | Pilot rejection |

Confidence: 106 high, 48 medium, 16 low. Low means the dominant kind holds under 40% of the lines, the files changed a lot since the survey, or it is a large SPLIT/SERVER. The low rows have a `judged` note. 23 rows were judged by hand, and 2 script-tier features were raised to Sonnet: `contracts/core/commands` (gate baselines) and `platform/observability` (excluded shim).

## Token estimate vs the per-feature baseline
| | Opus | Sonnet |
|---|---|---|
| Baseline (per feature, from the pilot): 170 × 55k plan + 170 × 60k recipe | 9.35M (a floor, as it assumed about 120-line features) | about 10M (one recipe per feature, which would not fit real features) |
| This plan, sheets: script 10 slices, Sonnet 383, Sonnet+review 33, Opus 152 | 5.1M | 6.3M |
| This plan, execution (578 slices × (30k + 25 tokens/line)) | — | about 23M |
| One-off: this job + W0 calibration (3 new runs + make-sheet.py) | about 0.2M | about 0.3M |
| Stretch: large slices moved to Sonnet + review after W0/W3 examples | about 1.7M | about +3.3M |

By status: unblocked 40 features = 0.35M Opus + 0.82M Sonnet sheets; partly blocked 78 = 1.6M + 2.8M; blocked 52 = 3.1M + 2.7M. The per-line rates are estimates from the pilot (it spent about 270k Opus on 5 features, roughly half of that choosing and rejecting candidates). W0 replaces them with measured numbers.

## Owner decisions that unblock the most
1. **Option C exception for UI:** Jini `*/react` entry points may import `@jini-ai/ui-kit/react` (ui-kit already is the injected kit facade). Recommend YES. It unblocks 25 features / 70 UI files (18 features have nothing else blocking them, about 30k lines). Without it, every admin/chat/user-management UI move needs its own kit-props design from Opus.
2. **D2 = the 11-10 rule (a):** pure, side-effect-free helpers MAY live in `@jini-ai/core`; anything with I/O, state, timers or Node built-ins goes to the owning domain package or `platform`. Recommend confirming in those words. It unblocks 41 features / 67 files.
3. **New third-party dependencies in Jini:**
   - A new dependency is declared, never lazy-loaded, as an optional peer of its own subpath (the parse5 pattern), and the coordinator adds it to the lockfile. Recommend YES.
   - Separately, yes or no on a Jini editor surface (TipTap). It decides `admin/features/posts`, `admin/lib` and `admin/features/collections`, about 15k lines.
   - This unblocks 25 features (about 10 only need a different target package).

Also open, smaller: the framework-signature exemption for the args rule (Express handlers, React setters). It affects T-SERVER and T-UI; the interim rule is to keep the Tovu signature and convert only the moved Jini function.

## Risks
- Survey labels are from c369798. The terra clone has changed 4,357 app files since then; drift per feature is in `drift_since_survey`. Every sheet re-reads the code, and blob guards come from the current HEAD, never from the survey.
- The arg lanes are still committing in the Tovu clone. Shared composition files are guarded by exact text, so a conflict ends as a SKIP. Re-run `signals.py` before each wave; 3 backlog files have already gone from the terra clone.
- Kind detection limits: the express regex misses handlers that never import express; the UI flag counts a `.tsx` without JSX; `stay_imports` counts value imports only. A missed port is a STOP at execution, not a wrong commit.
- The Jini fixed changeset group means every `minor` bumps all `@jini-ai/*` at the single publish (D1). Tell the owner before the first wave lands.
