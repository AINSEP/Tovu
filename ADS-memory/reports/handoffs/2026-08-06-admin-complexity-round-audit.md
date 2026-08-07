# Handoff — apps/admin complexity round, and how to audit it for regressions

**Written:** 2026-08-06 (session end)
**Branch:** `refactor/jini-admin-extraction`
**Baseline commit:** `34a7936` — the last commit before this round
**Head at writing:** `9b37ccf` — 57 commits later
**Nothing pushed.** All commits are local.

Saved here rather than `.local-artifacts/`, which is gitignored.

---

## 1. How to run the diff audit

Git carries the complete change set. One command gives you everything this round touched:

```bash
git diff 34a7936..HEAD -- apps/admin/src
```

**93 files, +9,693 / −2,505.** Useful narrowings:

```bash
# just source, no tests — the part where a regression could hide
git diff 34a7936..HEAD -- apps/admin/src ':!*__tests__*'

# per-commit, with files, in order
git log --oneline --name-only 34a7936..HEAD -- apps/admin/src

# only files whose SOURCE changed (excludes the 12 new test files)
git diff --name-status 34a7936..HEAD -- apps/admin/src ':!*__tests__*'

# one feature at a time — this is the practical way to read 9,693 lines
git diff 34a7936..HEAD -- apps/admin/src/features/users
```

**What to expect the diff to look like, so a normal result isn't mistaken for a problem.**
Almost every change is extract-method: a block moves out of a function into a new top-level
function or component in the same file, and the original call site becomes one line. So the diff
shows large deletions paired with large additions of near-identical text at a different indent
level. `git diff -w` (ignore whitespace) makes the genuine changes much easier to see, because
de-nesting changes the indentation of every moved line.

**What a real regression would look like:** a moved block whose *conditions* changed — an inverted
guard, a dropped `?? default`, a `&&` that became `||`, an early return that moved above a side
effect. Read the moved code against its original, not the surrounding structure.

**Known false alarm:** four components had file-private sub-components promoted to `export`. That
is deliberate (see §4) and widens the module surface without changing behavior.

---

## 2. Verification state at handoff

