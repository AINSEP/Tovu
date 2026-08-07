# Shared brief — apps/admin complexity ceiling pass

**Read this in full before touching code.** Every rule here cost a real run in the previous
attempt (see `ADS-memory/reports/handoffs/2026-08-06-admin-complexity-refactor.md`
§"Coordinator mistakes from this session").

Your own target list is in your dispatch prompt. This file is what all agents share.

---

## 0. Persona bootstrap (blocking)

Read `AI-Dev-Shop/agents/refactor/skills.md` before any work. If your targets include a file
with no existing test, also read `AI-Dev-Shop/agents/tdd/skills.md`.

In your first reply, **paraphrase in your own words** what the Refactor persona says about
(a) behavior preservation and (b) the coverage rule. An "ack" is not sufficient and your output
is invalid under `AI-Dev-Shop/AGENTS.md` §Delegated Agent Bootstrap without it.

**Your propose-only default is explicitly lifted for this dispatch.** Implement, don't propose.

---

## 1. THE ACCEPTANCE CRITERION

> **10 is the ceiling. Every function you touch ends at ≤10 cyclomatic AND ≤10 cognitive — or it
> carries a documented reason, in the code, for why it cannot.**

This is a hard bar, not a direction of travel. The previous round had no target at all, so each
agent took one clean cut and stopped; a closure was reported "done" at 8/15.

Two acceptable outcomes per target, nothing else:

1. **≤10 / ≤10**, measured with §3 before and after.
2. **A documented in-code exemption** — a comment on the function stating what it scores, why the
   structure is irreducible, and what you tried. Legitimate shapes, all of which already exist here:
   - a flat `switch` over a closed protocol/key set where a lookup table would lose TypeScript
     exhaustiveness (`translateRunAgentPayload`);
   - a flat chain of `??` / `?.` fallbacks that inflates *cyclomatic* while cognitive stays near
     zero (`PostEditor.tsx:27` at 27/0, `SeoEntryPanel` at 25/6) — a measurement artifact;
   - intrinsic control flow such as a retry ladder whose branches are distinct documented outcomes.

**"A `for` loop nested three deep" is not an exemption. Neither is "the tests pass."**

If you conclude a target deserves an exemption, say so with the reasoning **and still write the
comment**. A verbal exemption in your report that isn't in the code is not an exemption.

---

## 2. The two metrics — and the extraction rule that satisfies both

There are two complexity views in play. They are not in conflict; they answer different questions,
and **you must satisfy both.**

| view | what it scores | tool |
|---|---|---|
| **per-function** | every function *and every nested closure* scored independently in its own scope | ESLint + sonarjs, §3 |
| **whole-hook** | a hook's entire body, nested closures rolled in | the owner's tool (unidentified) |

The owner's table lists `useSelectDropdown` at **37/56**. ESLint scores that same hook's own lexical
scope at **2/0**, because a hook is a thin shell around forty closures and ESLint never rolls them
into the parent. Sum of everything nested inside it is 79/44; its file total is 86/46. Neither is
37/56, so the owner's exact aggregation is not reconstructible — but its *direction* is clear and
it is the view that captures "this hook is too big to hold in your head."

**The rule this forces, and it is the single most important instruction in this document:**

> **Extract to a top-level named function or a separate hook file. Never to a nested closure
> inside the same hook.**

Moving a block into a `const doThing = () => {…}` declared *inside* the hook lowers the ESLint
per-closure number and lowers nothing at all under the whole-hook view — the code never left the
body. Moving it to a top-level `function doThing()` in the same file, or better into a sibling
`*.hooks.ts` / `rules.ts` module, lowers both. That is the difference between a real cut and a
cosmetic one.

Corollary: prefer pure functions over closures wherever the block doesn't genuinely need to close
over React state. A pure function is independently testable, which §4 requires anyway.

---

## 3. Measure it yourself — do not trust any number handed to you

Including the numbers in your own dispatch prompt. The owner's table was generated against a
**pre-`34a7936` tree** — it cites `apps/admin/src/components/Select.tsx`, a path that no longer
exists (that file is now `components/Select/Select.tsx` + `Select.hooks.tsx`). Treat every supplied
score as a pointer to a symbol, never as a baseline.

Scoped to your own files, before you start and again when you finish:

```bash
npx eslint --no-error-on-unmatched-pattern --format json \
  --rule '{"complexity":["warn",10],"sonarjs/cognitive-complexity":["warn",10]}' \
  <your files>
```

Anything it prints is over the ceiling. To see the exact score of a function that is *under* 10
(needed for your before/after table), rerun with both thresholds set to `0` — that makes every
function report instead of only violations.

ESLint 10.8.0 + typescript-eslint 8.65.0 + eslint-plugin-sonarjs 4.2.0, config at
`eslint.config.mjs` (repo root). `npm run complexity` runs the same rules at threshold 15.

`eslintcc` does not work in this repo — don't try it.

**Cyclomatic rising slightly while cognitive falls is the correct signature of extract-method, not
a regression.** Each extracted function carries a baseline branch count, so cyc is roughly
conserved across the split while cog falls because the nesting penalty disappears. Do not read
rising file-total cyc as failure. Do not target cyc for this kind of work.

**When cyc is high and cog is near zero, the cyclomatic score is operator-counting, not branching.
Trust cognitive.** The inverse also holds: a high cog:cyc ratio means nesting, which is the thing
actually worth removing.

---

## 4. Coverage rule — tests for all of them

The owner's requirement is explicit: **every refactored target has tests.**

1. **Before restructuring anything, check whether it has a test.** `git grep` the symbol under
   `__tests__/`.
