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
> `ADS-memory/reports/handoffs/2026-08-06-admin-complexity-refactor.md` **in full** — including
> §"Coordinator mistakes from this session", which exists so they are not repeated.
> Run `git status` before touching anything: the tree carries another session's uncommitted
> sidebar-accordion work that must not be swept into a commit (§Risks names the paths), AND the
> stopped remains of three subagents, one of which does not compile.
> **The bar is ≤10 cyclomatic and ≤10 cognitive per function, or a documented in-code reason why
> not** — see §"THE ACCEPTANCE CRITERION". Measure it yourself with the command in §"The
> methodology trap"; do not trust any number handed to you, including the ones in this document.
> Dispatch the work to **Refactor** agents (`AI-Dev-Shop/agents/refactor/skills.md`), lifting their
> propose-only default explicitly, and add `AI-Dev-Shop/agents/tdd/skills.md` for any untested
> target. Do not re-derive the ConfirmDialog folder pattern — it is done and committed in
> `34a7936`; `apps/admin/INFO.md` documents it.

---

## THE ACCEPTANCE CRITERION — owner-set, 2026-08-06

> **10 is the ceiling. Every function ends at ≤10 cyclomatic AND ≤10 cognitive — or it carries a
> documented reason, in the code, for why it cannot.**

This is a hard bar, not a direction of travel. It was set because the previous round had **no
target at all**: the dispatch said "reduce complexity" and named symbols, so agents took one clean
cut each and stopped. That produced real but partial results — `readSseFrames` reached 5/8, while
`useAssistantChats`' deepest closure landed at 8/**15** and was reported as done. Under a ceiling
it would not have been.

**Two acceptable outcomes per function, nothing else:**

1. **≤10 / ≤10.** Measured with the command in the next section, before and after.
2. **A documented exemption** — a comment on the function saying what it scores, why the structure
   is irreducible, and what was tried. "It's complicated" is not a reason. Legitimate shapes:
   - a flat `switch` over a closed protocol/key set, where a lookup table would lose TypeScript
     exhaustiveness (see `translateRunAgentPayload`, 17/0);
   - a flat sequence of `??` / `?.` fallbacks that inflates *cyclomatic* while cognitive stays near
     zero (see `PostEditor.tsx:27`, 27/0) — a measurement artifact, note it and move on;
   - intrinsic control flow like a retry ladder whose branches are distinct documented outcomes
     (see `saveWithRetry`).

**A `for` loop nested three deep is not an exemption. Neither is "the tests pass."**

Report before/after per function against the measured numbers, never estimates. The previous round
hand-estimated `useSettingsSlice` at ~12/~12; the tool showed **no change at all** (file cognitive
25 → 25). Hand-counting against the SonarJS nesting model is not reliable — run the command.

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

## State of the in-flight complexity pass — STOPPED MID-FLIGHT

Three Refactor subagents were dispatched against the **owner's original (unreproducible) numbers**
and with **no complexity ceiling set**. The owner stopped all three on 2026-08-06 to restart with
the ≤10 bar. Their partial work is **uncommitted but present in the working tree** — it survived
`TaskStop`, verified by listing the files afterwards.

**The tree does NOT typecheck.** One live error, agent F caught mid-edit:

```
src/features/users/hooks/use-users.hooks.ts(325,5): error TS2322:
  Type '(error: string | null) => void' is not assignable to
  type 'Dispatch<SetStateAction<string | null>>'
```

That is the `useAsyncAction` adoption half-applied — the primitive's setter signature does not
accept the `SetStateAction` updater form that `useUsers` passes. **Decide early whether to finish
or discard this**; it is a real API-design question about the primitive, not a typo.

### Agent D — `lib/assistant-transport.ts`, `use-assistant-chats`, `use-settings-slice` — COMPLETE and verified

Extracted, all with direct unit tests: `handleByokFrame` and `parseFrame` (from
`assistant-transport.ts`), `summarizeFlushOutcomes` (from `use-assistant-chats.hooks.ts`),
`commitQueuedSave` (from `use-settings-slice.hooks.ts`). **167/167 green**, typecheck clean for
its files, independently re-run by the coordinator.

Measured with the real tool, before (`34a7936`) → after:

