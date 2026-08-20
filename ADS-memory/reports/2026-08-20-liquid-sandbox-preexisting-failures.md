# BUG (pre-existing): liquid-sandbox rejects violating templates by TIMEOUT, not by lint

Found 2026-08-20 by the `features` refactor agent while regression-checking
`theme/liquid-allowlist.ts`. **Not caused by that change** — the agent verified it reproduces on
HEAD via `git checkout HEAD -- <path>`.

## Symptom

`src/server/http/site/__tests__/liquid-sandbox.test.ts` — 2 failing tests:

- a **for-range-violation** template
- a **disallowed-tag** template

Both are expected to be rejected up front with a lint-violation message. Instead **both run until
the worker's 5000 ms render limit and fail on timeout.**

## Why this matters more than a red test

The lint/allowlist layer exists to reject a bad template **cheaply, before rendering**. If a
violating template instead burns the full 5-second render budget, then:

1. the allowlist is not actually gating those two violation classes on this path, and
2. the failure mode a site owner sees is a slow timeout, not a useful "disallowed tag X" message.

The earlier session's handoff separately records a related trap — a test that accepts *either*
the liquid-sandbox memory guard or LiquidJS's own — so this area already has a history of
assertions that pass for the wrong reason. Treat any fix here as needing an assertion on the
**exact** rejection message, not merely "it failed".

## Not yet investigated

- Whether the allowlist is never consulted on this path, or is consulted and does not match.
- Whether other violation classes in the same suite pass for the right reason or are simply
  not exercised.

Owner: whoever owns `src/server/http/site/`. Out of scope for the `src/features` complexity pass.
