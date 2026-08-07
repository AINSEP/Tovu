# Handoff — apps/admin complexity refactor

**Written:** 2026-08-06
**Target:** claude (Claude Code, same machine)
**Branch:** `refactor/jini-admin-extraction`
**Baseline commit:** `34a7936` refactor(admin): extract component hooks into ConfirmDialog-pattern folders
**Focus:** Refactor `apps/admin` for complexity, targeting the repo's own documented
ESLint+sonarjs methodology — NOT the hook-aggregated numbers that could not be reproduced.

**Saved here, not `.local-artifacts/`, deliberately.** That path is gitignored
(`ADS-memory/.gitignore:1`), which is how a prior handoff nearly went missing. Verified with
`git check-ignore`: this directory is committable.

---

## Next-agent opening prompt

> Read `AI-Dev-Shop/AGENTS.md` first and perform Mandatory Startup, then read
> `ADS-memory/reports/handoffs/2026-08-06-admin-complexity-refactor.md`.
> Run `git status` before touching anything — the tree carries another session's uncommitted
> sidebar-accordion work that must not be swept into a commit; §Risks says which paths.
> Start at Next Steps #1. **Read §"The methodology trap" before trusting any complexity number,
> including the ones in this document.** Do not re-derive the ConfirmDialog folder pattern — it is
> done and committed; `apps/admin/INFO.md` documents it.

---

## The methodology trap — read this first

The owner supplied a list of 16 symbols "over 15 in either cyclomatic (cyc) or cognitive (cog)",
topped by `useSelectDropdown` at 37/56. **Those numbers do not reproduce under the repo's own
documented tool**, and a subagent caught it before writing code.

The repo's methodology is already written down: `ADS-memory/reports/analysis/2026-08-05-admin-complexity-over-10.md` §0.

```
npx eslint --no-error-on-unmatched-pattern --format json \
  --rule '{"complexity":["warn",0],"sonarjs/cognitive-complexity":["warn",0]}' \
  apps/admin/src/features apps/admin/src/hooks apps/admin/src/lib apps/admin/src/components
```

ESLint 10.8.0 + typescript-eslint 8.65.0 + eslint-plugin-sonarjs 4.2.0, thresholds forced to `0`
so every function reports rather than only violations.

Measured against that:

| symbol | owner's list | repo's tool |
|---|---|---|
| `useSelectDropdown` | 37 / 56 | **2 / 0** |
| `handlePanelKeyDown` | 11 / 23 | **16 / 15** |
| `translateRunAgentPayload` | 12 / 23 | **17 / 11** |
| `useAssistantChats`, `useUsers`, `useRoles`, `useSettingsSlice`, `startByokRun`, `App`, `useTaxonomy`, `useSettingsContainer`, `saveWithRetry`, `readSseFrames`, `runTestConnection`, `useWidgetInstanceEditor`, `useVisitorCredentialForm` | 6–20 / 16–35 | **do not appear over 10** |

**Cause.** ESLint scores every nested closure as its own function and never rolls it into the
parent. A hook is a thin shell around many closures, so its own lexical scope scores near-zero
while its file totals high (`Select.hooks.tsx`: 40 closures, file total 86/46). The owner's tool
appears to aggregate closures INTO the enclosing hook, producing a hook-shaped list where ESLint
produces a component-shaped one.

The exact aggregation could not be reconstructed: `useSelectDropdown`'s own scope is 2/0, the sum
of everything nested inside it is 79/44, and the file total is 86/46 — none of which is 37/56.
**The owner has not yet said which tool produced their table.** Ask before reporting any
"after" number, or report against the ESLint method above and say so explicitly.

