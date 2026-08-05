# Admin Complexity Audit — functions scoring over 10 (cyclomatic or cognitive)

- Date: 2026-08-05
- Agent: Refactor (propose-only — no source files edited)
- Scope: `apps/admin/src/features`, `apps/admin/src/hooks`, `apps/admin/src/lib`, `apps/admin/src/components`
- Ranking metric: **per-function `max(cyclomatic, cognitive)`**, descending. Whole-file totals are reported separately (Section 0) and are **not** the ranking key — a file can have a huge total from having many small functions (see `lib/api.ts`) without containing any single over-threshold function.

## 0. Method, tool, and the file-count cross-check

**Tool:** ESLint 10.8.0 + `typescript-eslint` 8.65.0 (parser) + `eslint-plugin-sonarjs` 4.2.0, run directly against the repo's own `eslint.config.mjs` rule set (`complexity` = cyclomatic, `sonarjs/cognitive-complexity` = cognitive), both thresholds overridden to `0` via `--rule` on the CLI so **every** function reports a value instead of only violations — this is what makes an accurate whole-file total possible (a function with cyclomatic 1 and cognitive 0 never appears in a normal lint run at threshold 15, but still needs to be summed).

```
npx eslint --no-error-on-unmatched-pattern --format json \
  --rule '{"complexity":["warn",0],"sonarjs/cognitive-complexity":["warn",0]}' \
  apps/admin/src/features apps/admin/src/hooks apps/admin/src/lib apps/admin/src/components
```

Per-function cyclomatic and cognitive messages were paired by `(line, column-order)` and parsed with a script (not eyeballed) into 1,746 non-test function records. `__tests__/` files were parsed too but excluded from ranking and totals per the brief; they are not separately reported below because none scored over 10 on either metric.

**File-count cross-check** (the trap this brief called out by name):

| | on disk | parsed by ESLint |
|---|---|---|
| `.ts` | 175 | — |
| `.tsx` | 76 | — |
| `.ts` + `.tsx` | **251** | **251** |
| `.md` (READMEs, correctly not linted) | 26 | 0 |
| **Total files in scope** | **277** | **251 code files + 26 non-code** |

Zero parse errors. (Two tools were tried and discarded before this one — see "tooling notes" at the end — one of them silently failed to parse a single `.ts`/`.tsx` file in this repo, which is exactly the failure mode flagged as most dangerous. Confirming the 251/251 match here is the check that would have caught it.)

## 1. The over-10 table (43 functions, non-test)

