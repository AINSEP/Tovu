# Admin Feature-Slice Coverage & Complexity by Domain

- Date: 2026-08-05
- Agent: CodeBase Analyzer (+ TestRunner reporting contract for the coverage half)
- Scope: `apps/admin/src/features/` — 26 vertical-slice features, post-extraction (component = markup, `hooks/*.hooks.ts` = state, `rules.ts` = pure logic)
- Read-only measurement task. No product source, test, or config file was modified.

## Sampling Notice

Files measured: every non-test `.ts`/`.tsx` file under all 26 `apps/admin/src/features/*` directories (current tree), plus all 36 pre-refactor originals at `git show HEAD:apps/admin/src/sections/*.tsx`. `__tests__/` files excluded from complexity (they aren't part of the four-layer split being measured) but included in the coverage run (they're what drives it).

Files excluded: everything outside `apps/admin/src/features/` (`App.tsx`, `panels.tsx`, `nav.ts`, `lib/`, `components/`, `hooks/` at the app root) — out of scope for this domain breakdown, though `App.tsx`/`panels.tsx` were read to derive the domain mapping.

Confidence: High on coverage and complexity numbers (both are machine-measured, not sampled/estimated). Medium on the before/after causal interpretation (git history gives strong but not exhaustive evidence for *why* a number moved — see the ai-assistant finding below, which is corroborated by commit log but not by reading every intervening diff).

## 0. Corrections to the brief before the numbers

1. **36 originals, not 37.** `git ls-tree -r HEAD -- apps/admin/src/sections` (excluding `__tests__`) returns 36 files. The likely 37th is `Placeholder.tsx`, which isn't one of the 26 features — it became `components/Placeholder.tsx`, a shared component with no feature home (used by the `newsletter` panel's stub). Measured but excluded from the before/after feature table.
2. **`npm run test:cov` / bare `vitest run --coverage` produces no `coverage/` directory at all** when any test fails. Vitest v8's `coverage.reportOnFailure` defaults to `false`. The suite's 4 expected `ai-assistant` roadmap failures were silently suppressing the entire coverage report — not a flaky run, a real default-behavior trap. Fixed by adding `--coverage.reportOnFailure` on the CLI (no config file touched). Confirmed 431 passed / 4 failed matches the expected baseline before trusting the coverage numbers below.
3. **One extraction is incomplete, contradicting "every component is markup-only."** `forms/hooks/use-forms-list.hooks.ts` (53 lines — `forms`, `error`, `rowSavingId`, `toggleStatus`, `load`) is never imported anywhere in the repo (grepped whole tree). `FormsList.tsx` still carries the identical logic inline verbatim. Scanned all 70 `.hooks.ts` files for this pattern (exported hook name unused outside its own file) — this is the **only** orphan, so it's isolated, not systemic. Not fixed (read-only task); flagged here and counted honestly in the tables below (the hook file exists on disk and is included in file counts, but contributes 0 to reachable coverage since it's dead code).
4. **`ai-assistant`'s complexity spike is real and traced to a specific function, not decomposition noise** — see §4.

## 1. Domain Table

Coverage is **weighted by statements** (`Σcovered / Σtotal`), never averaged per-file. Complexity aggregates are sums/means/maxes over every function ESLint's `complexity`/`sonarjs/cognitive-complexity` rules reported (thresholds set to 0 in a scratchpad-only config, so *every* function reports, not just violators — see §7 for the tool setup).

The 4 requested domains map exactly to `panels.tsx`'s `group` fields (23 panels): **Content 8, Design & System 7, Marketing 4 panels / 3 features, People 4.** `newsletter` (Marketing) has no feature directory — it renders the shared `Placeholder` stub, so Marketing has only 3 measurable features. The remaining 4 features (`dashboard`, `ai-assistant` — both ungrouped top-row panels; `settings-raw` — routable, no nav row; `auth` — not a panel at all, pre-login) don't belong to any of the 4 domains and are reported as a 5th **Other/Ungrouped** row for completeness, not counted into your 4-domain total.

