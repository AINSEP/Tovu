# apps/admin Coverage Triage — Task 4 of the 2026-08-15 worklist

**Producer:** TestRunner (read-only triage — no coverage runs, no test suites executed this session)
**Source data:** `ADS-memory/reports/2026-08-15-admin-coverage.md` (22-set table)
**Verified against:** HEAD `c80e4e2f` (confirmed via `git rev-parse HEAD` before starting; matches the
dispatch brief)
**Method:** read the source table, cross-checked every number cited below against the retained
`lcov.info` artifacts in `ADS-memory/.local-artifacts/coverage/<set>/` (still on disk, gitignored), and
read the actual source files for every directory recommended below. No number in this report is taken
from the prior table without independently re-deriving it from the lcov or the file listing.

## How to read this report

Per the dispatch constraints: there is no aggregate total anywhere below, `features/commerce` and
`features/deployment` are out of scope and not re-litigated, and per-file numbers are weighted over
run-level percentages since a directory-scoped run still instruments the whole tree.

---

## Ranked recommendations

### 1. `features/settings/hooks/` composio + external-MCP + connectors cluster — PRIMARY, same shape as the already-assigned `workspace/hooks` gap

**Numbers** (own-directory scoped run, SHA `3a83cf99`, from `set16-settings-seo-r3/lcov.info`):

| File | Funcs | Lines | Branch | Has test file? |
|---|---|---|---|---|
| `hooks/use-composio-config.hooks.ts` | 0/10 | 0/25 | 0/10 | **No** |
| `hooks/use-external-mcp.hooks.ts` | 0/9 | 1/37 | 0/20 | **No** |
| `hooks/use-settings-ui.hooks.ts` | 0/4 | 0/18 | 0/0 | **No** |
| `hooks/composio-config-dependencies.hooks.ts` | 0/6 | 2/10 | 0/5 | No (DI wiring) |
| `connectors-port.ts` (feature root, not under `hooks/`) | 0/8 | 2/19 | 0/6 | **No** |

Five files, **zero test files**, three of them (`use-composio-config`, `use-external-mcp`,
`use-settings-ui`) sitting at literal 0% on every metric — not "low," genuinely unexercised.

**What the code does (read in full, not inferred from names):**
- `use-composio-config.hooks.ts` — load/save/clear state machine for the Connectors tab's API key,
  with a `catalogRefreshKey` counter that's load-bearing (drives when the connector grid re-fetches
  after a key is saved), error-state derivation on both load and save paths, and a
  `useX(dependencies)`/`useWiredX()` split matching the pattern the codebase already uses for
  `redirects`/`widgets`/`plugins`/`members`/`workspace`.
- `use-external-mcp.hooks.ts` — the real transport for Settings → External MCP: field-spec overrides
  (deliberately dropping Jini's default `transport` choice and `secret-textarea` kind, both explained
  in the file's own header), a `toWriteBody` that omits `env` only when blank (never-clear-by-accident
  semantics), and an `updateSource` that merges a partial patch against a `lastKnown` ref because the
  write route replaces the whole row server-side — real merge logic with a real bug class if untested
  (toggling `enabled` blanking `command`/the allowlist).
- `use-settings-ui.hooks.ts` — the composition root for the whole Settings dialog: six independent
  `useSettingsSlice` mounts plus these two externally-backed hooks, `mergeSaveStates`,
  `areAnySlicesLoading`/`firstLoadError` aggregation across all eight.