| File | Function | Cyc | Cog | What makes it complex |
|---|---|---:|---:|---|
| `features/ai-assistant/AiAssistant.tsx:293` | `VisitorCredentialForm` | 34 | 17 | ~20 ternary/`&&` expressions inline in JSX choosing status copy, disabled state, and placeholder text for one form. Real, single-function complexity (not distributed nested-arrow attribution) — see §3. |
| `features/posts/PostEditor.tsx:27` | `Toolbar`'s `selector` (useEditorState) | 27 | 0 | Flat object literal, 13 fields each using `?? false`. See §3 — flagged as a measurement peculiarity, not real branching. |
| `features/collections/CollectionEntryEditor.tsx:39` | `DynamicField` | 10 | 25 | 5-way nested ternary chain picking an `<input>` by `field.kind`; each branch nests inside the previous one's `else`, which is why cognitive (25) dwarfs cyclomatic (10). |
| `features/seo/Seo.tsx:97` | `SeoEntryPanel` | 25 | 6 | ~12 flat, independent `label`/`input` blocks each with a `?? ""`/`?? false` fallback. See §3. |
| `hooks/use-assistant-chats.hooks.ts:97` | `saveWithRetry` (async) | 10 | 23 | Genuine: retry loop with nested `try/catch`, multiple exit branches (`permanent`/`exhausted`/`missing`/`saved`) and a backoff `await` inside the loop. |
| `features/recovery/Recovery.tsx:165` | `RestoreFlow` | 20 | 22 | 4-step wizard (`idle`/`planned`/`confirmed`/`done`) rendered as sequential `step === "x" ? (...) : null` blocks plus per-step conditionals inside each. |
| `features/collections/CollectionEntryEditor.tsx:136` | `CollectionEntryEditor` | 21 | 19 | Top-level screen component: load guards, dirty checks, extension-field loop, term picker wiring. |
| `features/forms/FormEditor.tsx:486` | `FormEditor` | 21 | 19 | Same shape as above — top-level screen component with load guards + field list + save/dirty branches. |
| `features/comments/rules.ts:100` | `buildSettingsPatch` | 20 | 13 | 6 independent field-diff blocks (parse raw form value, validate, compare to current, conditionally patch), each ~4 lines, not nested. |
| `features/users/Users.tsx:43` | `Users` | 19 | 16 | Top-level screen component: filters, table, row-expansion state, bulk actions. |
| `features/roles/Roles.tsx:36` | `Roles` | 18 | 10 | Top-level screen component: policy list + inline edit mode. |
| `lib/execution-settings.ts:154` | `loadExecutionConfig` (async) | 18 | 15 | Multi-source config resolution (env/site/default) with fallback branches at each source. |
| `features/media/hooks/use-media-lightbox.hooks.ts:65` | anonymous arrow (inside `useEffect`) | 9 | 17 | Genuine — imperative dialog open/close sync with nested `if`/`else` per branch. Not a JSX-render callback; see §3. |
| `lib/assistant-transport.ts:73` | `translateRunAgentPayload` | 17 | 11 | Payload-shape dispatch (multiple event kinds → normalized shape), each with its own guard. |
| `components/Select.tsx:306` | `handlePanelKeyDown` | 16 | 15 | Keyboard-interaction handler — one big `switch`/`if` ladder over key codes with different behavior per open/closed state. |
| `lib/assistant-transport.ts:266` | `readSseFrames` (async generator) | 8 | 16 | SSE byte-stream parsing state machine (partial-frame buffering) — genuine. |
| `features/database/Database.tsx:193` | `MigrateForwardSection` | 15 | 15 | Multi-phase migration UI (idle/running/error/done) similar shape to `RestoreFlow`. |
| `features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts:322` | `runTestConnection` (async) | 14 | 10 | Network call + multi-branch result classification (ok/error/network-fail/aborted). |
| `features/comments/Comments.tsx:39` | `QueueSection` | 10 | 14 | Queue list rendering with per-row action-availability conditionals. |
| `features/dashboard/Dashboard.tsx:25` | `Dashboard` | 14 | 13 | Widget-grid assembly with per-widget availability/loading conditionals. |
| `features/widgets/WidgetInstanceEditor.tsx:43` | `WidgetInstanceEditor` | 14 | 11 | Widget-type-specific field rendering + save/dirty branches. |
| `features/comments/rules.ts:69` | `commentRowMenuItems` | 13 | 10 | Menu-item list built from ~6 independent permission/state checks. |
| `features/posts/PostEditor.tsx:113` | `PostEditor` | 13 | 11 | Top-level screen component: load guard, publish/save branch, delete confirm. |
| `features/roles/Roles.tsx:200` | anonymous arrow (`.map` row renderer) | 13 | 13 | JSX-render-callback artifact — see §3. |
| `features/seo/Seo.tsx:235` | `Seo` | 13 | 7 | Tab/section assembly with per-section availability checks. |
| `features/settings-raw/rules.ts:281` | `describeApiError` | 9 | 13 | Error-code → message chain (many equality branches, low nesting). |
| `features/taxonomy/Taxonomy.tsx:130` | `MergeTermSection` | 13 | 13 | Merge-flow UI, same step-based shape as `RestoreFlow`. |
| `lib/assistant-transport.ts:405` | `startRun` (async method) | 13 | 10 | Transport-selection + error-mapping branches. |
| `lib/assistant-transport.ts:355` | anonymous async arrow (SSE consumer IIFE) | 10 | 13 | Genuine — `for await` frame loop + `try/catch` classifying abort vs. real error. |
| `lib/fetch-query/adapter.tanstack.tsx:76` | `useFetchQuery` | 10 | 13 | Adapter branching over query-state shape (loading/error/success/stale). |
| `features/media/Media.tsx:424` | `Media` | 12 | 8 | Top-level screen component: upload state + grid + lightbox wiring. |
| `features/members/Members.tsx:86` | anonymous arrow (`.map` row renderer) | 9 | 12 | JSX-render-callback artifact — see §3. |
| `features/menus/MenuEditor.tsx:44` | `ItemRow` | 12 | 4 | Recursive tree-row renderer (drag handles, nesting depth, expand/collapse) — flat conditions, low nesting. |
| `features/posts/PostEditor.tsx:24` | `Toolbar` | 12 | 11 | Toolbar button grid — one condition per formatting command's active state (mostly template-literal `? "on" : ""`, low individual weight, many of them). |
| `hooks/assistant-chats-dependencies.hooks.ts:142` | `saveMessage` (async method) | 12 | 10 | Persistence call with retry/error-classification branches, same shape as `saveWithRetry`. |
| `lib/widget-embed-extension.tsx:40` | `WidgetEmbedNodeView` | 12 | 10 | TipTap node-view render with per-widget-type branches. |
| `components/Select.tsx:381` | `Select` | 11 | 11 | Top-level combobox component: open state, filtering, keyboard delegation wiring. |
| `features/collections/Collections.tsx:331` | `Collections` | 11 | 8 | Top-level screen component: list + filters + create flow. |
| `features/integrations/Integrations.tsx:25` | `Integrations` | 11 | 10 | Top-level screen component: connection list + per-integration state. |
| `features/posts/rules.ts:76` | `handleImageDrop` | 11 | 5 | Drag-event → file-type dispatch, flat conditions. |
| `features/roles/rules.ts:28` | `describeApiError` | 8 | 11 | Error-code → message chain, same shape as `settings-raw/rules.ts`'s. |
| `features/users/Users.tsx:174` | anonymous arrow (`.map` row renderer) | 11 | 11 | JSX-render-callback artifact — see §3. |
| `features/users/rules.ts:21` | `describeApiError` | 8 | 11 | Error-code → message chain, same shape (third copy — see §4 dedup note). |