| Domain | Features | Stmt % (cov/tot) | Branch % | Func % | Line % | Cyc total / mean / max | Cyc >10 | Cog total / mean / max | Cog >15 | Zero-coverage features |
|---|---|---|---|---|---|---|---|---|---|---|
| **Content** | 8 | 37.6% (625/1661) | 33.3% | 33.7% | 39.9% | 689 / 2.68 / **27** (posts) | 11 | 554 / 0.90 / 25 (collections) | 4 | pages, taxonomy |
| **Design & System** | 7 | **18.1%** (88/486) | 12.8% | 18.3% | 19.0% | 239 / 2.54 / 20 (recovery) | 3 | 169 / 0.94 / 22 (recovery) | 1 | workspace |
| **People** | 4 | 43.2% (243/563) | 38.0% | 47.6% | 45.7% | 213 / 3.04 / 20 (comments) | 4 | 214 / 1.30 / 16 (users) | 1 | roles |
| **Marketing** | 3 | **0.8%** (2/239) | 0.0% | 0.0% | 0.9% | 146 / 2.61 / 25 (seo) | 2 | 66 / 0.65 / 7 | 0 | analytics (redirects 1.0%, seo 0.9% — functionally untested too) |
| *Other/Ungrouped (informational)* | 4 | 41.2% (204/495) | 34.3% | 43.6% | 41.9% | 218 / 3.69 / **34** (ai-assistant) | 2 | 181 / 1.11 / 17 | 1 | auth |

**Marketing is the worst domain by far** — 0.8% statement coverage across all 3 features, essentially zero automated verification of anything under SEO, redirects, or analytics. **Design & System** is second-worst and structurally important (settings, database, recovery, integrations — the operational-safety surface).

## 2. Feature Table (26 rows, sorted by domain then total cyclomatic complexity)

