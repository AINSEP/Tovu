# Route quality — 2026-08-17 (`route-quality` agent)

Three tasks: (A) sweep `src/` for other `sendStoreError`-shaped throw-from-catch helpers, (B) fix
`test-agent.ts`'s genuine test gap, (C) hoist the `menu`/`partial` marker-type literals. All three
done. Commits: `7f8781e1` (Task C), `8d88e71c` (Task B).

## Task A — sweep for `sendStoreError`-shaped helpers: verified negative, no new bug found

**Method:** AST scan via `ts-morph` (not grep — this repo's grep-based claims have been wrong three
times before), iterated to three tightened versions:

- **v1** (naive): function body's LAST top-level statement is a bare `throw`. 1 hit, false positive
  (see below).
- **v2** (broadened): any `throw`/`Promise.reject` reachable without having matched one of the
  function's own `instanceof`-guarded branches — catches the if/else-if/else shape v1 missed. 29
  hits, mostly false positives (plain "validate an INPUT, throw a new domain error" guard clauses
  that have nothing to do with HTTP error-mapping).
- **v3** (precision pass, what actually ran): same escape-reachability check as v2, but additionally
  requires (a) **≥2** `instanceof` checks against the **same identifier** and (b) **at least one
  matched branch calls `res.status(...)`** — i.e. the function's own code proves its job is "map an
  error to an HTTP response," not merely "test error type once." **9 hits.**

**Every one of the 9 was manually verified and is a false positive.** Two shapes recur:

1. **Rethrow-to-an-outer-catch, by design** (`src/server/routes/site/pages.ts:760`,
   `src/server/routes/admin/themes/explore.ts:653,694`): an INNER `try/catch` swallows one specific
   expected error and rethrows everything else, which is then caught by an OUTER `catch` in the
   same handler that IS fully guarded (falls through to a generic `res.status(500)`). This is the
   same pattern `route-async-guards.test.ts`'s own regression test already documents for
   `PostNotFoundError` in `pages.ts` — intentional, not a gap. Verified by reading each outer catch
   to its end.
2. **Guard-clause throw caught by the SAME function's own catch, which is fully guarded**
   (`put-execution-credential.ts:44,50,55`, `put-site-credential.ts:52`, `users/disable.ts:44`,
   `users/enable.ts:37`, `users/update.ts:33`): a validation loop or a defensive
   `if (!x) throw new NotFoundError(...)` inside the `try` block, caught by that same route
   handler's own `catch (err) { if (err instanceof X) {...}; ...; res.status(500)... }`. Every one
   of these catch blocks ends in a generic 500 fallthrough — verified by reading each to its `}`.

**Also checked every other named `send*Error`/`handle*Error`/`map*Error` helper in `src/`** (grep for
the declaration, not the bug shape, as a cross-check against the AST scan missing a differently-named
helper):

| Helper | File | Dispatch | Fallthrough |
|---|---|---|---|
| `sendStoreError` ×4 | `publish-credentials.ts`, `source-control-credentials.ts`, `vendor-credentials.ts`, `pages/update-html.ts` | `instanceof` chain | generic 500 — **already fixed**, this is last session's known fix, re-verified still in place |
| `sendThemeFileError` | `themes/explore.ts` | `instanceof ThemePathError` | generic 500 — fine |
| `sendRecoveryError` | `recovery/restore.ts` | `switch` on a **typed `RecoveryErrorPayload.code` union**, not a raw caught `err` | `default: 500` — fine, and structurally can't hit the original bug shape since it never receives `unknown` |

**Conclusion: `sendStoreError` was, in fact, unique in this codebase.** No other typed-error-mapper
helper with a throw-from-inside-catch escape exists in `src/`. This is a verified negative, not an
absence of looking — every candidate the broadened scan raised was individually read and its
enclosing catch traced to a confirmed generic-500 fallthrough. No code changes for this task.

## Task B — `test-agent.ts`: real gap, fixed