## 2. Whole-file totals (top 20 by cyclomatic+cognitive sum, non-test)

| File | Σ Cyc | Σ Cog | # fns | Note |
|---|---:|---:|---:|---|
| `lib/api.ts` | 234 | 27 | 142 | **Not a hotspot** — wide, not deep. 142 tiny API-wrapper functions averaging cyc 1.6 each; nothing in it appears in the over-10 table. |
| `lib/assistant-transport.ts` | 102 | 73 | 27 | 4 of its functions are individually over-10 (see table) — a genuine concentration, not just fan-out. |
| `components/Select.tsx` | 108 | 63 | 33 | 2 functions over-10 (`handlePanelKeyDown`, `Select` itself); rest is a long tail of small handlers. |
| `hooks/use-assistant-chats.hooks.ts` | 87 | 52 | 41 | 1 function over-10 (`saveWithRetry`); otherwise a wide hook file. |
| `features/forms/FormEditor.tsx` | 84 | 38 | 39 | 1 function over-10 (`FormEditor` itself, 21/19). |
| `features/collections/CollectionEntryEditor.tsx` | 64 | 54 | 19 | 2 functions over-10 in a 19-function, 255-line file — real concentration. |
| `features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts` | 78 | 30 | 30 | 1 function over-10. |
| `lib/execution-settings.ts` | 72 | 36 | 22 | 1 function over-10. |
| `features/posts/PostEditor.tsx` | 80 | 24 | 27 | 3 functions over-10 in one 307-line file. |
| `features/settings-raw/Settings.tsx` | 67 | 32 | 26 | **No single function over 10** — flagged for completeness only, not in §1. |
| `features/taxonomy/Taxonomy.tsx` | 62 | 34 | 20 | 1 function over-10. |
| `features/seo/Seo.tsx` | 73 | 21 | 20 | 2 functions over-10 out of 414 lines. |
| `features/ai-assistant/AiAssistant.tsx` | 61 | 27 | 12 | 1 function carries most of the file's total (34/17 of 61/27) — highest single-function concentration in the audit. |