| Feature | Domain | Stmt % | Branch % | Func % | Line % | Cyc tot/mean/max | Cog tot/mean/max |
|---|---|---|---|---|---|---|---|
| collections | Content | 18.0% | 18.3% | 8.1% | 19.1% | 139 / 2.36 / 21 | 111 / 0.82 / 25 |
| forms | Content | 56.5% | 48.0% | 56.6% | 59.6% | 125 / 2.40 / 21 | 100 / 0.83 / 19 |
| media | Content | 67.4% | 61.4% | 65.7% | 72.8% | 91 / 2.27 / 12 | 77 / 1.10 / 17 |
| posts | Content | 30.2% | 32.9% | 15.9% | 34.2% | 91 / 4.55 / **27** | 65 / 0.94 / 11 |
| widgets | Content | 49.8% | 38.8% | 45.9% | 52.4% | 89 / 2.78 / 14 | 69 / 0.93 / 11 |
| menus | Content | 49.8% | 36.6% | 49.4% | 53.3% | 77 / 2.75 / 12 | 55 / 0.70 / 6 |
| taxonomy | Content | **0.0%** | 0.0% | 0.0% | 0.0% | 55 / 3.93 / 13 | 56 / 1.33 / 13 |
| pages | Content | **0.0%** | 0.0% | 0.0% | 0.0% | 22 / 1.83 / 10 | 21 / 0.84 / 6 |
| database | Design & System | 0.9% | 0.0% | 0.0% | 0.9% | 59 / 2.81 / 15 | 40 / 1.00 / 15 |
| recovery | Design & System | 0.9% | 0.0% | 0.0% | 1.0% | 52 / 3.47 / 20 | 48 / 1.55 / **22** |
| integrations | Design & System | 41.9% | 31.9% | 37.8% | 43.8% | 38 / 2.00 / 11 | 28 / 0.76 / 10 |
| settings | Design & System | 8.6% | 0.0% | 0.0% | 9.8% | 34 / 1.79 / 7 | 9 / 0.27 / 4 |
| plugins | Design & System | 91.7% | 81.2% | 100.0% | 97.6% | 27 / 2.25 / 6 | 18 / 0.95 / 7 |
| workspace | Design & System | **0.0%** | 0.0% | 0.0% | 0.0% | 20 / 4.00 / 10 | 14 / 1.27 / 7 |
| appearance | Design & System | 3.6% | 0.0% | 0.0% | 3.8% | 9 / 3.00 / 7 | 12 / 1.33 / 4 |
| redirects | Marketing | 1.0% | 0.0% | 0.0% | 1.1% | 75 / 2.08 / 9 | 30 / 0.65 / 7 |
| seo | Marketing | 0.9% | 0.0% | 0.0% | 1.0% | 57 / 4.38 / 25 | 31 / 0.69 / 7 |
| analytics | Marketing | **0.0%** | 0.0% | 0.0% | 0.0% | 14 / 2.00 / 5 | 5 / 0.45 / 2 |
| settings-raw | Other | 29.0% | 23.2% | 25.3% | 30.8% | 113 / 3.05 / 10 | 90 / 1.20 / 13 |
| ai-assistant | Other | 46.1% | 35.0% | 46.6% | 47.5% | 76 / 4.75 / **34** | 68 / 1.17 / 17 |
| dashboard | Other | 100.0% | 91.9% | 100.0% | 100.0% | 24 / 6.00 / 14 | 18 / 0.72 / 13 |
| auth | Other | **0.0%** | 0.0% | 0.0% | 0.0% | 5 / 2.50 / 4 | 5 / 1.00 / 3 |
| comments | People | 58.8% | 46.4% | 73.5% | 61.8% | 95 / 3.28 / 20 | 68 / 1.39 / 14 |
| roles | People | **0.0%** | 0.0% | 0.0% | 0.0% | 48 / 2.82 / 18 | 54 / 1.20 / 13 |
| users | People | 56.6% | 57.1% | 48.9% | 61.9% | 46 / 3.54 / 19 | 60 / 1.33 / 16 |
| members | People | 65.8% | 46.4% | 80.0% | 72.7% | 24 / 2.18 / 8 | 32 / 1.28 / 12 |

Only `dashboard` (100%) and `plugins` (91.7%) are genuinely well-covered. 6 features sit at exactly 0.0%: pages, taxonomy, workspace, analytics, auth, roles. 5 more are functionally untested despite a nonzero number: database, recovery, redirects, seo (all 0.9–1.0%), appearance (3.6%). **11 of 26 features — over 40% — have essentially no test coverage.**

## 3. File-Class Table — did extraction move logic somewhere testable?

| Class | Files | Stmt % (cov/tot) | Branch % | Func % | Line % | Fns | Cyc tot/mean/max | Cog tot/mean/max |
|---|---|---|---|---|---|---|---|---|
| **view** (`Feature.tsx`) | 35 | 34.6% (308/890) | 33.3% | 26.9% | 35.6% | 517 | 886 / 4.18 / **34** | 605 / 1.17 / 25 |
| **hooks** (`hooks/*.hooks.ts`) | 69 of 70 on disk† | 34.0% (701/2061) | 19.8% | 35.2% | 35.4% | 527 | 253 / **1.37** / 7 | 370 / 0.70 / 17 |
| **rules** (`rules.ts`) | 22 | 31.0% (153/493) | 26.1% | 36.1% | 34.4% | 180 | 366 / 2.63 / 20 | 209 / 1.16 / 13 |
| index (barrel `index.ts`) | 26 | n/a — 0 coverable statements | — | — | — | 0 | 0 | 0 |

† The 70th is `forms/hooks/use-forms-list.hooks.ts`, the orphan from §0.3 — absent from coverage output entirely because it's unreachable dead code, not because of an exclude pattern.