Neither view is wrong — they answer different questions ("how hard is this hook to hold in your
head" vs "which single function has the most branches"). But do not mix them in one report.

The 2026-08-05 audit **already documents this trap** in its `Roles.tsx` / `Members.tsx` /
`Users.tsx` note: ESLint scores a nested `.map()` row-renderer arrow independently of its parent
component, so reading both numbers together double-counts one screen as two problems.

### Two known measurement artifacts — do not refactor

Both reproduce exactly, and both are called out in the 2026-08-05 audit §3:

- `features/posts/PostEditor.tsx:27` (anonymous `selector`) — **27 / 0**. A flat object literal of
  13 `field ?? false` entries. ESLint counts every `??` as a decision point; there is no control
  flow. Cognitive complexity agrees: 0.
- `features/seo/Seo.tsx:97` `SeoEntryPanel` — **25 / 6**. Same shape.

**Rule of thumb this establishes: when cyc is high and cog is near zero, the cyclomatic score is
operator-counting, not branching. Trust cognitive.** The inverse also holds — a high cog:cyc ratio
means nesting, which is the thing actually worth removing.

---

## Next Steps

### 1. Confirm the metric with the owner before targeting

One question: what produced the 16-symbol table? If they have the command, re-measure against it
so before/after are comparable. If not, agree explicitly to use the ESLint method above.
Everything below assumes the ESLint method.

### 2. The real top offenders (measured 2026-08-06, ranked by `cog*2 + cyc`)

| cyc | cog | function | location |
|---|---|---|---|
| 34 | 17 | `VisitorCredentialForm` | `src/features/ai-assistant/AiAssistant.tsx:313` |
| 20 | 22 | `RestoreFlow` | `src/features/recovery/Recovery.tsx:165` |
| 10 | 25 | `DynamicField` | `src/features/collections/CollectionEntryEditor.tsx:39` |
| 21 | 19 | `CollectionEntryEditor` | `src/features/collections/CollectionEntryEditor.tsx:136` |
| 21 | 19 | `FormEditor` | `src/features/forms/FormEditor.tsx:486` |
| 19 | 16 | `Users` | `src/features/users/Users.tsx:43` |
| 16 | 15 | `handlePanelKeyDown` | `src/components/Select/Select.hooks.tsx:286` |
| 20 | 13 | `buildSettingsPatch` | `src/features/comments/rules.ts:100` |
| 15 | 15 | `MigrateForwardSection` | `src/features/database/Database.tsx:193` |
| 17 | 14 | *(anonymous)* | `src/lib/execution-settings.ts:236` |
| 9 | 17 | *(anonymous)* | `src/features/media/hooks/use-media-lightbox.hooks.ts:65` |
| 14 | 13 | `Dashboard` | `src/features/dashboard/Dashboard.tsx:26` |
| 13 | 13 | *(anonymous row-renderer)* | `src/features/roles/Roles.tsx:200` |
| 13 | 13 | `MergeTermSection` | `src/features/taxonomy/Taxonomy.tsx:186` |
| 17 | 11 | `translateRunAgentPayload` | `src/lib/assistant-transport.ts:73` |
| 10 | 14 | `QueueSection` | `src/features/comments/Comments.tsx:39` |
| 18 | 10 | `Roles` | `src/features/roles/Roles.tsx:36` |
| 15 | 11 | *(anonymous)* | `src/lib/assistant-transport.ts:492` |
| 14 | 11 | `WidgetInstanceEditor` | `src/features/widgets/WidgetInstanceEditor.tsx:43` |
| 13 | 12 | `PageEditor` | `src/features/pages/PageEditor.tsx:46` |
| 10 | 13 | `useFetchQuery` | `src/lib/fetch-query/adapter.tanstack.tsx:76` |
| 13 | 11 | `PostEditor` | `src/features/posts/PostEditor.tsx:110` |
| 9 | 13 | `describeApiError` | `src/features/settings-raw/rules.ts:281` |
| 14 | 10 | *(anonymous)* | `src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts:322` |
| 13 | 10 | `commentRowMenuItems` | `src/features/comments/rules.ts:69` |

Notes on specific entries:

- **`DynamicField` (10/25) is the highest COGNITIVE score in the app** — the 2.5× cog:cyc ratio
  means deep nesting with few branches, which is the most valuable shape to fix. Arguably the
  single best target on this list despite a middling cyclomatic score.
- **`VisitorCredentialForm` (34/17) is the highest cyclomatic.** It is the *component* in
  `AiAssistant.tsx`, distinct from the `useVisitorCredentialForm` *hook* in
  `hooks/use-visitor-credential-form.hooks.ts` — do not confuse them.
- **`Roles.tsx:36` (18/10) and `Roles.tsx:200` (13/13)** are the double-count the audit warned
  about: one over-sized table section, reported as two numbers. Treat as one problem.
- `translateRunAgentPayload` (17/11) — **triaged as a false positive, leave it.** See §Do Not
  Refactor.

### 3. Follow the coverage rule

Before restructuring anything, check whether it has a test. Refactoring uncovered code for a
metric is how behaviour changes silently: the number improves and the bug ships. Write
characterisation tests first (document what the code *does*, not what it should), get green, then
refactor. Dispatch with `AI-Dev-Shop/agents/refactor/skills.md` **plus**
`AI-Dev-Shop/agents/tdd/skills.md` for any untested target — AGENTS.md requires naming
task-activated conditional skills explicitly.

---

## Do Not Refactor — triaged false positives

Each was read in full, not inferred from its score.

| symbol | score | why it stays |
|---|---|---|
| `translateRunAgentPayload` | 17/11 | Flat `switch` mapping wire-protocol event types to internal variants; every case a one-line return. cog inflated by ~6 optional-field ternaries, not nesting. A lookup map scores better but loses TypeScript exhaustiveness on the discriminated union and scatters the `mcp-ui`/`a2ui` comments, which document real interop bugs. |
| `saveWithRetry` | 7/22 (owner's list) | 30-line retry loop, five early returns, each a distinct documented outcome (`saved`/`permanent`/`exhausted`/`missing`). loop+try/catch nesting is intrinsic to retry. |
| `App` | 16/17 (owner's list) | Flat, independent, heavily documented effects (matchMedia + two ResizeObservers). Not a route switch — that was an early wrong guess, corrected by reading it. |
| `PostEditor.tsx:27` selector | 27/0 | Measurement artifact — flat `??` chain. |
| `SeoEntryPanel` | 25/6 | Same. |
| `readSseFrames` | 7/20 (owner's list) | Three nested loops IS the standard incremental-SSE-parser shape; flattening means buffering the whole stream. One bounded win only: extract `parseFrame(rawFrame)`. |

**`handlePanelKeyDown` — partially reprieved, and this correction matters.** It was initially
dismissed as "an unavoidable key switch". At 16/15 it is the highest-scoring function in its
folder, and **cog 15 alongside cyc 16 means the weight is not the switch** — a flat switch scores
low cognitive. Reading it (lines 286-333), the load is in per-case conditionals. Keep the switch
flat and one-case-per-key; extract the `Tab` case's focus-walking block (lines 316-329:
`focusableInDomOrder` walk + `indexOf` + nested `if` + `shiftKey` ternary) into a named,
independently-testable function.

---

## State of the in-flight complexity pass (as of writing)

Three subagents were dispatched against the **owner's original (unreproducible) numbers** before
the discrepancy surfaced. Their work is still defensible — it is closure extraction and test
coverage, which improve any metric — but their targeting was not grounded in the ESLint method.
**Nothing from this pass had landed on disk when this handoff was written.** Verify with
`git status` rather than assuming.

| agent | targets | notes |
|---|---|---|
| D | `lib/assistant-transport.ts` (`startByokRun`, `readSseFrames`), `hooks/use-assistant-chats.hooks.ts`, `hooks/use-settings-slice.hooks.ts` | Plan: extract per-frame dispatch from `startByokRun`'s 4-5-deep IIFE; `parseFrame`; one narrow extraction each from the two hooks. Deliberately restrained on the hooks — dense synchronisation code with documented StrictMode/staleness ordering. |
| E | `components/Select/`, `features/settings-raw/`, `features/widgets/hooks/` | Found the metric discrepancy. Plan: decompose `useSelectDropdown` into named internal sub-hooks; characterisation tests for the two untested files. |
| F | `features/users/`, `features/roles/`, `features/taxonomy/`, `features/ai-assistant/`, new `hooks/use-async-action.hooks.ts` | Creating the shared primitive (below) + investigating the roadmap test failures (below). |

### The `useAsyncAction` primitive (agent F, in flight)

Across `useUsers` (332 lines, 25 `useState` — its own header calls it "the highest-state screen in
the app"), `useRoles` (318 lines), `useTaxonomy`, and `useVisitorCredentialForm`, one triple
repeats:

```
[thing, setThing] / [thingSaving, setThingSaving] / [thingError, setThingError]
```

These are NOT duplicate CRUD hooks — the entities genuinely differ, and a generic `useResource`
would be the wrong abstraction. A small `useAsyncAction` primitive at
`apps/admin/src/hooks/use-async-action.hooks.ts` collapses the triple wherever it appears, cutting
state count across many symbols without inventing a framework.

`useWidgetInstanceEditor` (14/11) is a near-false-positive that needs no bespoke surgery — it
benefits only as a *consumer* of this primitive, and only after characterisation tests land.

---

## Unresolved: four failing tests, cause undetermined

`apps/admin/src/features/ai-assistant/__tests__/AiAssistant.unit.test.tsx` →
`describe("the not-yet-built roadmap accordion")`, 4 tests, all `expected [] to have a length of 2`.

**Pre-existing, proven:** HEAD has `panel: <RoadmapChecklist />` at the identical line 657, the
test file is unmodified, and the only working-tree change to `AiAssistant.tsx` was an import path.
Introduced by `197bfe8`, which moved the roadmap **behind a SettingsDialog tab**. The tests query
`container.querySelectorAll(".assistant-roadmap summary")` on initial render, so they find nothing.

**Do not blindly fix the test.** Decide with evidence which side is wrong:
- roadmap *meant* to be behind a tab (likely — the Open Design SettingsDialog port) → the TEST is
  stale, should select the tab first;
- roadmap *meant* to be on the main panel → the SOURCE regressed in `197bfe8`, and a test edit
  would hide it.

Agent F was asked to investigate; result not yet reported.

---

## Risks

**Uncommitted work belonging to another session — do not sweep into a commit:**

```
 M apps/admin/src/App.tsx                                 ← sidebar accordion (collapsibleGroups)
 M apps/admin/src/styles.css                              ← accordion CSS (.cms-section-items, .cms-group-toggle)
 M apps/admin/src/panels.tsx
 M apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts
?? apps/admin/src/__tests__/unit/sidebar-accordion-css.unit.test.ts
```

`34a7936` was committed using hunk-level staging (`git apply --cached --recount` with a
hunk-filtered patch) precisely to keep this work out of it. `App.tsx` and `styles.css` each carry
BOTH that feature and unrelated path fixes — a whole-file `git add` on either sweeps up a feature
you have not reviewed. The accordion CSS comment documents the author-`display`-beats-UA-`[hidden]`
trap, so it is deliberate work, not cruft.

Also dirty from other sessions, outside `apps/admin`: `AGENTS.md`, `development/evals/*`,
`development/todos.md`, `src/assistant/*`, `src/server/*`.

**`grep` in this shell is a function wrapping `ugrep --ignore-files`.** It silently skipped a
tracked source file during a recursive search this session, producing a plausible-looking false
negative — the dangerous kind, because "no references found" is the answer that authorises a
deletion. **Use `git grep` for any existence claim.** A dead-code deletion in `34a7936` was
re-verified this way after the fact and held, but only by luck of double-checking.

**`git log --follow` on the split files.** Git matched each old file to whichever new file kept
more of its *lines*, which for four components is the `.hooks.tsx`, not the `.tsx`:
`git log --follow Select/Select.hooks.tsx` traces the full history; `Select/Select.tsx` starts at
`34a7936`. Use `-M25%` if a trace comes up short.

**One orphaned Vite process**, PID 63004, started 2026-08-05 10:13, holding no port. Harmless but
worth `kill`ing. A stale dev server was the cause of the `404 (Not Found)` HMR errors on old
component paths reported this session — the fix is a dev-server restart after any file move.

---

## Reference — what is already done, do not redo

- **`34a7936`** — 8 components moved to the `ConfirmDialog` folder pattern
  (`<Name>/<Name>.tsx` + `<Name>.hooks.tsx`, no barrel), each with an injectable hook seam.
  235 tests across 15 suites, `tsc` clean, verified to build standalone in a clean worktree.
- **`apps/admin/INFO.md` §Components** — the full convention: folder shape, no-barrel rule,
  one-public-entry-point-per-folder, the injectable seam (naming, additive-only, one seam per
  *reachable* boundary, the generic-fake gotcha), test placement, and the `lib/` vs `components/`
  boundary ("the file extension is not the test — addressability is").
- **`ADS-memory/reports/refactors/2026-08-06-admin-components-hook-extraction.md`** — decision log
  D1-D9 for that pass.
- **`ADS-memory/reports/analysis/2026-08-05-admin-complexity-over-10.md`** — the prior complexity
  audit, its method, and its tooling notes (including "`eslintcc` does not work in this repo").
- Fixed in `34a7936`: `use-taxonomy.hooks.ts:101` read `if (false) return;` with an unchecked
  `as AdminTerm` cast, committed in `87e07f6`, its test red on main since. Now 17/17.
- Deleted in `34a7936`: `MediaImageInsertControl`, dead since `EmbedInsertControl` superseded it.

## Known limits of this document

- The owner's complexity tool is **unidentified**. Every number here is from the ESLint method
  above and will not match their table.
- The three subagents' work was **in flight and unlanded** at writing. Re-verify against
  `git status` and a fresh test run rather than trusting this snapshot.
- The roadmap-accordion verdict is **undetermined**, not merely unreported.
