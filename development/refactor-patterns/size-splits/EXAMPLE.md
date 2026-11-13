# Worked example — `registerAdminSiteShareRoutes` (109 → 82 counted lines)

File: `apps/website/src/server/inbound/admin-http/routes/system/site-shares.ts` (Tovu). Done and test-backed on
2026-11-13 in the design clone; the commit is the reference diff (`git log -1 -- <file>`).

## Before
One 109-line `register…Routes` function: a `gate` closure (workspace check, connected-computer vs admin
session, RBAC, storage availability — 11 lines), a `fail` closure, and nine route handlers. The download handler
also held the whole "find row → refuse revoked/unacknowledged → stream ZIP → map storage errors" sequence.

## Responsibilities found
| unit | job | became |
|---|---|---|
| `gate` closure | authorize one share request and return the backend | module-level `gateShareRequest({ req, res, deps }, { artifact = false } = {})` |
| download handler body after the gate | stream one export ZIP | module-level `sendShareDownload({ req, res, deps, backend, fail })` |
| everything else | the route table | stays in `registerAdminSiteShareRoutes` |

`fail` stayed a closure (one line, used by every handler) and is passed into `sendShareDownload` as an input.
The `gate` closure stayed as a one-line adapter, so none of the nine call sites changed — the smallest diff that
gives each job its own named function. The "why" comment on the session-kind check moved with it, word for word.

## Patterns this shows (apply them everywhere)
- `register…Routes` over 100: lift shared closures (auth gate, error mapper) and the longest handler bodies to
  module-level helpers taking `{ req, res, deps, … }`; route paths and registration ORDER stay in the register
  function, byte for byte.
- Keep call sites stable with a one-line adapter when a closure has many callers.
- Types needed at the boundary come from the existing declaration (`NonNullable<RouteDeps["siteShareBackend"]>`),
  never loosened.
- A synchronous throw inside the moved body still reaches the handler's `try` because the helper is `async` and
  awaited.

## Verification (only this file's tests, one at a time)
| test file | before | after |
|---|---|---|
| `routes/system/__tests__/site-shares.integration.test.ts` | 5/5 | 5/5 |
| `routes/system/site-shares.integration.test.ts` | 2/2 | 2/2 |
| `features/site-backup/__tests__/share-delivery.integration.test.ts` | 6/6 | 6/6 |
| `features/site-backup/__tests__/static-download-headers.integration.test.ts` | 2/2 | 2/2 |
| `features/site-backup/__tests__/credential-warnings.integration.test.ts` | 3/3 | 3/3 |
| `server/__tests__/routes/publish-trust-gate.test.ts` | 21/21 | 21/21 |

`outline.mjs --check` → OK (151 lines; largest function 82). `npx eslint <file>` → clean. No tsc run (owner rule:
no local full tsc; the batch typecheck runs at merge).

## Lesson for the plan
The design-agent fragment for this file listed 4 test files and missed the 2 colocated
`site-shares.integration.test.ts` files. Every Terra prompt therefore tells the executor to complete the list with
`rg -l "<file stem>" <app>/src --glob '*.test.*'` before starting.