**Answer to the brief's question: partially.** `rules.ts` does hold real, non-trivial complexity (366 total cyclomatic across only 180 functions — mean 2.63, actually higher than hooks' 1.37) — so the pure-logic extraction genuinely moved branching logic into small, easily-unit-tested functions, and it's not a superficial split. But it did **not** empty the hard branches out of the view layer: `.tsx` view files still carry the highest total (886), highest mean (4.18 — 3x hooks' mean), and by far the highest single-function max (34) and cognitive max (25) of any class. Coverage-wise the three classes are nearly indistinguishable (31–35%), so none of the three layers is meaningfully better-tested than the others yet — the extraction changed *where* logic lives but hasn't yet been followed by tests targeting the new seams.

`hooks/*.hooks.ts` is the cleanest class by design: low mean complexity (1.37, mostly `useState`/`useEffect`/thin API wrappers), which is exactly what you'd want state-management code to look like — it's meant to be simple plumbing, and it is.

## 4. Before vs After — did the refactor work?

**Methodology note before the table:** total cyclomatic complexity is **not expected to stay flat** under a monolith→component+hook+rules split on its own — decomposition adds one baseline-complexity-1 unit per new function purely from splitting, independent of any logic change. Checked this directly: the per-feature increase in total cyclomatic complexity correlates with the increase in function count at a ratio of ~1.5–3 extra complexity per extra function almost everywhere (e.g. collections +12 fns / +32 cyc = 2.67/fn, forms +22 fns / +26 cyc = 1.18/fn) — consistent with logic being *redistributed*, not *added*. So a total-complexity rise on its own is not evidence of a problem; what matters is **max-per-function**, which decomposition should genuinely shrink.

| Feature | Domain | Fns before→after | Cyc total before→after | Cyc **max** before→after | Cog total before→after | Cog **max** before→after |
|---|---|---|---|---|---|---|
| collections | Content | 124→136 | 107→139 (+32) | 21→21 (flat) | 117→111 | 25→25 (flat) |
| forms | Content | 98→120 | 99→125 (+26) | 22→21 (**-1**) | 92→100 | 21→19 (-2) |
| media | Content | 55→70 | 63→91 (+28) | 11→12 (+1) | 73→77 | 17→17 (flat) |
| posts | Content | 66→69 | 85→91 (+6) | 27→27 (flat) | 65→65 | 11→11 (flat) |
| widgets | Content | 66→74 | 71→89 (+18) | 17→14 (**-3**) | 69→69 | 12→11 (-1) |
| menus | Content | 77→79 | 75→77 (+2) | 12→12 (flat) | 55→55 | 6→6 (flat) |
| taxonomy | Content | 35→42 | 38→55 (+17) | 12→13 (+1) | 56→56 | 13→13 (flat) |
| pages | Content | 23→25 | 18→22 (+4) | 8→10 (+2) | 21→21 | 6→6 (flat) |
| database | D&S | 37→40 | 50→59 (+9) | 13→15 (+2) | 40→40 | 15→15 (flat) |
| recovery | D&S | 27→31 | 44→52 (+8) | 19→20 (+1) | 47→48 | 22→22 (flat) |
| integrations | D&S | 34→37 | 32→38 (+6) | 9→11 (+2) | 29→28 | 10→10 (flat) |
| settings | D&S | 27→33 | 25→34 (+9) | 11→7 (**-4**) | 12→9 | 11→4 (-7) |
| plugins | D&S | 17→19 | 22→27 (+5) | 5→6 (+1) | 19→18 | 7→7 (flat) |
| workspace | D&S | 9→11 | 16→20 (+4) | 9→10 (+1) | 14→14 | 7→7 (flat) |
| appearance | D&S | 7→9 | 5→9 (+4) | 5→7 (+2) | 12→12 | 4→4 (flat) |
| redirects | Marketing | 33→46 | 54→75 (+21) | 12→9 (**-3**) | 29→30 | 8→7 (-1) |
| seo | Marketing | 40→45 | 46→57 (+11) | 24→25 (+1) | 31→31 | 7→7 (flat) |
| analytics | Marketing | 10→11 | 11→14 (+3) | 3→5 (+2) | 5→5 | 2→2 (flat) |
| settings-raw | Other | 67→75 | 93→113 (+20) | 17→10 (**-7**) | 94→90 | 19→13 (-6) |
| **ai-assistant** | Other | 31→58 | 20→76 (**+56**) | **6→34 (+28)** ⚠️ artifact — see correction below | 35→68 | 10→17 (+7) |
| dashboard | Other | 24→25 | 21→24 (+3) | 12→14 (+2) | 18→18 | 13→13 (flat) |
| auth | Other | 4→5 | 3→5 (+2) | 3→4 (+1) | 5→5 | 3→3 (flat) |
| comments | People | 45→49 | 85→95 (+10) | 20→20 (flat) | 67→68 | 14→14 (flat) |
| roles | People | 44→45 | 45→48 (+3) | 16→18 (+2) | 54→54 | 13→13 (flat) |
| users | People | 42→45 | 39→46 (+7) | 17→19 (+2) | 59→60 | 16→16 (flat) |
| members | People | 23→25 | 20→24 (+4) | 6→8 (+2) | 32→32 | 12→12 (flat) |