| target | before | after | under 10? |
|---|---|---|---|
| `readSseFrames` | 8 / 16 | 5 / 8 | **yes** |
| `startByokRun` stream IIFE | 11 / 16 | 5 / 6 | **yes** |
| `useAssistantChats` deep closure | 10 / 23 | 8 / **15** | **NO — still over** |
| `useSettingsSlice` (file cognitive total) | 25 | 25 | **no change at all** |

File totals: `assistant-transport.ts` cyc 113→116, cog 82→**76**; `use-assistant-chats.hooks.ts`
cyc 87→89, cog 52→**42**; `use-settings-slice.hooks.ts` cyc 51→54, cog 25→**25**.

**Cyclomatic rose slightly in all three while cognitive fell. That is the correct signature of
extract-method, not a regression** — each extracted function carries a baseline branch count, so
cyc is roughly conserved, while cog falls because the nesting penalty disappears. Do not read
rising cyc as failure; do not target cyc for this kind of work.

Left deliberately untouched by D, with reasoning the coordinator accepted: `translateRunAgentPayload`
and the body of `saveWithRetry`. D also declined further restructuring inside the two hooks after
its one cut each, on the grounds that their cyc:cog ratios (1.26, 1.35) indicate breadth across
many callbacks rather than a nesting pyramid. **The measurement supports that judgement** —
`use-settings-slice` had no deep nesting left, hence no cognitive win available. Under the new ≤10
ceiling, `useAssistantChats`' 8/15 closure still needs work or a documented exemption.

D was partway through adding four thunk-semantics tests to `commitQueuedSave` when stopped; those
may be absent or incomplete.

### Agent E — `components/Select/`, `features/settings-raw/`, `features/widgets/hooks/` — PARTIAL, UNVERIFIED

- `Select.hooks.tsx`: **+244 / −86 lines**, mid-decomposition of `useSelectDropdown` into named
  internal sub-hooks. Not test-verified by the coordinator. Treat as untrusted until re-run.
- Characterisation tests written for the two untested files:
  `features/settings-raw/__tests__/use-settings-container.hooks.unit.test.ts` (15.4 KB) and
  `features/widgets/__tests__/use-widget-instance-editor.hooks.unit.test.ts` (14.5 KB).
  **These are the most clearly salvageable artifacts in the whole stopped pass** — characterisation
  tests against unchanged behaviour keep their value regardless of what happens to the refactor.

E is the agent that caught the metric discrepancy. Its judgement is worth trusting.

### Agent F — `features/users|roles|taxonomy|ai-assistant/`, `hooks/use-async-action.hooks.ts` — PARTIAL, BROKEN

- `hooks/use-async-action.hooks.ts` (5.3 KB) + `hooks/__tests__/use-async-action.hooks.test.ts` — the
  new shared primitive, written.
- Characterisation tests written: `features/ai-assistant/__tests__/use-visitor-credential-form.unit.test.ts`
  (17.9 KB), `features/users/__tests__/use-users.unit.test.ts` (17.8 KB). Same salvage note as E's.
- `features/users/hooks/use-users.hooks.ts` — **mid-adoption, does not compile** (the error above).
- `useRoles` / `useTaxonomy` adoption: not started.
- **The roadmap-accordion investigation was never done.** Still open, see its own section.

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

## Coordinator mistakes from this session — do not repeat these

Written by the coordinator who made them. Each cost real time or nearly caused a wrong action.
Three of the eight were caught by subagents, not by the coordinator, which is itself the lesson
in #8.

### 1. Dispatched three agents against numbers I never verified

The owner supplied a 16-symbol complexity table. I passed it straight into three briefs as
targets. It does not reproduce under the repo's own documented tool — `useSelectDropdown` measures
2/0, not 37/56. Agent E caught it *before writing code* and asked for the command.

**Rule: measure the baseline yourself before making it a target.** The repo's method was already
written down in `ADS-memory/reports/analysis/2026-08-05-admin-complexity-over-10.md` §0. One
command would have caught this. Numbers handed to you are inputs, not facts.

### 2. Set no acceptance threshold

