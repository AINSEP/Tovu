# W1 sheets, group A (features 1-14 of PLAN.md's W1 Level 0 list) — 2026-11-16

Unattended planning run. Read at Tovu `b28d38c6` / Jini `b7666092` (both `refactor/terra`); plan base `origin/plan/terra-2026-11-15` @ `4717aa62`. Docs only; no source edits, no tests run. Sheet paths use the Mac clones (`TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra`, `JINI_CLONE=/Users/la/Programming/jini-terra-base`); the `*.gen.md` skeletons were produced here against `/home/user/{Tovu,Jini}` (same commits). Result: **PARTIAL** — 9 sheets written (7 ready to execute, 2 blocked), 1 re-kind note (Select), 2 features left (mail, contracts/headless).

| # | Feature | Kind (sheet) | Slices | Sheet tier | Untangle overlap | Blocked? | Est. executor tokens | Sheet |
|---|---|---|---|---|---|---|---|---|
| 1 | website/contracts/core/commands | REPOINT | 1 (2 rows, 16 edited files) | Sonnet | yes (C3: 10 rows on other import lines) -> after wave B | no | ~45k | `sheets/repoint-commands.md` |
| 2 | website/platform/observability | — | — | — | — | DONE in W0 (Tovu `54dac1ff3`); skipped | — | `sheets/repoint-observability.md` |
| 3 | website/server/error-mapping | DELETE (fold, moved body) | 1 | Sonnet | yes (C4:243 on respond.ts) -> after wave B | **BLOCKED: owner** (fold vs keep as Tovu's shared route helper; recommend keep/STAY) | ~30k | `sheets/delete-error-mapping.md` |
| 4 | website/features/site-guide | **DEDUPE** (re-kinded from DELETE; type-narrowing + repoint) | 1 (17 files) | Sonnet | yes (C10:152 on composition/site-guide.ts) -> after wave B | no | ~45k | `sheets/dedupe-site-guide.md` |
| 5 | website/features/plugins | DELETE (forwarder form, 6 files) | 1 (17 paths) | Sonnet | yes (C3t:35, C3t:288, C3:418, C4:262; other lines) -> after wave B | no | ~50k | `sheets/delete-plugins.md` |
| 6 | website/platform/headless-browser | — | — | — | — | DONE in W0 (Tovu `311d5d7ae`); skipped | — | `sheets/delete-headless-browser.md` |
| 7 | website/platform/db/postgres | DELETE (fold into its adapter) | 1 | Sonnet | none | no | ~25k | `sheets/delete-postgres.md` |
| 8 | admin/features/dashboard | UI (`@jini-ai/ui` `usePersistedDisclosure`) | 1 | Sonnet | yes, Jini side only (C1-plus:15, C9-ui:5 on ui/src/index.ts) -> after wave B | no | ~35k | `sheets/ui-dashboard.md` |
| 9 | website/platform/html | MOVE (`@jini-ai/cms/html/style-values`, new subpath) | 1 | Sonnet | yes (C8:146 on render.ts) -> after wave B | no | ~35k | `sheets/move-html.md` |
| 10 | website/features/workspace | MOVE-AFTER C3 (`@jini-ai/cms/workspace/sql`) | 1 | Sonnet + ~20k Opus to pin post-C3 types | no row; DEPENDS on C3 landing | **BLOCKED: precondition** (C3 `core/contracts/storage`), not owner | ~40k | `sheets/move-workspace.md` |
| 11 | website/platform/routing | — | — | — | — | DONE in W0 sheet (`delete-routing.md`); skipped | — | `sheets/delete-routing.md` |
| 12 | website/platform/mail | SPLIT + DELETE + DEDUPE (skeletons only) | 3 | Sonnet (likely Sonnet+review) | to check | **LEFT** (context budget) | — | `sheets/{split,delete,dedupe}-mail.gen.md` |
| 13 | website/contracts/headless | SPLIT + MOVE + DEDUPE (skeletons only) | 3 | Sonnet | to check | **LEFT** (context budget) | — | `sheets/{split,move,dedupe}-headless.gen.md` |
| 14 | admin/components/Select | **HARDEN** (re-kinded from DELETE) | 2 (Jini barrel export, Tovu delete+repoint) | **Opus** (raised from Sonnet) | none today; WidgetPickerDialog is in SCC S2 | no, but NOT FILLED (findings only) | ~70k | `sheets/harden-Select.md` |

Ready to execute after wave B merges: 1, 4, 5, 8, 9. Ready now (no overlap): 7. Executor total for ready sheets ≈ 265k Sonnet.

## Re-kinds (KIND-SUSPECT confirmed)
- site-guide DELETE -> DEDUPE: type-only file, not dead; 2 of 4 types are exact Jini twins (`GuideTopic`, `GuideFact`); the other 2 are Tovu's deliberately loose engine port (tests fake it with non-`GuideResult` returns, so Jini's `SiteGuide` type would break them: rule 20).
- Select DELETE -> HARDEN: Tovu keeps 8 helpers "until Jini exports them"; Jini has them unexported and with different shapes.
- error-mapping, plugins, postgres stay DELETE but only in the forms the W0 template fixes added (moved_bodies / forwarder); each KIND-SUSPECT was real code.

## Lessons for the filler/templates
1. `scripts/census.py` resolves its target path against the CWD: run it from the Tovu root, or it prints `0 hits` silently (seen on Select). Suggest `os.path.join(root, argv[2])`.
2. `make_sheet.baselines()` searches the repo-relative path, but `coverage-integrity-baseline.json` and `write-path-inventory.baseline.json` store app-relative `src/...` paths; the commands and workspace rows were found only by the path-literal pass. Search both spellings.
3. Many W1 files are now forwarders that only turn a positional `store` into `{ store }` (plugins): DELETE in forwarder form plus a call-shape fold in tests. A `folds` row type "positional -> object, count N" would make these mechanical.
4. Overlap with wave B is common (6 of 9): sheets guard overlapped files by exact text, not blob, and say "execute after wave B merge".
5. Kysely SQL adapters (workspace) cannot follow today's `cms/*/sql` pattern (it imports `@jini-ai/db/kernel`, rule 5); they wait for C3's `@jini-ai/core/contracts/storage`.