`Settings.tsx` is the one file that shows up high in the whole-file ranking but has nothing in the per-function over-10 table — its total comes from many mid-size functions (5–9 each), not one outlier. Worth a look eventually but it's not what this brief asked for.

## 3. Artifact flags

Four entries in §1 are flagged as measurement artifacts, and one is a class-wide caution — read these before triaging §4:

1. **`PostEditor.tsx:27` `selector` (cyc 27, cog 0)** and **`Seo.tsx:97` `SeoEntryPanel` (cyc 25, cog 6)** — both are a flat sequence of independent `?? fallback` / `?.` expressions with no nesting. ESLint's `complexity` rule counts every `??`/`?.`/`&&`/`||` as its own decision point, so 13 sibling `field ?? false` entries in one object literal score as cyclomatic 27 even though there is no actual control flow to reason about — you read it top to bottom once. Cognitive complexity (which discounts flat, non-nested sequences) agrees: 0 and 6. **Treat cognitive complexity as the true signal for these two; the cyclomatic score is inflated by operator-counting, not branching.** Not a refactor target as-is, though `SeoEntryPanel`'s 12 near-identical `<label><input .../></label>` blocks are a legitimate *duplication* target (Type B), independent of complexity.

2. **`Roles.tsx:200`, `Members.tsx:86`, `Users.tsx:174` — anonymous `.map()` row-renderer arrows (cyc 9–13, cog 11–13 each).** This is the trap named in the dispatch: each is a nested arrow function inside a parent component (`Roles`, `Members`, `Users` — all *also* separately over-10 in the same file), and ESLint scores it independently of its parent. Reading the two numbers together (e.g. `Users` component 19/16 *and* its row-map arrow 11/11) risks double-counting one screen's complexity as if it were two unrelated problems. It isn't an artifact in the sense of "not real" — the row markup genuinely has per-cell conditional rendering — but it **is** the same underlying complexity as its parent component's table section, just attributed to a different AST node. The correct read: these three files each have *one* real problem (an inline, unnamed table-row renderer doing too much), reported as two numbers.

3. **`AiAssistant.tsx:293` `VisitorCredentialForm` (cyc 34, cog 17) is the opposite case — explicitly *not* an artifact.** All ~20 branch points are inline `? :`/`&&` in the *same* function body, not distributed across nested arrows (its own inline `onClick` handlers are trivial cyc-1 and reported separately, correctly). 34 is a real, single-function number.

4. **General caution for whole-file diffing** (not triggered by this snapshot, since this is a single point-in-time audit, not a before/after): the earlier-agent failure mode described in the dispatch — reporting one nested arrow's complexity delta as "the" regression while the file total moved the opposite direction — only manifests when comparing two snapshots. This report has no baseline to diff against (working tree is mid-refactor, ~200 uncommitted paths, HEAD is explicitly not the baseline per the brief), so no before/after comparison is made anywhere above.

## 4. Ranked refactor proposal (top 10 genuine hot spots)

Ranked by genuine complexity (artifacts from §3 demoted/excluded). Format follows `refactor-patterns/SKILL.md`.