**Total complexity rose in all 26 features** — expected per the methodology note, and the per-function ratio confirms it's mostly decomposition overhead, not rewriting.

**Max-per-function — the metric that should genuinely improve — only dropped in 5 of 26 features**: settings-raw (-7), settings (-4), widgets (-3), redirects (-3), forms (-1). Everywhere else it's flat or *up*, meaning the single hardest function in 21 of 26 features is at least as complex now as before the extraction. That's the real finding here: **the extraction relocated code into more files, but for most features it has not yet actually simplified the hardest function** — it moved state out (hooks) and some pure logic out (rules), but the remaining render/dispatch function in the view file is often just as branchy as the original was.

> ### ⚠️ CORRECTION — 2026-08-05, by the Coordinator, after this report was written
>
> **The `ai-assistant` "genuine outlier" below is a MEASUREMENT ARTIFACT. Do not act on it.**
> The original text is struck through and kept for the record; the corrected finding follows.
>
> The `6 → 34` jump is an eslint **attribution boundary** effect, not a complexity regression.
> `eslint`'s `complexity` rule scores each nested arrow function **separately from its parent**.
> At HEAD, `VisitorCredentialForm`'s ~21 ternaries lived inside ~20 nested JSX arrow callbacks,
> each reported as its own `Arrow function has a complexity of N`; the parent kept only 6. The
> extraction consolidated those arrows, so the *same logic* now lands on the parent as 34.
>
> Measured directly (eslint `complexity: ["warn", {max: 0}]`, both versions, whole file):
>
> | | HEAD `sections/AiAssistant.tsx` | now `features/ai-assistant/AiAssistant.tsx` |
> |---|---|---|
> | total complexity, all functions | **76** | **61** |
> | function count | **31** | **12** |
>
> **The view file's total complexity went DOWN (76 → 61) across 19 fewer functions.** That is the
> opposite of the reported regression.
>
> Also corrected: the **ADR-058 attribution is wrong**. `VisitorCredentialForm` already exists at
> `HEAD:apps/admin/src/sections/AiAssistant.tsx:212` — it is not new, and `7f44ecd` was reverted by
> `43f20d0`, which HEAD includes. And the function did not grow: body **244 → 225 lines**, ternaries
> **21 → 20**, `if (` statements **5 → 0** (they moved into the hook, as intended).
>
> **Read the whole "total complexity rose in all 26 features" headline with this caveat.** Per-file
> totals here are not comparable across the refactor boundary without accounting for arrow-function
> attribution. The report's own quieter reading — ~1.5–3 extra complexity per extra function, the
> benign baseline cost of decomposition — is the sound one. Whether the *feature-level* totals
> (view + hooks + `rules.ts`) genuinely rose was **not** re-derived and remains open.