- `connectors-port.ts` — the real OAuth two-gesture connector flow (redirect URL → user-gesture popup
  open → `postMessage` callback), 8 functions each with their own catch-and-reshape error handling
  (three different failure shapes: reject, resolve-null, resolve-with-error-field, depending on what
  the port's declared return type promises the caller).

None of this is decorative glue. `SettingsUi.tsx` itself scores 15/28 funcs (54%) in the same run,
which is consistent with `SettingsUi.unit.test.tsx` testing the shell against a **mocked** `useSettingsUi`
— a normal and correct test-boundary choice, but it means nothing downstream of that mock has ever
actually run.

**Hidden by aggregate?** Partially. `features/settings/` already reports 55.1% funcs at the parent
level in the source table, so this wasn't fully invisible — but it was bundled into a paired
`settings/+seo/` set and never broken down by file, so nobody had identified *which* files inside
account for it, or that three of five are at literal zero.

**Effort estimate:** Same size class as the already-assigned `workspace/hooks` task (3). The
`port`/`dependencies`/fake-triple pattern is already established twice in this exact directory
(`use-composio-key-field.hooks.unit.test.ts`, `use-settings-locale-sync.unit.test.tsx` both exist and
pass) — follow those as the template. Estimate: 4 new test files (one per untested hook, plus
`connectors-port.ts`), each needing a fake port injected the same way `ComposioConfigDependencies`/
`ExternalMcpController`'s `dependencies` shape already supports.

### 2. `features/menus/hooks/use-menu-editor.hooks.ts` — existing test file, real branch gap

**Numbers** (SHA `3a83cf99`, `set19-menus-database/lcov.info`): funcs 16/32 (50%), lines 60/97 (62%),
**branch 16/64 (25%)** — worst branch ratio of any file checked in this triage. A test file already
exists (`use-menu-editor.hooks.unit.test.tsx`), so this is "add cases to an existing suite," not
"write a missing file."

**What the code does:** 304-line hook owning the menu tree editor's state — immutable tree operations
(`mapAtPath`, `moveAtPath`, `addChildAt`, `removeAt`, `changeAt`, `addRootItem`, per the file's own
header) plus a dirty-guard and locale-injected error strings. Tree-recursion code is exactly where a
64-branch/16-covered ratio is believable: nested-vs-root item, move-up/down/into, remove-last-child,
etc. are each their own branch, and 16 covered branches suggests the existing test checks only the
happy path for a couple of operations.

**Effort:** Small-to-medium — one file, augment don't create. No fake to build; the test harness
already exists.

### 3. `features/widgets/hooks/use-widget-region-editor.hooks.ts` — the file the original table's "widgets/hooks separately: 76.27/65.62/63.63/84.12" note was pointing at

**Numbers** (SHA `a1e86b02`, `set06-widgets/lcov.info`): funcs 6/20 (30%), lines 34/46 (74%), branch
7/18 (39%). Existing test file (`use-widget-region-editor.hooks.unit.test.tsx`) — same "augment"
category as #2.

**What the code does:** placement move/reorder logic (`movePlacement`, `buildDraftPlacement` from
`rules.ts`) plus a stale-version/409-conflict error path (`resolveWidgetRegionSaveError`,
`staleVersionMessage`) — real conflict-handling logic, not markup.

**Confirms the original table's own flag** — of the four hook files in `features/widgets/hooks/`, this
is the specific one dragging the subdirectory aggregate below the parent's 84.61%; the other three
(`use-widget-instance-editor` 11/11 funcs, `use-widgets-library` 9/11, `widgets-dependencies` 13/18)
are all reasonably covered.

**Effort:** Small — one file, augment.

### 4. `features/posts/PostEditor.tsx` — worth a 10-minute look, not a priority write yet

**Numbers** (SHA `a1e86b02`, `set09-posts/lcov.info`): funcs 20/72 (28%), lines 32/98 (33%), branch
113/177 (64%). This single 1171-line file is what drags `features/posts/`'s parent number down to
51.85% funcs in the source table — every other file in `posts/` scores well (`rules.ts` 22/22,
`use-post-editor.hooks.ts` 26/30, `Posts.tsx` 13/13, `post-editor-dependencies.hooks.ts` 15/18).

**Why this is ranked below #1–3 rather than alongside them:** branch coverage (64%) — the metric that
tracks actual decision-path risk — is meaningfully healthier than func coverage (28%) here, which is
the signature of a component with many small, independent callback closures (toolbar button handlers
that each wrap one TipTap chain call, e.g. `() => editor.chain().focus().toggleBold().run()`) rather
than one under-tested decision tree. I did not read all 72 functions to confirm this hypothesis
line-by-line — that's exactly the 10-minute check I'm recommending before committing effort: if most
of the 52 uncovered functions are one-line toolbar wrappers around already-battle-tested TipTap APIs,
this is low-value to chase; if a meaningful fraction are non-trivial (upload handling, draft
reconciliation, slug derivation inline in the component rather than in `rules.ts`), it deserves the
same treatment as #1–3.

---

## Explicitly checked and dismissed

- **`features/commerce`** — checked per the brief's instruction to verify, not just accept. Confirmed
  stub: `Payments.tsx` + 1 test file, 1 line total in the scoped lcov. Not flagged.
- **`features/deployment/**`** — excluded per brief (measured read-only, done, another session's
  territory). Not read, not measured, not flagged.
- **`features/workspace/hooks/`** — already task 1 in the worklist (5.12%, port trio). Not duplicated
  here; see finding #1 above for a structurally identical second instance the same session missed.
- **`lib/` — NOT a real gap, despite the table's 71.48%/74.9%/50.28%/71.73%.** Every one of `lib/`'s 24
  source files has a 1:1 test file already (verified by directory listing — no missing pairs). The low
  aggregate is entirely explained by one file: `lib/api.ts` (2568 lines, a REST client with 174 mostly
  one-line per-endpoint wrapper functions) scoring 10/174 funcs (5.7%) in `lib/`'s own scoped run.
  Confirmed by direct measurement: **excluding `api.ts` alone, the rest of `lib/` sums to funcs
  181/193 (93.8%), lines 541/567 (95.4%), branch 388/411 (94.4%)** — recomputed directly from the
  retained `set04-lib-r3/lcov.info`, not estimated. `api.ts` is imported by **233 other files** across
  `apps/admin/src` (verified by grep), so its true exercise happens almost entirely from the 21 other
  feature directories' own test suites, invisible to a `lib/`-scoped run. This is the run-level-vs-
  per-file trap the dispatch brief warned about, in its most extreme form in this table. Do not write
  `lib/`-local tests for `api.ts`'s uncovered wrapper functions — if a true number is wanted, it needs
  a full-suite run, not local test authoring.
- **DI wiring files as a class** (`*-dependencies.hooks.ts`, `*-port.hooks.ts`, `index.ts` barrels,
  `*-i18n.ts`/`*-i18n.tsx` dictionaries) — checked across every directory in this triage (posts,
  settings, menus, forms, redirects, members, media, seo, widgets all show the identical pattern: these
  files are consistently the ones with zero or near-zero coverage and zero test files, uniformly,
  everywhere). This is an established, deliberate convention in this codebase (thin injection seams,
  logic lives in the paired `use-X.hooks.ts`), not an oversight. Not recommending blanket tests for
  this class. (The one exception inside finding #1 — `connectors-port.ts` — is flagged specifically
  *because* reading it showed real OAuth/error-handling logic, not because it's a "port" file.)
- **`features/redirects/Redirects.tsx`** — real zero-test-file gap (302 lines, no direct test), but
  downgraded to not-recommended after reading it: its own header states it is deliberately "markup
  only," and every piece of logic it depends on is already well-tested — `rules.ts` 12/12 funcs/20/20
  branch, `use-redirects.hooks.ts` 13/14 funcs, `use-hit-count-cell.hooks.ts` 4/4, both
  `use-import-redirects-form.hooks.ts` 4/4 — all from `set18-redirects-recovery/lcov.info`. The
  underlying risk is covered; only interaction/render assertions on the shell itself are missing. Not
  worth prioritizing over findings #1–3.
- **`features/members/`** — `Members.tsx` branch 15/28 (54%) and `rules.ts` branch 4/10 (40%) are real
  but the whole directory is small (7 source files) and was only measured as part of a 3-feature
  36-test combined set. Real but lowest-priority tier; not ranked above, would only be worth picking up
  alongside an adjacent task.

---

## Anomalies found in the source table / tooling, worth flagging separately

1. **`features/redirects/Redirects.tsx`, `redirects-port.hooks.ts`, and `index.ts` do not appear in
   `set18-redirects-recovery/lcov.info` at all — not even at 0/0.** Confirmed by direct grep of the
   lcov for `SF:.*[Rr]edirects` — only `redirects-i18n.tsx`, `rules.ts`, `redirects-dependencies.hooks.ts`,
   and the three real hook files show up. Given `coverage.all: true` is supposed to instrument the
   whole tree regardless of what ran, a file missing entirely (not merely at 0%) suggests v8 never
   resolved the module at all during that run — plausibly a lazy/dynamic-import boundary in the route
   table. Worth a look by whoever next touches the coverage tooling; not something I'm fixing in a
   read-only triage.
2. **`lib/`'s reported 50.28% func number in the source table is resolved above**, not left as an open
   question — see the dismissal section. Recommend the source table (or whoever reads it next) treat
   `lib/`'s aggregate as explained, not outstanding.

---

## Commit

Report written to `ADS-memory/reports/2026-08-15-admin-coverage-triage.md`. Commit contains only this
one file — see `git show --stat` output relayed in the final message to team-lead.