---
```
ID:           REF-101
Type:         C — Oversized Unit
Priority:     High
Affected:     apps/admin/src/features/ai-assistant/AiAssistant.tsx:293-509 (VisitorCredentialForm)

Finding:
Single function, cyclomatic 34 / cognitive 17, ~217 lines. Complexity is concentrated in
inline ternary/&& chains computing (a) button disabled state, (b) status-line copy
(5-way mutually exclusive text choice repeated 3x for discovery/save/masked-placeholder),
and (c) the apiKeyPlaceholder derivation. All of it is presentation logic with no JSX
structure of its own — it decides WHAT STRING to show, not how to lay it out.

Proposed Fix:
Extract three pure functions into this feature's rules.ts (which already exists and holds
describeApiError for the same screen):
  - deriveSaveStatusCopy(saveState, dirty, stored): string | null
  - deriveDiscoveryStatusCopy(discovery): string | null
  - isSaveDisabled(dirty, saveState, config): boolean
Component body becomes `{deriveSaveStatusCopy(saveState, dirty, stored)}` etc. — same
render output, zero behavior change. No JSX restructuring.

Risk Assessment:
Low. Each extracted function is a pure string/boolean derivation already exercised by
AiAssistant.unit.test.tsx's existing state-transition tests (test asserts on rendered
text/disabled attributes, which is unaffected by where the logic that produces them lives).

Tests Required Before Refactor:
- Confirm apps/admin/src/features/ai-assistant/__tests__/AiAssistant.unit.test.tsx
  currently covers: saving/saved/idle+dirty/idle+!dirty+stored/idle+!dirty+!stored (5 states)
  and the disabled-button conditions. If any of the 5 status-copy branches is untested,
  add that case first — this function is exactly the kind of thing that regresses
  silently under a partial-coverage refactor.

Estimated Blast Radius:
2 files (AiAssistant.tsx, rules.ts). No prop/contract changes. No architecture boundary.

Route Recommendation:
Programmer to implement (once TestRunner confirms the 5-state matrix is covered).
```

---
```
ID:           REF-102
Type:         C — Oversized Unit / F — Complexity Debt
Priority:     High
Affected:     apps/admin/src/features/collections/CollectionEntryEditor.tsx:39-79 (DynamicField)

Finding:
Cyclomatic 10, cognitive 25 — the widest cyc/cog gap in the audit, because it's a 5-way
ternary chain (text/integer/real/boolean/datetime) where each branch nests inside the
previous branch's `else`. Cognitive complexity penalizes that nesting heavily; a
functionally identical switch/lookup would not.

Proposed Fix:
Replace the ternary chain with a lookup table keyed on field.kind:
  const INPUT_BY_KIND: Record<FieldKind, (props) => JSX.Element> = { text: ..., integer: ..., ... }
  return INPUT_BY_KIND[field.kind](props)
or an equivalent switch statement (switch cases are siblings, not nested, so cognitive
complexity drops close to the branch count — around 5 — with cyclomatic unchanged).
Purely structural; the JSX inside each branch is copied verbatim.

Risk Assessment:
Low. No branch's rendered output changes. The `field.required` label and inputId
plumbing sit outside the branches and are untouched.

Tests Required Before Refactor:
CollectionEntryEditor.unit.test.tsx exists — confirm it renders at least one field of
each of the 5 kinds before refactoring (five is a small, cheap thing to verify/add).

Estimated Blast Radius:
1 file. No contract changes.

Route Recommendation:
Programmer to implement. Cheap, mechanical, good first pick.
```