~~**One genuine outlier, not decomposition noise:** `ai-assistant` — `VisitorCredentialForm` in `AiAssistant.tsx` is the *same named function, still in the view file*, and went from cyclomatic 6 → 34, cognitive 4 → 17 (file itself grew 622 → 681 lines). This is not the hook eating the component: `hooks/use-visitor-credential-form.hooks.ts` exists (394 lines) and **is** correctly wired in (`useVisitorCredentialForm` imported and called) — state management was extracted properly. The complexity growth is new render branching (conditional error/validation display, presumably) that lines up with the git log: ADR-058's visitor-credential-store landed and was reverted from the admin UI across the last few commits (`7f44ecd`, `78006d2`, `43f20d0`). Read as concurrent feature work landing in the same window as the refactor, not the refactor itself breaking behavior-preservation — but it leaves `VisitorCredentialForm` as the single most complex function in all of `features/` (cyc 34, the domain table's max), and it's the one place the "markup only" claim doesn't hold.~~

## 5. Ranked Recommendation — where should the next TDD pass go?

Ranking by **risk score = total cyclomatic complexity × uncovered-statement fraction** — a feature earns a high score only by being both complex *and* untested; a trivial untested feature (auth, cyc 5) or a well-covered complex one (plugins, 91.7% covered) both score low, correctly.

| Rank | Feature | Domain | Cyc total | Cyc max | Stmt cov | Risk score | Why |
|---|---|---|---|---|---|---|---|
| 1 | **collections** | Content | 139 | 21 | 18.0% | **114.0** | Largest feature in the tree by total complexity, 21-branch `CollectionEntryEditor`, only 18% covered. Single highest-value target. |
| 2 | **settings-raw** | Other | 113 | 10 | 29.0% | **80.3** | Second-largest complexity mass, still only 29% covered; the SPEC-007 raw ledger inspector is a debugging surface operators reach for when something's already wrong — a bad path here is a bad time to discover it untested. |
| 3 | **redirects** | Marketing | 75 | 9 | 1.0% | **74.3** | Essentially zero coverage (1.0%) on a feature with real complexity (75 total, `ImportRedirectsForm` at 8). Marketing's least-bad complexity but its most dangerous gap given the near-total absence of tests. |
| 4 | **posts** | Content | 91 | **27** | 30.2% | **63.5** | Contains the single highest true cyclomatic-complexity function outside ai-assistant/collections: `PostEditor.tsx`'s `selector` at 27 (cognitive complexity 0 — see caveat below, this one may be a data table, not branching logic; verify before assuming it's dangerous). Only 30% covered regardless. |
| 5 | **database** | Design & System | 59 | 15 | 0.9% | **58.5** | Near-zero coverage (0.9%) on the ADR-041 migrations/snapshots/index-changes surface — this is exactly the kind of feature where an untested bug is a data-loss incident, not a UI glitch. |