Confirmed genuinely undertested (not the `test-connection.ts` false alarm — that one has ~8 real
tests and was correctly left alone). `admin-assistant-execution-routes.test.ts`'s own header already
documented the reason: `detectAgents()` is a direct static import in `test-agent.ts`, not an
injectable dep, so the installed/authenticated/model-mismatch/success branches could only be
exercised by whichever CLIs happen to be on the host running the suite — not deterministic. Node's
`mock.module()` would fix that, but it needs `--experimental-test-module-mocks`, a flag this repo's
test scripts don't pass (confirmed empirically: `mock.module` is `undefined` without the flag, `node
--test` throws if a test file calls it) — and adding it wasn't an option in this pass since
`package.json` scripts belong to a different agent this session.

**Fix:** extracted the branch decision logic into `resolveTestAgentOutcome(agent, model)` in a new
file, `src/server/routes/admin/assistant/resolve-test-agent-outcome.ts` — a pure function over a
plain `DetectedAgent` object, no PATH scan, no subprocess, no module mock required. `test-agent.ts`
now just calls it. 8 new unit tests in
`src/server/routes/admin/assistant/__tests__/resolve-test-agent-outcome.test.ts` cover: `authStatus`
missing (with and without an explicit `authMessage`), `authStatus` unknown, model requested but not
offered, model requested and offered, no model requested, `authStatus` undefined treated as ok, and
the `agent.models?.length` guard that exempts an empty model list from the mismatch check.

**RED-first proof:** mutated the `authStatus === "missing"` check to an unreachable string in the
extracted function, reran the 8 tests — 2 failed with the expected assertion mismatches — then
restored the file (`git diff` clean on that file afterward, confirmed via `mv .bak` restore, not a
second edit).

**Regression check:** all 20 tests in `admin-assistant-execution-routes.test.ts` still pass unchanged
(the 3 that already targeted `test-agent` at the HTTP level, plus the other 17). `tsc --noEmit`
clean on both changed files. Updated that test file's own header comment, which had documented the
gap as "accepted" — it now points at the new unit-test file instead of describing a known hole.

## Task C — hoisted the `menu`/`partial` marker-type literals

This was the exact HELD follow-up from `ADS-memory/reports/2026-08-16-embed-placeholder-gap.md`'s
"Reuse decision" section: `static-render.ts`'s `injectMenuEmbeds`/`resolveSlots` compared
`marker.type` against inline `"menu"`/`"partial"` string literals; `widgets/resolver-service.ts`'s
`THEME_OWNED_MARKER_TYPES` carried an independently-typed copy of the same two strings as a
documented stopgap, because last session `static-render.ts` was `arch-export-edge`'s active
territory and touching it was explicitly held back pending reassignment.

**Fix:** added `MENU_MARKER_TYPE`/`PARTIAL_MARKER_TYPE` exported constants to
`src/core/embeds/marker.ts`, and updated all three inline literals in `static-render.ts`
(`injectMenuEmbeds`'s `!== "menu"`, `resolveSlots`'s `!== "partial"`, and `scanMenuEmbedIds`'s
`markersOfType(html, "menu")`, included for consistency though not named in the original two-literal
description) to read off them instead.

**Did NOT touch `widgets/resolver-service.ts`.** That file was not in this pass's declared file
ownership (only `src/core/embeds/marker.ts` and the theme static-render call sites were), and the
brief called this "a pure hoist, nothing more." `THEME_OWNED_MARKER_TYPES` there still carries its
own literal `Set(["partial", "menu"])` with a comment describing itself as a stopgap pending this
hoist — that comment is now slightly stale (the hoist it names as "not yet authorized" IS done on
the `marker.ts` side), but wiring `resolver-service.ts` to import the new constants is a natural,
low-risk follow-up left for whoever owns that file next.

**Verified, behavior-preserving:** `tsc --noEmit` clean. 78 tests across 4 files that exercise
`marker.ts`/`static-render.ts` all still pass: `theme-pages-render.canary.test.ts` (36),
`menu-tree-render.test.ts` (9), `html-embeds.unit.test.ts` (19), and
`html-entry-refs-consistency.integration.test.ts` (14).

## What was NOT done / follow-ups for whoever picks this up next

- `widgets/resolver-service.ts`'s `THEME_OWNED_MARKER_TYPES` duplicate → import the new
  `MENU_MARKER_TYPE`/`PARTIAL_MARKER_TYPE` constants; update its doc comment (currently says the
  hoist is "proposed but not yet authorized," which is now half-true).
- Task A found nothing to fix — do not re-run this sweep expecting a different result unless new
  typed-error-mapper helpers are added to the codebase after this date.