---
```
ID:           REF-103
Type:         C — Oversized Unit
Priority:     Medium-High
Affected:     apps/admin/src/features/recovery/Recovery.tsx:165-308 (RestoreFlow)
              apps/admin/src/features/database/Database.tsx:193-... (MigrateForwardSection)
              apps/admin/src/features/taxonomy/Taxonomy.tsx:130-... (MergeTermSection)

Finding:
Three separate features share one shape: a `step === "x" ? (...) : null` sequential
block renderer for a linear wizard (idle → planned/running → confirmed → done), each
scoring 13-22 on both metrics. Same root cause in all three, worth proposing together
even though they're in different files (same fix pattern, not a shared abstraction yet).

Proposed Fix:
Per file, split each step's JSX block into its own small named function/component
(e.g. RestoreFlow: <IdleStep/>, <PlannedStep/>, <ConfirmedStep/>, <DoneStep/>) and
select with a switch on `step` instead of four sequential `step === "x" ? : null`
checks. Do NOT unify the three files into one shared "wizard" component in this pass —
that's a structural/DRY call for a separate Type B (Duplication) proposal after
someone confirms the three step-machines are actually the same shape and not
coincidentally similar; mixing that with this Type C split would violate "one refactor
type per change."

Risk Assessment:
Medium. Recovery.tsx has no test file at all (see below) — this one needs coverage
added first, not just verified.

Tests Required Before Refactor:
- Recovery.tsx: NO TEST FOUND. Route through Coordinator as untestable-coupling /
  coverage-gap before this one is touched — do not refactor RestoreFlow without tests.
- Database.tsx: MigrateForwardSection itself has no direct test, but
  use-migrate-forward-section.unit.test.ts covers the underlying hook. The render
  split is lower-risk here since state logic is already isolated and tested.
- Taxonomy.tsx: Taxonomy.unit.test.tsx exists at the screen level — confirm it
  exercises all of MergeTermSection's steps before splitting.

Estimated Blast Radius:
3 files, done independently. No contract changes in any.

Route Recommendation:
Database.tsx and Taxonomy.tsx: Programmer, in either order, independently.
Recovery.tsx: Coordinator decides TDD-first (add tests) before Programmer touches it —
per Refactor Agent guardrails, this one is currently "do not refactor" as filed.
```

---
```
ID:           REF-104
Type:         C — Oversized Unit
Priority:     Medium
Affected:     apps/admin/src/hooks/use-assistant-chats.hooks.ts:97-127 (saveWithRetry)

Finding:
Cyclomatic 10, cognitive 23 — genuine nested complexity (for-loop + try/catch + 4
distinct outcome branches + a backoff await), not an artifact. The classification
logic (which error type maps to which SaveOutcome) is entangled with the retry
timing/looping mechanics in one function.

Proposed Fix:
Extract the decision "given this error and this attempt state, what should happen
next" into a pure function separate from the loop that performs the actual waiting:
  classifyRetryStep(error, attempt, isDisposed): 
    | {outcome: "saved"} | {outcome: "permanent"} | {outcome: "exhausted"}
    | {outcome: "missing"} | {outcome: "retry", delayMs: number}
`saveWithRetry` becomes a loop that calls this and either returns or awaits the delay —
same behavior, but the branching (currently cognitive 23) moves into a function with no
loop/await around it, which is both lower complexity and independently unit-testable
without fake timers.

Risk Assessment:
Low-medium. Well covered already (use-assistant-chats.unit.test.ts exists) — this is
exactly the kind of function that benefits from the extraction (decision logic becomes
directly testable without needing to drive the retry loop's real timing).

Tests Required Before Refactor:
Confirm existing tests cover all 4 outcomes (saved/permanent/exhausted/missing) plus
the isDisposed-mid-backoff race — if isDisposed timing isn't covered, add it first,
since that's the branch most likely to regress silently.

Estimated Blast Radius:
1 file. No exported contract change (SaveOutcome and function signature unchanged).

Route Recommendation:
Programmer to implement.
```