2. **If it does not: write characterisation tests first, get them green, then refactor.**
   Characterisation means documenting what the code *does*, not what it should do — including
   behavior you think is wrong. Refactoring uncovered code for a metric is how behavior changes
   silently: the number improves and the bug ships.
3. **Every unit you extract gets its own direct unit test.** That is the point of extracting to a
   top-level function rather than a closure.
4. **Per-file negative verification.** After the suite goes green, pick one new assertion per new
   test file, break it, confirm *that specific file* fails, revert. An aggregate "191/191 passing"
   has previously hidden a test file that silently no-opped. Report that you did this.

Test placement follows `apps/admin/INFO.md` §Components — read it, do not re-derive the convention.

---

## 5. Running tests — scoped only

```bash
cd apps/admin && npx vitest run <path-to-your-test-files>
```

**Never run the full suite.** Pass explicit paths. A previous session re-ran a 3000-test suite
dozens of times because of a bad invocation pattern.

Typecheck with `npx tsc -p apps/admin/tsconfig.json --noEmit` from the repo root. The tree
typechecks clean as of this dispatch — if it doesn't for you, that is your change.

---

## 6. Commit discipline (blocking)

**Commit and push nothing to a remote; commit locally, often — every logical unit or ~10 minutes,
whichever comes first.** `wip:` prefixes are fine.

Reason: work stopped mid-flight has previously been lost, and uncommitted work in the tree is
indistinguishable from work never done. Commits are the only telemetry the coordinator has.

**Never gate a commit on tests passing.** Commit the work, then verify, then commit the fix.

Stage **only your own paths, explicitly** — `git add <path> <path>`. Never `git add -A`, never
`git add .`, never `git commit -a`. Other agents are working on this branch concurrently, and the
tree carries a different session's uncommitted feature (§7).

If `git commit` fails on `.git/index.lock`, another agent is mid-commit. Wait a few seconds and
retry. Do not delete the lock file.

Brand-new untracked files need `git add` before a path-scoped commit will see them.

---

## 7. Do not touch — another session's uncommitted work

These paths carry an unrelated in-flight sidebar-accordion feature. Do not edit them, do not stage
them, do not include them in a commit, even if a target of yours lives inside one:

```
apps/admin/src/App.tsx
apps/admin/src/styles.css
apps/admin/src/panels.tsx
apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts
apps/admin/src/__tests__/unit/sidebar-accordion-css.unit.test.ts
```

`App` (13/12 per-function, 16/17 on the owner's list) is therefore **out of scope this round**.
If your work genuinely requires an `App.tsx` change, stop and report it rather than making it.

Also dirty from other sessions and out of scope: `AGENTS.md`, `development/**`, `src/**`
(the server, not the admin app).

---

## 8. Tooling traps that have already produced wrong answers here

- **`grep` in this shell is a function wrapping `ugrep --ignore-files`.** It silently skipped a
  tracked source file during a recursive search and returned zero hits for a class that was on
  line 109 of the file being asked about. A false negative from grep does not look like an error,
  it looks like an answer — and "nothing references this" is the answer that authorises a deletion.
  **Use `git grep` for any existence or dead-code claim.** Never the wrapper.
- **An occurrence count is not a symbol census.** This codebase is heavily commented, and doc
  comments cite hooks from *other packages*. A previous brief listed five hooks to extract from one
  file; two of them did not exist anywhere but in comments. Grep for definitions
  (`function useX`, `const useX =`) or read the file.
- **Long evidence-shaped comments in this repo sometimes encode inference as observation**, and at
  least one was measurably false. If a comment states a fact your change depends on, verify it.
- **Restart the dev server after any file move** — a stale Vite process serves 404s on old
  component paths and looks like a broken refactor.

---

## 9. Already done — do not redo

- **`34a7936`** moved 8 components to the `ConfirmDialog` folder pattern
  (`<Name>/<Name>.tsx` + `<Name>.hooks.tsx`, no barrel, injectable hook seam). Documented in
  `apps/admin/INFO.md` §Components. Do not re-derive the pattern; follow it.
- Uncommitted in the tree from a stopped pass, **verify before trusting**: extractions in
  `lib/assistant-transport.ts`, `hooks/use-assistant-chats.hooks.ts`, `hooks/use-settings-slice.hooks.ts`
  (reported green); a partial, **unverified** `useSelectDropdown` decomposition in
  `components/Select/Select.hooks.tsx` (+244/−86 lines); the new
  `hooks/use-async-action.hooks.ts` primitive; and four characterisation test files. Re-run rather
  than trusting any of it.
- `hooks/use-async-action.hooks.ts` is a shared primitive that collapses the
  `[saving]`/`[error]` pair repeated around every mutation handler. Its `setError` was widened to
  `Dispatch<SetStateAction<…>>` by the coordinator to fix a live compile error. Adopt it where it
  fits; read its file header first — it documents three shapes that are deliberately *not* a fit.

---

## 10. Challenge this brief

**If you disagree with a target, a score, or an instruction after reading the code, say so with
your reasoning instead of complying.** In the previous round three of the coordinator's eight
mistakes were caught by subagents pushing back, and every one of them was right: a metric that
didn't reproduce, two hooks that didn't exist, and a better seam rule.

Declining a target with evidence is a better outcome than a compliant refactor of something that
shouldn't be touched. A refusal with reasoning will not be treated as under-delivery.

---

## 11. Report format

End with a table of **measured** numbers, never estimates. A previous round hand-estimated a
target at ~12/~12; the tool showed no change at all.

| symbol | file | before cyc/cog | after cyc/cog | ≤10? | tests |
|---|---|---|---|---|---|

Then:
- every commit SHA you made, and the branch;
- every exemption you documented, with the in-code location of the comment;
- anything you declined and why;
- whether you did per-file negative verification, and on which files;
- anything you found that the coordinator got wrong.