Briefs said "reduce complexity" and named symbols. With no ceiling, each agent took one clean cut
and stopped — a defensible reading of a vague instruction. `useAssistantChats`' deepest closure was
reported as done at 8/**15**.

**Rule: state the bar, not the direction.** The owner has now set it: ≤10 on both axes, or a
documented exemption. See the acceptance-criterion section at the top.

### 3. Built a work list with a naive grep that counted comments as code

I grepped `use[A-Z]\w*` across `AssistantDock.tsx` to enumerate its in-file hooks, and briefed
agent A to extract `useByokRuntime`, `useLocalCliSelection`, `useExecutionConfig`, `useWorkingDir`,
and `useChatPane`. **The last two do not exist** — they appear only in doc comments citing *other
packages'* hooks. A grepped my claim, found it false, extracted the three real ones, and said so.

Same error again on `WidgetConfigFields`: I claimed 5×`useState`/3×`useEffect`; the real count is
4×/2× (I had counted the import line).

**Rule: in a codebase this heavily commented, an occurrence count is not a symbol census.** Grep
for definitions (`function useX`, `const useX =`) or read the file.

### 4. Used the shell's `grep` for existence claims

`grep` in this environment is a **shell function wrapping `ugrep --ignore-files`**. It silently
skipped a tracked source file during a recursive search, returning zero hits for a class name that
was on line 109 of the file I was asking about. I briefly concluded markup had been deleted when
it had not.

This is the dangerous failure mode: a false negative from grep does not look like an error, it
looks like an answer — and "nothing references this" is the answer that authorises a deletion. I
had used exactly that to justify deleting `MediaImageInsertControl`. Re-verified afterwards with
`git grep`; it held, but by luck of double-checking.

**Rule: `git grep` (or `command grep`) for any existence or dead-code claim. Never the wrapper.**

### 5. Guessed at code instead of reading it

I asserted `App` (16/17) was "a route switch" and recommended leaving it on that basis. It is not —
it is a sequence of independent responsive-layout effects (`matchMedia` + two `ResizeObserver`s).
The recommendation happened to survive, the reasoning did not.

**Rule: if a verdict rests on what the code *is*, open the file first.**

### 6. Repeated a `git mv` folk belief

I endorsed an agent's claim that `git mv` makes "history follow." **Git does not store renames at
all** — `git mv` is `mv` + `git add` + `git rm`, and rename detection happens at display time from
content similarity. Then I compounded it by estimating rename-detection risk from *byte* ratios and
predicting `Select` would lose its history. Git detected every rename, and matched each old file to
whichever new file kept more of its **lines** — for four components that is the `.hooks.tsx`, not
the `.tsx`. So `git log --follow Select/Select.hooks.tsx` works and `Select/Select.tsx` does not,
which is the opposite of what I told the owner.

**Rule: verify tooling beliefs against the tool, and use line-based similarity, not file size.**

### 7. Under-rated a target using the unverified number

Because the bad table listed `handlePanelKeyDown` at 11/23, I told agent E to leave it mostly alone
as "an unavoidable key switch." It measures **16/15 — the highest-scoring function in its folder**,
and cognitive 15 alongside cyclomatic 16 means the weight is *not* the switch (a flat switch scores
low cognitive). Reading it showed the load sits in per-case conditionals, chiefly the `Tab` case's
focus-walking block. Bad input produced bad guidance, then the guidance sounded principled.

### 8. Under-used the agents' own judgement

Three of the corrections above came from subagents pushing back, not from me: the metric
discrepancy (E), the non-existent hooks (A), and the better seam rule — one seam per *reachable*
boundary, no nested overrides (B). Every one of them was right.

**Rule: brief agents to challenge the brief, and mean it.** Ask for reasoning when they decline
something rather than treating a decline as under-delivery. Require a *paraphrase* rather than an
"ack" — one agent went silent through an entire round and its work was invalid under AGENTS.md
§Delegated Agent Bootstrap until it confirmed the persona load.

### What went right, worth keeping

- **Per-file negative verification** (break an assertion, confirm *that file* fails, revert) caught
  nothing broken this pass but is the only reason "235 passing" means anything after a mass move.
- **Hunk-level staging** kept another session's uncommitted feature out of the refactor commit.
- **Worktree verification** proved the commit builds standalone rather than assuming it.
- **Measuring agent claims rather than accepting them** is what surfaced the `useSettingsSlice`
  no-op that a hand-estimate had reported as ~12/~12.

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