| check | result |
|---|---|
| `npx tsc -p apps/admin/tsconfig.json --noEmit` | **0 errors** |
| scoped vitest over every touched area (45 files) | **785 / 785 passing** |
| functions over **15** (the repo's own `npm run complexity` bar) | **2**, both documented artifacts |
| functions over **10** | 7 |
| functions over **9** | 10 |
| baseline: functions over 10 at `34a7936` | **46** |

Re-measure at any time — do not trust the numbers above:

```bash
npx eslint --no-error-on-unmatched-pattern --format json \
  --rule '{"complexity":["warn",0],"sonarjs/cognitive-complexity":["warn",0]}' \
  apps/admin/src
```

Threshold `0` makes every function report its exact score instead of only violations. ESLint
reports at *greater than* max, so threshold 9 flags everything at 10 and above.

---

## 3. The six documented exemptions — audit these first

Each is a deliberate decision not to refactor, with reasoning in the code. All six were checked
adversarially by an independent agent; two others were **disproved by measurement** during that
audit and subsequently fixed, so the survivors have been through a real filter.

| symbol | file:line | score | why |
|---|---|---|---|
| `selector` | `features/posts/PostEditor.tsx:28` | 27 / ~0 | flat 13-entry `editor?.isActive(…) ?? false` object literal; zero control flow. Splitting it breaks `useEditorState`'s single-selector re-render batching. |
| `SeoEntryPanel` | `features/seo/Seo.tsx:97` | 25 / 6 | 11 form fields, each `fieldValue(key, resolved.X ?? d) ?? d`; 20 of 25 points are flat non-nesting `??`. |
| `translateRunAgentPayload` | `lib/assistant-transport.ts` | 12 / 3 | flat switch over a closed union; a lookup table loses TS exhaustiveness. **Cyclomatic axis only** — its cognitive half was disproved and fixed (11 → 3). |
| `saveWithRetry`'s hook | `hooks/use-assistant-chats.hooks.ts` | see file | whole-hook aggregate under the owner's tool, not ESLint. |
| `useSettingsSlice` | `hooks/use-settings-slice.hooks.ts` | see file | same shape. |
| `handlePanelKeyDown` | `components/Select/Select.hooks.tsx:359` | 13 / 8 | flat switch over 7 keys; cyclomatic counts `case` labels, cognitive (8) confirms no nesting. |
| `AssistantDock` | `components/AssistantDock/AssistantDock.tsx:183` | 10 / 2 | 5 DI-seam default params + 3 unnested fallbacks. See §5. |

Find them all with:

```bash
git grep -n "EXEMPTION\|@complexityExemption" -- apps/admin/src
```

**Two exemptions were wrong and were caught by measurement, not argument.** `saveWithRetry` claimed
"no flatter shape exists"; a probe split it into `attemptSave` at 6/7 + a 4/5 loop.
`translateRunAgentPayload` blamed its cognitive score on the `mcp-ui`/`a2ui` cases, which are
one-line unwraps — extracting the `usage` case's field parsing dropped it 11 → 3. If you doubt an
exemption, build the probe; the argument is not the evidence.

---

## 4. Behavior-affecting changes — the short list worth reading closely

Everything else is structural. These are not:

1. **`9f094bc`** — `features/users/hooks/use-users.hooks.ts`. A prior stopped session's
   negative-verification (break assertion → confirm → revert) never reached "revert" and left
   `// BROKEN FOR NEGATIVE VERIFICATION` in the tree with `setResetPasswordFor(null)` /
   `setNewPassword("")` deleted, so the password-reset dialog no longer closed on success. **This
   was committed by me in the salvage pass and found by an agent.** Restored; 23/23.
2. **`f9ea8ab` + `9b37ccf`** — `features/settings-raw/rules.ts`. An if-chain→lookup-table conversion
   indexed `STATIC_ERROR_MESSAGES[e.code]` where `ApiError.code` is `code?: string`. TS2538, and it
   changed which operation carries the no-code case: `===` against an absent code is merely false,
   indexing is a type error. Guarded, then the missing test written and negative-verified.
3. **`b2b0a10`** — `features/ai-assistant/__tests__/AiAssistant.unit.test.tsx`. Four failing tests;
   verdict was **stale test, correct source**. The roadmap moved behind a SettingsDialog tab in
   `6c54aaf` (2026-08-04) — *not* `197bfe8` as the earlier handoff claimed; that commit carried only
   a 0-diff path rename. Test now clicks the tab first.
4. **Four modules gained `export`s** on previously file-private sub-components, so they could be
   directly unit-tested. Rule settled mid-round: **export when it is the only way to reach a branch
   nothing tests; leave private when the parent's tests already drive it.**
5. **`ae40f7c`** — `features/pages/README.md` said *"There is no `PageEditor`."* False:
   `panels.tsx:8` imports it, `panels.tsx:120` renders it at `/admin/pages/{pageId}`. That sentence
   is why the file had zero tests.

---

## 5. Two measurement facts that will save the next session hours

**Default parameters cost cyclomatic complexity here.** Each default-parameter construct is **+1
cyclomatic** under this ESLint config, independent of any branching — so `{ x = a, y = b }: Props = {}`
costs 3. `apps/admin/INFO.md` §Components *mandates* that shape as the injectable-hook DI seam, so
**any component following the convention starts near cyclomatic 5 before a line of logic.**
Confirmed independently from two directions: a probe on `Pages`/`Posts`, and `AssistantDock`
measuring 10/2 with 5 points traced to its seam params. Cognitive stays ~0, which is the tell.

The fix that works is a named top-level helper absorbing the repeated fallbacks (`orEmpty`), not an
exemption — it took `targetForKind` and `MenuItemTargetFields` from 10/1 to 5/1 each.

**There are two complexity metrics in play and they disagree by design.** ESLint scores every nested
closure in its own scope; the owner's tool rolls them into the enclosing hook. `useSelectDropdown`
reads 2/0 under one and 37/56 under the other. **Only extraction to a top-level function or a
sibling module lowers both** — a `const doThing = () => {}` declared inside the hook lowers the
ESLint number and nothing else. Proof: an earlier pass extracted a closure from
`use-settings-slice.hooks.ts` and the file's cognitive total went 25 → 25.

Structural consequence, unresolved: if the aggregate view rolls every closure into the hook, any
hook with enough closures fails it regardless of how well decomposed it is internally, unless split
across files. That is a question about the metric, not about the code.

---

## 6. What is unfinished

- **The whole-hook pass on `useUsers` / `useRoles` / `useTaxonomy`** was stopped mid-flight. Its
  partial work is committed in **`878fdb5`**, labelled `wip:`, 248 insertions across 4 files. It
  typechecks and its tests pass — extract-method is incremental, so a partial state is coherent, not
  broken. It is simply not where that agent was aiming. Targets the owner-tool metric (18/25, 17/24,
  10/18), which ESLint does not show.
- **Three targets the owner explicitly chose to leave**, all one point over ≤9 and all comfortably
  inside the ≤15 bar the owner later set as good enough: `AdminExecutionMode` 10/5,
  `runVisitorTestConnection` 10/5, `save` (in `use-widget-instance-editor.hooks.ts`) 9/10.
- **`App.tsx` at 13/12 was never dispatched.** Another session's uncommitted sidebar-accordion work
  lives in it (`App.tsx`, `panels.tsx`, `styles.css`, `nav-wiring.unit.test.ts`, and the untracked
  `sidebar-accordion-css.unit.test.ts`). Do not sweep those into a commit.
- **Proposed, not done:** `lib/api.ts`'s `request()` returns the generic `request failed (500)` when
  a response has no parseable JSON body. That is the signature of a Vite-proxy/network failure, and
  a 500 misleadingly asserts a server exists. Suggested message: *"cannot reach the Tovu API — is
  the server running?"* This cost a real debugging hour today.
- **Known pre-existing failure, unrelated:** `features/comments/__tests__/Comments.unit.test.tsx`'s
  first test hangs on "Loading comments…" — a fetch-mock ordering race, proven to predate this round
  by stashing only the round's changes.

---

## 7. Process facts worth carrying forward

- **`git add <path>` does not scope a commit.** A bare `git commit` snapshots the whole index,
  including another agent's staged files. This misattributed two agents' work
  (`4cbe254` carries `Database.tsx`; `fec105b` carries `Taxonomy.tsx`). Content is intact in both.
  Use `git commit <paths> -F <msgfile>` — and note it fails on untracked files, so `git add` those
  first.
- **A message send reporting success does not mean it arrived.** Three of seven agents never
  received the message that tightened the acceptance bar; one discovered it by reading siblings'
  commit messages in `git log`. Require a paraphrase back for anything that changes the definition
  of done.
- **Negative verification has three steps and the third one has no forcing function.** Break,
  confirm, *revert*. An interruption between steps 2 and 3 leaves the codebase broken and looking
  finished — see §4 item 1.
