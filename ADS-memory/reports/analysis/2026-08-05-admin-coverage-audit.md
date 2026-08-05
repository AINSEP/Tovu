# Admin Coverage Audit — where coverage actually is now

- Date: 2026-08-05
- Agent: Refactor (read-only for this task — no source, test, or config file modified)
- Scope: `apps/admin/src/features`, `apps/admin/src/hooks`, `apps/admin/src/lib`, `apps/admin/src/components` — same four directories as the companion complexity report (`2026-08-05-admin-complexity-over-10.md`)
- Supersedes the coverage half of `2026-08-05-admin-coverage-complexity-by-domain.md` (features-only, pre-TDD-pass — see §3 for the direct before/after)

## 1. Method + proof the run was real

**Command** (from `apps/admin/`):
```
npx vitest run --coverage --coverage.reportOnFailure \
  --coverage.reporter=json-summary --coverage.reporter=json --coverage.reporter=text
```
`--coverage.reportOnFailure` is not optional here — vitest 4.1.10's `coverage.reportOnFailure` defaults to `false`, and this suite has 4 permanently-expected failures (the `features/ai-assistant` roadmap-accordion tests — pre-existing, deliberate, untouched). Without the flag, `coverage/` is never written at all and the run looks like a tooling failure rather than "coverage was suppressed by design." Confirmed the trap is real by first checking the flag was actually necessary — it was; `coverage/` did not exist beforehand.

**Coverage directory freshness:**
```
coverage/coverage-summary.json   1,503,257 bytes   written 21:28:11
(checked at 21:28:47 — 36 seconds old, this run, not a stale artifact)
```