**Honorable mentions just outside the top 5:** seo (56.5), taxonomy (55.0, and it's one of only 6 features at literal 0% coverage), forms (54.4 — already the best-covered of the high-complexity group at 56.5%, so lower urgency than its raw score suggests).

**Do not start with:** ai-assistant, despite having the single highest max-complexity function in the tree (34). Its risk score (41.0) ranks below the top 5 because it's already 46.1% covered — the existing test suite (13 tests in `AiAssistant.unit.test.tsx`, 4 of them the known-failing roadmap tests) already exercises a meaningful fraction of it. `VisitorCredentialForm` specifically is worth a follow-up characterization-test pass, but it's not the highest-leverage place to spend the next full TDD cycle.

## 6. What these numbers do NOT tell us

- **v8 line/statement coverage ≠ correctness.** A line executed during an assertion about something else still counts as "covered." None of these percentages say the assertions are meaningful, only that the code path ran.
- **Cyclomatic complexity treats every branch as equally risky.** `PostEditor.tsx`'s `selector` (cyc 27, cog **0**) is very likely a big `switch`/lookup table — mechanically branchy but not conceptually hard to follow, which is exactly why its cognitive-complexity score is 0 despite the high cyclomatic number. Cyclomatic-alone rankings should be read alongside the cognitive column, not instead of it — a high-cyc/low-cog function is a different (and usually lower-priority) risk than a high-cyc/high-cog one like `recovery`'s `MigrateForwardSection` (cyc 15, cog 15) or `ai-assistant`'s `VisitorCredentialForm` (cyc 34, cog 17).
- **"0% coverage" doesn't distinguish "untested" from "untestable as currently written."** `pages`, `taxonomy`, `workspace`, `analytics`, `auth`, and `roles` all show literal 0.0% — that's 6 features with *zero* executing test files, not 6 features with weak partial coverage. That's a more severe gap than a domain average suggests, and it means the very first test written for each will move its number from 0 to something, a much larger jump than for a feature already at 40–60%.
- **`rules.ts` holding "meaningful complexity" (§3) doesn't mean it holds the *right* complexity.** I did not verify that the branches counted in `rules.ts` are the ones that actually matter for correctness (validation, permission checks, data transforms) versus incidental branching (formatting, sorting). That would require reading each `rules.ts` file's content, not just its shape — out of scope for a complexity-only pass.
- **The orphaned `use-forms-list.hooks.ts` (§0.3) was found by one grep-based heuristic** (exported hook name unused outside its own file) applied to all 70 hooks. It would miss an orphan whose hook is imported somewhere but never actually called, or a hook that's called only from a test file and not from product code — a stricter check (e.g. import graph from the actual view file, not a text grep) would be needed to fully rule out further extraction gaps.
- **The before/after comparison assumes the 36 `sections/*.tsx` originals and the 26 current features are the correct 1:1 (or N:1) map** — verified by name and by content resemblance, not by a diff-based renaming trace. `Placeholder.tsx`'s exclusion (§0.1) is the one already-caught case of this being wrong; there could be others (e.g. a section that was deleted rather than migrated) that this sampling wouldn't surface.
- **Coverage and complexity were measured on the current working tree, which is mid-refactor** (git status shows uncommitted renames/moves). Numbers will shift again before this lands — treat this as a snapshot, not a final grade.

## 7. Tool setup (for reproducibility)

- Coverage: `npx vitest run --coverage --coverage.reportOnFailure --coverage.reporter=json-summary --coverage.reporter=json --coverage.reporter=text` from `apps/admin/` (the `--coverage.reportOnFailure` flag is required — see §0.2). Parsed `coverage/coverage-summary.json`.
- Complexity: scratchpad-only flat ESLint config (`complexity: ['warn', 0]`, `sonarjs/cognitive-complexity: ['warn', 0]`) so every function reports its true score, not just violators. Imports `typescript-eslint`/`eslint-plugin-sonarjs` via absolute paths into the repo's own root `node_modules` (scratchpad has no `node_modules` ancestor for bare-specifier ESM resolution). Never touched the repo's `eslint.config.mjs`.
- Before-state: `git show HEAD:apps/admin/src/sections/<file>.tsx` for all 36 files, written to scratchpad only, linted with the same config.
- Cyclomatic/cognitive messages were paired per function by nearest source line (ESLint's `complexity` rule reports at the function's own line; `sonarjs/cognitive-complexity` reports at the same line for nearly every case tested). Functions with no cognitive-complexity message were assigned cognitive = 0 — the sonarjs rule doesn't fire when the score is exactly 0 against a 0 threshold (0 is not > 0), which is expected for simple single-expression functions with no branching, not a measurement gap.
