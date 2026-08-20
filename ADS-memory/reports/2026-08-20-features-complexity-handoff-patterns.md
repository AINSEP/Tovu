# `src/features` complexity — handoff patterns, 2026-08-20

First pass took `src/features` from **91 → 72** violations, clearing the five worst files.
Agent rotated on context cost, not quality. Written so the replacement reuses the technique.

## Files DONE — do not redo

| was | file | technique |
|---|---|---|
| 51/47 | `plugin-runtime/manifest.ts` | per-section validator split |
| 37/39 | `theme/handlebars-allowlist.ts` | switch → lookup table |
| 18/36 | `deployments/static-publish/s3-compatible-target.ts` | 5 functions, incl. `publish()` |
| 35/30 | `site-glue/manifest.ts` | per-section validator split (same as #1) |
| 21/29 | `theme/liquid-allowlist.ts` | per-node collector extraction |

## Pattern A — the per-section validator split, and its THIRD sibling

`validateManifest` in `plugin-runtime/manifest.ts` (51/47, worst file in the repo) went to 0/0 by
splitting into one validator per manifest section:

```
validateKeys / validateId (+validateIdFormat, validateIdentity) / validateEngine
validateTier / validateCapabilities / validateHooks / validateFields (+validateField)
```

`site-glue/manifest.ts` (35/30) is a **structurally identical sibling** and took the identical
split, unchanged.

**`src/features/agent-plugins/manifest.ts` (18/14) is very likely the THIRD sibling of this
family.** Read all three before refactoring it — if the shape matches, apply the same split, and
consider whether a shared validator helper is warranted. **Bar for extracting shared code in this
repo: 2+ REAL consumers, never speculative.** Three siblings would clear that bar; check whether
their field sets actually overlap before assuming they do.

## Pattern B — AST walker: switch → dispatch table

`walkHandlebarsNodes` had a 9-case switch. Replaced with a `STATEMENT_HANDLERS` lookup table plus
`handleBlockStatement` / `handleMustacheStatement` / `walkParamsAndHash`.

`theme/liquid-allowlist.ts`'s `collectLiquidUsage` is the same walker family — fixed by extracting
per-node collectors (`collectNodeTag`, `collectNodeValueFilters`, `collectNodeArgumentFilters`,
`collectForRangeViolation`, `drainChildren`).

Expect this shape again in `theme/migration/theme-migration-plan.ts` (17/28) and
`database/migrate-forward/state-machine.ts` (27/27) — both are state/step dispatchers.

## Pattern C — `?.` counts as a branch (found independently by THREE agents today)

ESLint's `complexity` rule counts **every optional chain `?.`**, not just `??`/`||`.

**Consequence for FLAT_WIRING files (cyclomatic high, cognitive 0): extracting a helper does
nothing** — the branches move with the code. You must *collapse the accesses*: read the object
once into a local, or resolve related fields as a single unit. One agent extracted a "flat merge"
helper that still failed at cyc 11 from five `?.` accesses, and only cleared by hoisting a
sealed/keyTail **pair** into one resolver instead of resolving each field independently.

## Verification standard held — keep it

Every commit re-ran that file's own tests before AND after and reported the count
("16/16", "32/32", "18/18 + 40/40 adapter tests"). One commit per file. Git hygiene:
`git add` only for untracked, `git commit -F <msgfile> -- <exact path>`, `git show --stat HEAD`
after each, and immediate commit with no idle staged window. That is the standard.

**Also typecheck.** A sibling agent in `src/server/routes` produced a file that was eslint-clean
but type-broken (`TS2322`). A green complexity number is not correctness.

## Concurrency note that held true

`plugin-runtime/manifest.ts` and `site-glue/manifest.ts` were checked with
`git status --porcelain` and `git log --oneline -5 -- <file>` before editing — both clean, last
touched by `1e07bb0b`. Keep doing that check in `plugin-runtime/` and `site-glue/`; a concurrent
session was active in both earlier today.

---

## Pattern D — cognitive complexity charges a NESTING BONUS: extract the whole loop body

**This contradicts a naive reading of "extract the nested block", and it cost one agent a failed
first attempt before it worked it out.**

Cognitive complexity does not score branches uniformly. Every level of nesting adds an increment to
**everything inside it**. So in this shape:

```ts
for (const x of xs) {          // +1, and +1 nesting level for everything below
  if (a) { ... }               // +2  (1 for the if, +1 nesting bonus)
  if (b) { ... }               // +2
  if (c) { ... }               // +2
}
```

...extracting only the branchiest `if` still leaves the other branches paying the nesting bonus.
The measured result on `theme/build-conformance.ts`: the agent extracted the classification logic,
re-ran eslint, and **it was still red**. It cleared only after pulling the ENTIRE loop body into a
named function so the loop became:

```ts
for (const x of xs) handleOne(x);   // all inner branches now score at nesting level 0
```

**Rule: when cognitive is high and the branches live inside a loop (or any wrapper), extract the
whole body, not the branchiest part of it.** Applied directly to `theme/validation/structure.ts`
next, and that one cleared on the first attempt.

### The three extraction traps found on 2026-08-20, together

All three break the naive "just extract a helper" instinct, in different ways:

| trap | symptom | fix |
|---|---|---|
| **`?.` is a branch** (Pattern C) | cyclomatic high, cognitive 0; extraction moves the count, doesn't reduce it | collapse the accesses — read the object once, resolve related fields as a unit |
| **nesting bonus** (Pattern D) | cognitive still high after extracting the obvious inner block | extract the whole loop/wrapper body |
| **extraction widens types** | eslint clean, `tsc` red — or worse, clean because the original was implicitly `any` | annotate to the TRUE type, never cast the error away |

The third one broke `general-work` on origin for ~2 hours today across three files
(`src/seo/seo.ts`, `src/export/route-manifest.ts`,
`src/assistant/mcp-federation/bootstrap.ts`) — all "extraction widened an annotation".
**Always run `npm run typecheck`, not just eslint.**