---
```
ID:           REF-105
Type:         C — Oversized Unit
Priority:     Medium
Affected:     apps/admin/src/features/roles/Roles.tsx:200 (row-map arrow)
              apps/admin/src/features/members/Members.tsx:86 (row-map arrow)
              apps/admin/src/features/users/Users.tsx:174 (row-map arrow)

Finding:
See §3.2 — each is an anonymous `.map()` callback rendering one table row with
several per-cell ternaries (edit-mode toggling, expand/collapse, action buttons).
Each parent screen component (Roles/Members/Users, all also independently over-10)
and its row-renderer are really one over-sized "table section" split by ESLint's
per-function scoring into two numbers.

Proposed Fix:
Extract each into a named row component: <PolicyRow policy .../>, <MemberRow
member .../>, <UserRow user .../>. This both gives the anonymous arrow a name (so a
future complexity report attributes it correctly) and is a standalone, independently
testable unit — the current `.unit.test.tsx` suites drive these purely through the
parent, which is more expensive to isolate a single-row regression in.

Risk Assessment:
Low. Pure extraction — props are already fully determined at the call site
(policy/member/user + the small set of callbacks each row needs).

Tests Required Before Refactor:
Roles.unit.test.tsx, Members.unit.test.tsx, Users.unit.test.tsx all exist and render
the table — sufficient as a before/after regression check for a pure extraction; no
new tests strictly required, though a row-level test post-extraction is cheap value.

Estimated Blast Radius:
3 files, independent, low risk each.

Route Recommendation:
Programmer to implement. Good "batch of three small wins" ticket.
```

---
**REF-106 through REF-110** (brief entries — same pattern repeats, full proposal available on request):
- `CollectionEntryEditor` (component, cyc21/cog19) and `FormEditor` (cyc21/cog19): both are top-level screen components mixing load-guard branches with field-list rendering. Proposed fix: extract the load-guard preamble (`if (!entry) return ...`) into a shared `<ScreenGuard>` wrapper or early-return hook pattern already used elsewhere in this codebase (check `hooks/` for precedent before inventing a new one) — Type C, Low-Medium risk, both have test coverage.
- `Select.tsx`'s `handlePanelKeyDown` (cyc16/cog15): keyboard-event switch ladder — natural fit for a lookup table keyed on `event.key`, same pattern as REF-102. Tested (Select.unit.test.tsx).
- `assistant-transport.ts` (4 over-10 functions in one file: `translateRunAgentPayload`, `readSseFrames`, `startRun`, the SSE-consumer IIFE): genuine transport-layer complexity, already tested (`assistant-transport.transcript.test.ts`, `assistant-transport.a2ui.test.ts`). Lowest priority of the batch — this is exactly the kind of file where complexity is closer to inherent (parsing a streaming wire protocol) than accidental; a decomposition pass here should be scoped carefully rather than mechanically split.
- Three near-identical `describeApiError` functions (`settings-raw/rules.ts:281`, `roles/rules.ts:28`, `users/rules.ts:21`, cog 11-13 each): flagged as Type B (Duplication) as much as Type F (Complexity) — worth checking whether these three error-code-to-copy maps are actually identical or have drifted, which would make them a single shared-utility extraction rather than three separate complexity fixes. Recommend a follow-up Refactor pass scoped specifically to this, since mixing a dedup proposal into a complexity-reduction proposal would violate "one refactor type per change."

## Tooling notes (for whoever runs this audit again)

- **`eslintcc` (v0.8.3) does not work in this repo — do not use it.** It parses with plain
  Espree and has no config/parser override flag. It failed with `Parsing error: The keyword
  'import' is reserved` on every single `.ts`/`.tsx` file tested, including plain (non-JSX)
  `.ts`. This is the silent-failure trap named in the dispatch, except it wasn't silent here
  — it errors loudly per file with an `F` rank — but a less careful run filtering only
  `-gt=e` (greater-than-E) output could plausibly have missed that every file was an error,
  not a clean pass. Ruled out before any numbers were trusted.
- **What worked:** the repo's own `eslint.config.mjs` already wires `typescript-eslint`'s
  parser + `complexity` + `sonarjs/cognitive-complexity` at threshold 15 (see the `complexity`
  npm script) — this audit reused that exact rule/parser pairing, only overriding the
  threshold to 0 so ungated functions report too. No new dependencies were installed.
