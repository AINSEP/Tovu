# Cloud brief — coverage stage 1: `src/forms`, `src/comments`, `src/analytics`

**Dispatched:** 2026-08-20 · **Branch:** `general-work` · **HEAD at dispatch:** `ac5fd87d`

## The goal, and the real goal

Drive three small Tovu domains to **100% branch and function coverage**, and **report every bug you
find on the way.**

The owner's expectation, stated plainly: this code was largely AI-generated and never properly
tested, so you **will** find real bugs. Finding them is the point. The coverage number is the means,
not the goal. Put bugs in their own section of your report, separate from coverage numbers, and do
not bury them.

## Setup

Repo is `leonaburime-ucla/Tovu-AI-CMS` (the name is NOT "Tovu"). Work on **`general-work`**, not
`main`.

```bash
git checkout general-work && git pull origin general-work
npm install
```

A HEAD different from `ac5fd87d` is expected and fine — other agents commit to this branch
continuously. The sibling `Jini` repo is checked out because Tovu links it via `file:` deps; you
should not need to modify it. **If `npm install` fails, report exactly what failed and stop** — do
not improvise a different package manager.

## Targets

| domain | branch | function | notes |
|---|---|---|---|
| `src/forms/` | 63% | **38%** | `forms.ts` also cyc 25 / cog 41 — worst function coverage of the three |
| `src/comments/` | 65% | — | `settings.ts` is 57% branch, 17 missing branches |
| `src/analytics/` | 73% | — | `ingest.ts` is 67% branch, 25 missing branches |

No other agent owns these. Existing tests are in each domain's `__tests__/` directory.

## How to measure

The runner is `node --import tsx --test`. **vitest is NOT installed at the repo root.**

```bash
TEST_CONCURRENCY=2 node --import tsx --test src/forms/__tests__/*.test.ts
npx c8 --reporter=text --reporter=lcov \
  node --import tsx --test src/forms/__tests__/*.test.ts
```

**Use `npx c8`, not node's built-in `--experimental-test-coverage`.** The built-in mis-maps
`BRDA`/`FN` line numbers on larger files — consistently wrong, not off-by-one. Two agents lost time
to this today before switching.

**Never run the full test suite.** It measures 5.4 GB across 13 workers. Scoped runs only, always
`TEST_CONCURRENCY=2`.

## 100% is achievable — do not cite a ceiling

If you find a comment claiming esbuild injects "exactly 2 permanently-zero-hit branches into every
file, making literal 100% unreachable": that was **measured false** on 2026-08-20 and corrected in
`15b432fe` (entry 7 of the false-comment register). Of 1265 files with branch data, 567 have ZERO
unhit branches. Root cause of the bad claim: the repo is ESM (`"type": "module"`, `module:
"nodenext"`), so esbuild emits no CJS-interop shim. Two files hit literal 100% today.

## Dead branches — strict proof standard

The usual thing between a file and 100% is not a missing test but a branch that **cannot fire** —
over-defensive handling for states callers make impossible. Removing those raises coverage AND
deletes real dead code. That is a wanted outcome.

**You may delete or collapse a branch ONLY with proof.** One of:

- **Type-level:** the parameter's type makes the input impossible, and no `as`/`any` upstream
  reintroduces it.
- **Caller-side:** EVERY caller enumerated repo-wide, each shown to guarantee the condition.

**"No test hits it" is NOT proof** — that is the definition of the gap, not evidence about the code.

**Count the module's own exported surface as a caller.** Today's best catch: an agent found a branch
mechanically guaranteed by its only internal call site, but the function was also `export`ed with a
loose parameter type, so a future caller or test could reach it. It wrote a direct-call test instead
of deleting. Do that.

Prefer making an impossibility **explicit and enforced** — hoist the guarantee into a type, or throw
at the boundary — over silent deletion. **When in doubt: write the test, do not delete the branch.**
A wrongly-deleted defensive branch is a production crash; a wrongly-kept one costs a few percent.

## Test quality bar

- **Assert exact error text.** A bare "it throws" is not a real test.
- Pin boundary values on both sides (e.g. 500 and 501), not just the happy path.
- A zero-hit branch on a line with no visible conditional is usually a **REAL** branch whose line
  number is misattributed. Check the containing function's `DA:` hit count — if the function is
  invoked, the branch is real and the conditional is a few lines away.
- `?.` and `??` each count as a branch under this repo's ESLint config.

## When you find a bug

Do **not** silently fix it. For each one report: what the code does, what it should do, the input
that triggers it, and your evidence. Then write a test that **fails** against the current code and
pin the correct behavior. If the fix is small and unambiguous, make it and say so. If it is
ambiguous or changes product behavior, leave the code alone, mark the test `skip` with a comment
explaining why, and escalate it in your report.

## Git — non-negotiable

This branch has several agents committing to it concurrently, sharing one index.

- **Commit and push incrementally**, after each domain. Never gate a commit on green tests — commit
  work in progress rather than risk losing it.
- **Put the pathspec on the COMMIT itself:** `git commit -F <msgfile> -- src/forms/__tests__/`.
  A bare `git add` + `git commit` commits the WHOLE index and sweeps in other agents' files. This
  happened twice today. Brand-new untracked files still need `git add` first.
- **Use `git commit -F <file>`, not `-m` with a heredoc** — a heredoc with backticks appended a
  literal `EOF)` to a commit message today.
- **NEVER run `git reset`, `git stash`, `git rebase`, or `git commit --amend`. Forward-only, no
  exceptions.** An agent ran `git reset --soft HEAD~1` today and destroyed a different agent's commit
  because HEAD had moved in between. If history looks wrong, report it — do not repair it.
- Verify each commit with `git show --stat HEAD`.
- **If pushing to `general-work` fails**, push to `cloud/coverage-stage-1` instead and say so
  prominently. Do not leave work unpushed.

## Repo facts

- `tsc` does not check `__tests__` (tsconfig excludes it) and does not check `development/scripts/`
  at all. Type errors in tests are invisible to every gate.
- **Do not trust this repo's code comments** — seven proven false in 48 hours. Register:
  `ADS-memory/reports/2026-08-20-false-code-comments-register.md`. Read it before relying on any long
  comment in your files. If you prove another one false, add it following that file's own
  "How to add to this register" section.
- Tovu themes are COPIED, not inherited; runtime `parent` inheritance is dead.

## Report back

1. **Bugs found** — first, in their own section, one entry each with evidence.
2. Per domain: before/after branch and function coverage, measured with `c8`.
3. Every test added and what it pins.
4. Any branch deleted, with its full proof.
5. Every commit SHA, and which branch you pushed to.
6. Anything you left undone and why.