**Pass/fail tally — matches expected baseline exactly:**
```
Test Files  1 failed | 71 passed (72)
     Tests  4 failed | 744 passed (748)
```
The 1 failing file is `src/features/ai-assistant/__tests__/AiAssistant.unit.test.tsx`, and all 4 failing tests are the known roadmap-accordion cases ("lists all three unbuilt controls…", "renders every roadmap item as an inert unchecked box…", "expands to a one-line explanation…", "warns… that there is no cost ceiling yet"). **Exactly 4 failures, all expected — no stop condition triggered.** (For context: the stale report's baseline was 431 passed/4 failed against 435 total; this run is 744 passed/4 failed against 748 — the ~313-test jump is consistent with "a large TDD pass happened," which is the premise of this re-measurement.)

**Files instrumented vs files on disk:**

| | count |
|---|---|
| Non-test `.ts`/`.tsx` on disk, four scoped dirs | **186** |
| Appearing in `coverage-summary.json` | **184** |
| Difference | 2 |

The 2 missing files are `src/hooks/assistant-chats-port.hooks.ts` and `src/lib/fetch-query/types.ts` — both are pure `interface`/`type` declaration files with **zero executable statements** (confirmed by reading both in full: no function bodies, no runtime code, `import type` only). v8 has nothing to instrument in a file with 0 coverable statements, so it correctly does not appear in the summary — same as the stale report's own `index.ts` barrel files (§3 there: "n/a — 0 coverable statements"). Not a measurement gap. 184/186 is a full match once those 2 are accounted for.

**Trap 2 — tree quiescence check.** `apps/admin/src/lib/assistant-transport.ts` was the one in-scope file at risk from the still-running `byok-gemini` agent.
```
mtime before run:  Aug 4 14:58:29 2026
mtime after run:   Aug 4 14:58:29 2026   (unchanged)
```
No file under `apps/admin/src` has an mtime in the last 30 minutes as of this check. **`assistant-transport.ts`'s numbers below are reliable — the file was not touched during this run.**

## 2. Per-directory / per-feature coverage (worst first, statement-weighted)

**Top-level groups** (26 `features/*` shown individually below; `hooks`, `lib`, `components` are new to this audit's scope — the stale report only covered `features/`):

| Group | Stmt % | Branch % | Func % | Line % | Files |
|---|---:|---:|---:|---:|---:|
| features/workspace | 0.0% | 0.0% | 0.0% | 0.0% | 4 |
| features/recovery | 0.9% | 0.0% | 0.0% | 1.0% | 5 |
| features/seo | 2.6% | 2.6% | 4.4% | 1.9% | 7 |
| features/appearance | 3.6% | 0.0% | 0.0% | 3.8% | 4 |
| features/settings | 8.6% | 0.0% | 0.0% | 9.8% | 5 |
| features/collections | 18.0% | 18.3% | 8.1% | 19.1% | 13 |
| features/settings-raw | 29.0% | 23.2% | 25.3% | 30.8% | 8 |
| features/posts | 30.2% | 32.9% | 15.9% | 34.2% | 6 |
| features/integrations | 41.9% | 31.9% | 37.8% | 43.8% | 6 |
| features/ai-assistant | 45.5% | 35.0% | 44.8% | 46.8% | 7 |
| features/menus | 49.8% | 36.6% | 49.4% | 53.3% | 5 |
| features/widgets | 49.8% | 38.8% | 45.9% | 52.4% | 10 |
| **lib** | 56.5% | 56.3% | 57.8% | 56.4% | 19 |
| features/users | 56.6% | 57.1% | 48.9% | 61.9% | 4 |
| features/forms | 56.8% | 48.6% | 57.0% | 59.9% | 11 |
| features/comments | 58.8% | 46.4% | 73.5% | 61.8% | 6 |
| features/members | 65.8% | 46.4% | 80.0% | 72.7% | 4 |
| features/media | 67.4% | 61.4% | 65.7% | 72.8% | 7 |
| features/redirects | 69.2% | 49.3% | 63.8% | 69.9% | 6 |
| features/roles | 69.3% | 83.3% | 62.2% | 67.6% | 4 |
| features/database | 72.8% | 26.9% | 50.0% | 74.5% | 5 |
| **components** | 79.2% | 71.7% | 71.4% | 80.8% | 7 |
| features/plugins | 91.7% | 81.2% | 100.0% | 97.6% | 4 |
| features/taxonomy | 95.3% | 78.8% | 85.7% | 95.5% | 8 |
| **hooks** | 95.8% | 86.8% | 94.1% | 98.9% | 5 |
| features/analytics | 100.0% | 100.0% | 100.0% | 100.0% | 3 |
| features/auth | 100.0% | 100.0% | 100.0% | 100.0% | 3 |
| features/dashboard | 100.0% | 94.6% | 100.0% | 100.0% | 4 |
| features/pages | 100.0% | 88.2% | 100.0% | 100.0% | 4 |

**Scoped aggregate (all 184 instrumented files, four dirs):** Statements 56.67% (2851/5031) · Branches 47.99% · Functions 51.80% · Lines 58.34%.

`hooks` (95.8%) and `components` (79.2%) are the two strongest groups in the whole scope — both new to this audit, and `components` corroborates the team's own claim that `AssistantDock`/`SeeMore`/`WidgetPickerDialog` got TDD attention (see per-file detail in §4/§5; none of the three appear on any near-zero list). `lib` sits in the middle (56.5%) but is not uniform — see `assistant-transport.ts` throughout this report.

## 3. Refreshed by-domain rollup — directly comparable to the stale table

Stale baseline (statement-weighted): **People 43.2% · Content 37.6% · Design & System 18.1% · Marketing 0.8%**

| Domain | Stale | Now | Δ | Driven by |
|---|---:|---:|---:|---|
| **Marketing** | 0.8% | **39.3%** (94/239) | **+38.5pp** | `analytics` 0.0%→100.0%, `redirects` 1.0%→69.2%. `seo` barely moved (0.9%→2.6%) — still effectively untested; it is the domain's remaining gap. |
| **People** | 43.2% | **62.0%** (349/563) | **+18.8pp** | `roles` 0.0%→69.3% is the entire delta. `users`, `comments`, `members` are byte-for-byte unchanged from the stale measurement. |
| **Design & System** | 18.1% | **35.0%** (170/486) | **+16.9pp** | `database` 0.9%→72.8% — a **large, unrequested improvement not on the "known improved" list** given for this task (which named recovery/workspace/appearance/settings as untouched — correctly: all four are byte-for-byte identical to the stale numbers, see below). |
| **Content** | 37.6% | **51.2%** (851/1663) | **+13.6pp** | `taxonomy` 0.0%→95.3% and `pages` 0.0%→100.0%. `collections`, `posts`, `widgets`, `menus`, `media` are unchanged. |
| *Other/Ungrouped (informational, not in the 4-domain total)* | 41.2% | 44.4% (220/495) | +3.2pp | `auth` 0.0%→100.0%, offset by `ai-assistant` 46.1%→45.5% (small, see below). `dashboard` and `settings-raw` unchanged. |

**Exact-match sanity check:** every feature the brief did *not* list as improved reproduced the stale report's number to one decimal place — `recovery` 0.9%/0.0%/0.0%/1.0% (stmt/branch/func/line), `workspace` 0.0%/0.0%/0.0%/0.0%, `appearance` 3.6%/0.0%/0.0%/3.8%, `settings` 8.6%/0.0%/0.0%/9.8%, `collections` 18.0%/18.3%/8.1%/19.1%, `posts` 30.2%, `widgets`/`menus` 49.8%/49.8%, `users` 56.6%, `comments` 58.8%, `members` 65.8%, `media` 67.4%, `settings-raw` 29.0%, `dashboard` 100.0%, `integrations` 41.9%, `plugins` 91.7% — all identical to four significant figures. This is strong corroboration that both measurements used the same methodology and that nothing drifted in the unlisted features; it also means the deltas above can be attributed with confidence to the specific features named.

**One negative movement, small:** `ai-assistant` went from 46.1% (stale) to 45.5% (now) — a 0.6pp dip, not flagged by the brief as either improved or regressed. Too small and too far from any complexity hotspot to investigate further here, but noted rather than silently rounded away.

**`database` deserves a callout of its own** (0.9% → 72.8%, +71.9pp on the single feature) — it wasn't named in the "known improved" list, making it the one surprise finding in this section. Worth telling the owner explicitly since it changes the Design & System recommendation from the stale report (which had ranked `database` #5 overall specifically because it was near-zero covered; it no longer is).

## 4. Zero-and-near-zero list

**Every non-test file under 20% statements (44 files):**

| File | Stmt % | Covered/Total |
|---|---:|---|
| `features/ai-assistant/hooks/use-admin-assistant-switch.hooks.ts` | 0.0% | 0/3 |
| `features/ai-assistant/hooks/use-admin-execution-mode.hooks.ts` | 0.0% | 0/3 |
| `features/appearance/rules.ts` | 0.0% | 0/1 |
| `features/appearance/hooks/use-appearance.hooks.ts` | 0.0% | 0/17 |
| `features/collections/Collections.tsx` | 0.0% | 0/53 |
| `features/collections/hooks/use-collections.hooks.ts` | 0.0% | 0/16 |
| `features/collections/hooks/use-edit-fields-dialog.hooks.ts` | 0.0% | 0/24 |
| `features/collections/hooks/use-escape-to-cancel.hooks.ts` | 0.0% | 0/6 |
| `features/collections/hooks/use-lifecycle-confirm-dialog.hooks.ts` | 0.0% | 0/2 |
| `features/collections/hooks/use-new-content-type-dialog.hooks.ts` | 0.0% | 0/25 |
| `features/collections/hooks/use-term-picker.hooks.ts` | 0.0% | 0/22 |
| `features/forms/hooks/use-form-submission-detail.hooks.ts` | 0.0% | 0/19 |
| `features/forms/hooks/use-form-submissions.hooks.ts` | 0.0% | 0/12 |
| `features/integrations/IntegrationDeliveries.tsx` | 0.0% | 0/11 |
| `features/integrations/hooks/use-integration-deliveries.hooks.ts` | 0.0% | 0/9 |
| `features/posts/Posts.tsx` | 0.0% | 0/14 |
| `features/posts/rules.ts` | 0.0% | 0/36 |
| `features/posts/hooks/use-posts.hooks.ts` | 0.0% | 0/40 |
| `features/recovery/Recovery.tsx` | 0.0% | 0/25 |
| `features/recovery/hooks/use-recovery.hooks.ts` | 0.0% | 0/28 |
| `features/recovery/hooks/use-restore-flow.hooks.ts` | 0.0% | 0/50 |
| `features/redirects/Redirects.tsx` | 0.0% | 0/31 |
| `features/seo/Seo.tsx` | 0.0% | 0/39 |
| `features/seo/hooks/use-entry-picker.hooks.ts` | 0.0% | 0/9 |
| `features/seo/hooks/use-seo-entry-panel.hooks.ts` | 0.0% | 0/37 |
| `features/seo/hooks/use-seo-entry-section.hooks.ts` | 0.0% | 0/2 |
| `features/seo/hooks/use-seo.hooks.ts` | 0.0% | 0/26 |
| `features/settings/rules.ts` | 0.0% | 0/12 |
| `features/settings-raw/hooks/use-reset-namespace-dialog.hooks.ts` | 0.0% | 0/6 |
| `features/settings-raw/hooks/use-value-editor.hooks.ts` | 0.0% | 0/11 |
| `features/settings/hooks/use-settings-locale-sync.hooks.ts` | 0.0% | 0/4 |
| `features/settings/hooks/use-settings-ui.hooks.ts` | 0.0% | 0/19 |
| `features/workspace/Workspace.tsx` | 0.0% | 0/9 |
| `features/workspace/rules.ts` | 0.0% | 0/9 |
| `features/workspace/hooks/use-workspace.hooks.ts` | 0.0% | 0/25 |
| `features/database/Database.tsx` | 3.1% | 1/32 |
| `lib/assistant-transport.ts` | 5.3% | 9/170 |
| `features/collections/rules.ts` | 9.4% | 5/53 |
| `features/appearance/Appearance.tsx` | 10.0% | 1/10 |
| `features/settings-raw/rules.ts` | 12.1% | 8/66 |
| `components/WidgetConfigFields.tsx` | 14.1% | 9/64 |
| `features/recovery/rules.ts` | 16.7% | 1/6 |
| `lib/widget-embed-extension.tsx` | 18.6% | 8/43 |
| `features/collections/CollectionEntryEditor.tsx` | 19.0% | 8/42 |

**Literal 0.0% subset: 35 of the 44 above** (everything through `features/workspace/hooks/use-workspace.hooks.ts` in the table). Read this as the direct worklist: a totally-untested file goes from 0% to *something* on the very first test written for it, which is the cheapest coverage gain available anywhere in this scope.

Note the concentration: `collections` (6 files), `seo` (5 files), `recovery` (3 files), `settings`/`settings-raw` (4 files combined) — these clusters mean "write one test for this feature" is a false economy; the untested surface is spread across most of the feature's own files, not one outlier.

## 5. Risk ranking — cognitive complexity × uncovered fraction (the priority deliverable)

Reuses the 43 over-10 functions from the companion complexity report. `risk = cognitive_complexity × (1 − file_statement_coverage)`. File-level coverage is used as the uncovered-fraction proxy (v8 does not report per-function coverage) — a function in a 0%-covered file scores its full cognitive complexity as risk; a function in a 100%-covered file scores 0 regardless of how complex it is, per the brief's framing ("a hard function that is well covered is not urgent").

| Rank | Risk | Cog | Cyc | File cov | Function | File |
|---|---:|---:|---:|---:|---|---|
| 1 | **22.00** | 22 | 20 | 0.0% | `RestoreFlow` | `features/recovery/Recovery.tsx:165` |
| 2 | **20.24** | 25 | 10 | 19.0% | `DynamicField` | `features/collections/CollectionEntryEditor.tsx:39` |
| 3 | **15.38** | 19 | 21 | 19.0% | `CollectionEntryEditor` | `features/collections/CollectionEntryEditor.tsx:136` |
| 4 | **15.15** | 16 | 8 | 5.3% | `readSseFrames` (async generator) | `lib/assistant-transport.ts:266` |
| 5 | **14.53** | 15 | 15 | 3.1% | `MigrateForwardSection` | `features/database/Database.tsx:193` |
| 6 | 12.31 | 13 | 10 | 5.3% | anonymous async arrow (SSE consumer) | `lib/assistant-transport.ts:355` |
| 7 | 11.42 | 13 | 9 | 12.1% | `describeApiError` | `features/settings-raw/rules.ts:281` |
| 8 | 11.28 | 19 | 21 | 40.6% | `FormEditor` | `features/forms/FormEditor.tsx:486` |
| 9 | 10.42 | 11 | 17 | 5.3% | `translateRunAgentPayload` | `lib/assistant-transport.ts:73` |
| 10 | 9.70 | 16 | 19 | 39.4% | `Users` | `features/users/Users.tsx:43` |
| 11 | 9.47 | 10 | 13 | 5.3% | `startRun` (async method) | `lib/assistant-transport.ts:405` |
| 12 | 8.51 | 13 | 20 | 34.5% | `buildSettingsPatch` | `features/comments/rules.ts:100` |
| 13 | 8.16 | 17 | 34 | 52.0% | `VisitorCredentialForm` | `features/ai-assistant/AiAssistant.tsx:293` |
| 14 | 8.14 | 10 | 12 | 18.6% | `WidgetEmbedNodeView` | `lib/widget-embed-extension.tsx:40` |
| 15 | 8.00 | 8 | 11 | 0.0% | `Collections` | `features/collections/Collections.tsx:331` |
| 16–17 | 7.43 | 11 | 12/13 | 32.5% | `Toolbar`, `PostEditor` | `features/posts/PostEditor.tsx:24,113` |
| 18 | 7.00 | 7 | 13 | 0.0% | `Seo` | `features/seo/Seo.tsx:235` |
| 19 | 6.70 | 10 | 14 | 33.0% | `runTestConnection` | `features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts:322` |
| 20 | 6.67 | 11 | 11 | 39.4% | row-map arrow | `features/users/Users.tsx:174` |
| 21 | 6.55 | 10 | 13 | 34.5% | `commentRowMenuItems` | `features/comments/rules.ts:69` |
| 22 | 6.50 | 13 | 13 | 50.0% | row-map arrow | `features/roles/Roles.tsx:200` |
| 23 | 6.00 | 6 | 25 | 0.0% | `SeoEntryPanel` | `features/seo/Seo.tsx:97` |
| — | *(remaining 20 functions score 0.42–5.18 — see the full ranked JSON if needed; none change the top-of-list story)* | | | | | |

**Reading this list:**
- **`Recovery.tsx`/`RestoreFlow` is the single highest-risk function in the entire scope** — high cognitive complexity (22) landing on a file with literally zero coverage. This matches the complexity report's own top-priority proposal (REF-103) and confirms it independently from the coverage side: this is not close.
- **The `lib/assistant-transport.ts` cluster (ranks 4, 6, 9, 11) is the clearest systemic finding.** All four of the file's over-10 functions land in the top 12 by risk, because the file is only 5.3% covered — and per Trap-adjacent digging (below), that 5.3% is almost entirely accidental: of the file's two on-disk test files, `assistant-transport.transcript.test.ts` **does not import anything from `assistant-transport.ts` at all** (it tests `@jini-ai/chat/core`); only `assistant-transport.a2ui.test.ts` does, and it exercises exactly one export, `translateRunAgentPayload`. The companion complexity report described this file as "already tested" based on two test files existing on disk — that was a reasonable file-presence inference that this coverage run shows to be **wrong at the granular level**: `startRun`, `readSseFrames`, and the SSE-consumer arrow (three of the file's four complex functions) have no test coverage at all. Correcting that here rather than letting it stand.
- **`VisitorCredentialForm` (AiAssistant.tsx) drops to rank 13** despite having the highest raw cognitive/cyclomatic scores in the whole complexity report — because the file is 52% covered, roughly half its risk is already retired. This is exactly the effect the ranking is designed to produce: raw complexity alone would have put it #1; complexity × uncovered puts real attention ahead of it.
- **`CollectionEntryEditor.tsx` holds two of the top 5 slots** (`DynamicField` at #2, the component itself at #3) — same file, same 19.0% coverage, two independently complex functions. This is the strongest "one file, two real problems" case in the whole ranking.

## 6. Complex files with literally no test file on disk

Three tiers, from most to least severe. "No test file" means no `__tests__/` file targets this specific file by name — a sibling test in the same feature can still exercise it indirectly (imports/mounts it), which is why coverage % is shown for each.

**Tier A — no test file AND ~0% coverage (completely blocked from safe refactoring):**

| File | Complex function(s) | Coverage |
|---|---|---:|
| `features/recovery/Recovery.tsx` | `RestoreFlow` (cog 22, cyc 20) | 0.0% |
| `features/collections/Collections.tsx` | `Collections` (cog 8, cyc 11) | 0.0% |
| `features/seo/Seo.tsx` | `SeoEntryPanel` (cog 6, cyc 25), `Seo` (cog 7, cyc 13) | 0.0% |
| `features/posts/rules.ts` | `handleImageDrop` (cog 5, cyc 11) | 0.0% |
| `features/database/Database.tsx` | `MigrateForwardSection` (cog 15, cyc 15) | 3.1% (near-zero) |

This is the complete set for this scope — `Recovery.tsx` was the one already known from the complexity report; the other four are new. Per the Refactor Agent's own guardrails ("do not refactor code with no test coverage"), none of REF-102 (`DynamicField`), REF-103's `Database.tsx`/`Recovery.tsx` portion, or any future `Seo.tsx`/`Collections.tsx`/`posts/rules.ts` proposal can proceed without a TDD pass first — route through Coordinator, not straight to Programmer.

**Tier B — no dedicated test file, but nonzero coverage from indirect exercise (real gap, less urgent):**

`features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts` (33.0%, exercised via `AiAssistant.unit.test.tsx` mounting the real hook), `features/comments/rules.ts` (34.5%, via `Comments.unit.test.tsx`), `features/media/hooks/use-media-lightbox.hooks.ts` (75.0%, via `Media.unit.test.tsx`), `features/settings-raw/rules.ts` (12.1%), `features/users/rules.ts` (66.7%, via `Users.unit.test.tsx`), `src/hooks/assistant-chats-dependencies.hooks.ts` (95.8%, via `use-assistant-chats.unit.test.ts`'s dependency injection), `lib/fetch-query/adapter.tanstack.tsx` (100.0%, via `fetch-query.test.tsx`), `lib/widget-embed-extension.tsx` (18.6%).

The lower-coverage half of this tier (`use-visitor-credential-form.hooks.ts`, `comments/rules.ts`, `settings-raw/rules.ts`, `widget-embed-extension.tsx`) is worth a direct test file even though partially exercised — an indirect seam is the first thing that silently stops being exercised when the parent test changes.

**Special case — has test files, doesn't cover the complex parts:** `lib/assistant-transport.ts` (2 test files on disk, 5.3% coverage — see §5's third bullet for why). Not Tier A/B exactly; flagged on its own because "a test file exists" would otherwise read as reassuring here and isn't.

**Roles/users/settings-raw `describeApiError` trio, for reference:** the companion complexity report flagged these three near-identical functions as a duplication candidate. Coverage differs across them — `roles/rules.ts` **does** have a dedicated `rules.unit.test.ts` (not in either tier above), while `users/rules.ts` and `settings-raw/rules.ts` do not. If they do get consolidated per that report's REF proposal, `roles`'s existing test is the natural one to generalize rather than writing three new ones.

## What these numbers do not tell us

Same caveats as the stale report's §6 apply unchanged (v8 statement coverage ≠ correctness; a 0% file could be untestable-as-written rather than merely unwritten). One addition specific to this run: the risk ranking in §5 uses **file-level** uncovered fraction as a proxy for the individual function's own coverage — a function that happens to be the one well-tested part of an otherwise-untested file would be scored as riskier than it actually is, and the reverse. `assistant-transport.ts`'s four functions were checked individually against their test files specifically because this proxy risk was visible in advance; the same spot-check was not run for every file in §5's tail, so treat ranks below ~15 as directionally right rather than individually precise.
