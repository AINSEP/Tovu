# Redacted 500s are undiagnosable — http-kit `ClientFacingError`

Programmer(Execution) report. Task: make `@jini-ai/http-kit`'s generic SEC-005 redaction
diagnosable from the UI/assistant, following the `media-import` egress-refusal precedent, without
weakening the security intent of the redaction.

## 1. Source mapping

`node_modules/@jini-ai/http-kit/dist/adapter.js:81-85` (compiled) is `mountJsonRoute`'s `catch`
block in the SOURCE at:

`/Users/la/Programming/Jini/packages/http-kit/src/adapter.ts` (the `catch (e) { ... }` inside
`mountJsonRoute`, originally lines 106-117, now lines further down after the new code — see diff).

`Tovu/node_modules/@jini-ai/http-kit` is a symlink to `/Users/la/Programming/Jini/packages/http-kit`
(confirmed via `ls -la`), so this is the correct, editable source — not the compiled `dist/` copy.

This catch is a deliberate, well-documented security control (**SEC-005**, comment already present
in the source): a route's `handle()` is contracted to return a `Result<Output>` rather than throw,
so anything that reaches this `catch` is by definition *unanticipated* and therefore the path most
likely to be holding something private (a driver error naming a DB file, a connection string, a
credential a provider echoed back). It responds with a bare `INTERNAL_ERROR` + `requestId`
correlation id, and routes the real error to a host-owned `onInternalError` sink (default:
`console.error`). This same shape (correlation id + `onInternalError` sink + blanket redaction) is
independently hand-rolled in ~13 other files across `http-kit` (`runs.ts`, `connectors.ts`,
`media.ts`, `delegated-tools.ts`, `attachments.ts`, `db-ops.ts`, `xai.ts`, `host-tools.ts`,
`model-proxy.ts`, `research.ts`, `remote-run-events.ts`, `terminals.ts`, plus `adapter.ts` itself) —
it is a mature, intentional convention, not a bug to remove.

**Existing precedent for "classify some failures as safe to disclose" already lives inside
`http-kit` itself**, closer to this exact catch than Tovu's media-import example:
- `attachments.ts`: `AttachmentRejectedError` (a marker `Error` subclass carrying a `reason`) +
  `respondToUploadFailure`, which sends the real message for a classified rejection and redacts
  everything else.
- `delegated-tools.ts`: `ToolExecutionResult.errorKind === 'validation'` gets a real `400
  BAD_REQUEST` with the handler's own message; everything else stays the SEC-005 redacted `500`.

Both exist because nothing at the *generic* `mountJsonRoute` layer offered this carve-out, so every
module that wanted it had to reinvent it. That is the actual gap this task closes — the same shape
Tovu's `media-import/tool-registrations.ts` (`isImportShapeRejection` / `EgressRefusedError`) uses
one layer up, generalized to the layer the team lead pointed at.

## 2. RED test (before the fix)

Added to `/Users/la/Programming/Jini/packages/http-kit/src/__tests__/adapter.test.ts`:
`'surfaces a thrown ClientFacingError verbatim instead of redacting it'` — throws
`new ClientFacingError(createApiError('CONFLICT', 'site "tovu-com" already exists'))` from
`handle()` and asserts the exact response body/status (409, exact message) and that the internal
sink was never invoked.

Run before implementing `ClientFacingError` (`cd
/Users/la/Programming/Jini/packages/http-kit && npx vitest run src/__tests__/adapter.test.ts`):

```
 ❯ src/__tests__/adapter.test.ts (13 tests | 1 failed) 35ms
   × http adapter > surfaces a thrown ClientFacingError verbatim instead of redacting it 13ms
     → expected "spy" to be called with arguments: [ 409 ]

Received:
  1st spy call:
  Array [
-   409,
+   500,
  ]

 Test Files  1 failed (1)
      Tests  1 failed | 12 passed (13)
```

RED confirmed: the 12 pre-existing tests passed unchanged; only the new one failed, exactly on the
symptom described (a classified failure was indistinguishable from a genuine internal error —
`ClientFacingError` didn't exist yet, so the constructor call itself threw, and that throw fell into
the SAME blanket redaction as any other unanticipated exception, landing on 500 instead of 409).

## 3. The fix

`/Users/la/Programming/Jini/packages/http-kit/src/adapter.ts`:

- Added `export class ClientFacingError extends Error { readonly apiError: ApiError; ... }` — a
  marker exactly like `attachments.ts`'s `AttachmentRejectedError`, but generic (carries a full
  `ApiError` rather than a domain-specific reason enum) and placed at the shared `mountJsonRoute`
  layer so any route gets the carve-out without hand-rolling its own.
- In the `catch (e)` block, added a branch **before** the SEC-005 redaction:
  ```ts
  if (e instanceof ClientFacingError) {
    sendApiError(res, statusForError(e.apiError), e.apiError);
    return;
  }
  ```
  Everything else (any thrown value that is *not* this class) still redacts exactly as before —
  nothing widens what a route can leak by accident. Reaching the new branch requires code to
  construct a `ClientFacingError` itself, naming the exact `ApiError` it has decided is safe.
- Exported `ClientFacingError` from `/Users/la/Programming/Jini/packages/http-kit/src/index.ts`
  (previously only `AdapterContext`, `defineJsonRoute`, `mountJsonRoute` were re-exported), so a
  consumer (Tovu or any other host) can actually import and throw it.

Preferred usage note documented in the class's own comment: a route that anticipates a failure
inside `handle()` itself should keep returning `err(apiError)` (already full-fidelity, never touches
this catch at all). `ClientFacingError` is for the same kind of classified failure discovered a
level deeper — inside an awaited call `handle` did not wrap in its own `try`.

## 4. GREEN (after the fix)

```
$ cd /Users/la/Programming/Jini/packages/http-kit && npx vitest run src/__tests__/adapter.test.ts
 ✓ src/__tests__/adapter.test.ts (13 tests) 28ms
 Test Files  1 passed (1)
      Tests  13 passed (13)
```

Full package regression check (all 38 test files / 1388 tests in `@jini-ai/http-kit`):

```
$ cd /Users/la/Programming/Jini/packages/http-kit && npx vitest run
 Test Files  38 passed (38)
      Tests  1388 passed (1388)
```

Typecheck: `npx tsc -p tsconfig.json --noEmit` — clean, no errors.

## 5. Package build for Tovu

Built **only** `@jini-ai/http-kit` (never `pnpm -r build`, per the hard constraint):

```
cd /Users/la/Programming/Jini/packages/http-kit && npx tsc -p tsconfig.json
```

Confirmed the new export reached Tovu's `node_modules` symlink (no copy step needed — it's a real
symlink into the Jini workspace):

```
$ grep -n "ClientFacingError" /Users/la/Programming/Tovu/node_modules/@jini-ai/http-kit/dist/adapter.js
36:export class ClientFacingError extends Error {
40:        this.name = 'ClientFacingError';
105:            // see `ClientFacingError`'s own doc. Sent verbatim, at its own status; never routed to the
107:            if (e instanceof ClientFacingError) {
```

## 6. Commit

Jini repo (separate git repo from Tovu, at `/Users/la/Programming/Jini`), explicit paths only —
the working tree there already carries substantial unrelated uncommitted WIP (admin/Sidebar,
chat-pane, package.json version bumps, pnpm-lock.yaml) from other work, none of it touched:

```
git add packages/http-kit/src/adapter.ts packages/http-kit/src/index.ts \
        packages/http-kit/src/__tests__/adapter.test.ts
git commit -F <scratchpad commit-msg file>
```

Commit: `0f3e57b09470f1df396f6563fe4a1371870af1cd` —
"fix(http-kit): let a route disclose a classified failure past SEC-005"

No Tovu-side source files were changed — nothing to commit in the Tovu repo. `packages/http-kit/package.json`'s
pre-existing version-bump diff (0.3.0 -> 0.3.2, unrelated to this change) was left untouched and unstaged.

## Scope note / suggested next step

This delivers the generic **capability** in `http-kit` (any route can now throw a classified,
non-redacted failure). It does **not** wire any specific Tovu route to use it yet — no Tovu route
was in the dispatch's explicit scope, and the dispatched task's own example ("Page Navigate") turned
out to be an illustrative placeholder tool id used in Jini's `ToolCard` tests, not a real failing
route to trace. A natural follow-up: audit Tovu's own routes mounted via `mountJsonRoute` (and any
that hand-roll their own SEC-005 redaction the way `delegated-tools.ts`/`attachments.ts` do in
`http-kit`) for failures that are actually caller-actionable, and have those throw
`ClientFacingError` instead of an untyped exception, the same way `attachments.ts`'s
`AttachmentRejectedError` already does for its own domain.

## Architecture Audit

- Status: **PASS**
- ADR rules checked: SEC-005 redaction is a security-motivated pattern, not an ADR-governed
  boundary; no `.dependency-cruiser.mjs` rule touches `http-kit/src/adapter.ts` or `index.ts`.
  `ClientFacingError` introduces no new cross-package dependency (only `ApiError`, already imported
  from `@jini-ai/protocol` in this file).
- Files audited: `packages/http-kit/src/adapter.ts`, `packages/http-kit/src/index.ts`,
  `packages/http-kit/src/__tests__/adapter.test.ts` (Jini repo).
- Violations found: none.

## Pre-Completion Checklist

- Requirements re-verified: source mapped and confirmed (not assumed), RED test written and proven
  RED before the fix, fix mirrors the named precedent's shape (classify-and-reveal / redact-the-rest
  marker class), GREEN reproduced, package built (not `pnpm -r`), Tovu-side symlink confirmed to see
  the new export.
- Fresh evidence commands: shown above (RED run, GREEN run, full-suite run, typecheck, grep against
  Tovu's `node_modules` symlink).
- Test-integrity: no existing test was deleted, weakened, or altered in meaning — only one new test
  was added; the 12 pre-existing `adapter.test.ts` tests are byte-identical.
- Scope: touched exactly 3 files, all inside `@jini-ai/http-kit`. Did not touch
  `apps/website/src/features/widgets/resolver-service.ts`, any `serve-command*.integration.test.ts`,
  or `apps/website/src/cli/__tests__/helpers/` (none of that is in `http-kit` and none was opened).
  Did not touch `apps/admin/src`. Did not restart the dev server or kill any process.
- Open items: no Tovu route yet throws `ClientFacingError` — see Scope note above.

## Self-Validation

- Required: not required as a distinct runtime harness — this is a library-level fix validated by
  its own package's test suite (unit test against the real `mountJsonRoute`/Express-shaped route
  mounting, not a mock of the function under test) plus confirmation that Tovu's `node_modules`
  symlink resolves the rebuilt `dist`. No Tovu server route was changed, so there is no live Tovu
  runtime behavior to boot-test yet.
- Status: **PASS** for the delivered scope (the http-kit capability itself).
- Report path: this file.
- Attempts used: 1 (RED confirmed on first run, fix landed clean, GREEN confirmed on first run).
- Critical path checked: a route's `handle()` throwing a `ClientFacingError` a level deep.
- Negative/edge path checked: pre-existing tests confirm an ordinary thrown `Error`, a thrown
  non-`Error` string, and the no-sink-configured fallback all still redact exactly as before (all 3
  passed unchanged); also confirmed the `onInternalError` sink is NOT invoked for a classified
  `ClientFacingError` (asserted in the new test).
- Bounded diagnosis pass used: no — RED matched the expected symptom on the first run, no ambiguity
  to diagnose.

## Style notes / function quality

| unit | disposition | findings | local fix attempted |
|---|---|---|---|
| `ClientFacingError` (class, `adapter.ts`) | NO_RECORDED_FINDINGS | none — a two-field marker `Error` subclass, same shape as the pre-existing `AttachmentRejectedError` precedent it mirrors | n/a |
| `mountJsonRoute`'s `catch` branch addition | NO_RECORDED_FINDINGS | none — O(1) `instanceof` check added before the existing redaction path; no change to any other branch's behavior | n/a |

Zero-findings skepticism pass: both units are additive-only (a new class, one new `if` branch
returning early); the pre-existing catch body, the redaction branch, and all 12 prior tests are
untouched. Variable name audit: `e` (pre-existing name, unchanged), `apiError` on the new class
holds exactly an `ApiError`, `correlationId`/`sink` in the untouched branch below are unaffected. No
misleading names introduced.

Complexity/space: O(1) — one additional reference-type check per request that reaches this catch
(a request that reaches it at all is already the unhappy/exceptional path, not a hot loop).

No adversarial aggregate/cross-item test was added — this is not a rule/validation/batch/reducer/
reconciliation/transfer workflow; it is a single-request error-classification branch, already
covered by the RED/GREEN pair.

## Risks and tech debt

- `ClientFacingError` is currently unused by any real route (in either `http-kit` or Tovu) — it is
  a capability, not yet an applied fix to a specific undiagnosable failure. If the team lead had a
  concrete failing route in mind beyond the illustrative "Page Navigate" placeholder, that route
  still needs to be found and switched to throw `ClientFacingError` (or to return `err(apiError)`
  directly, which is the preferred path when the failure is anticipated at the `handle()` level).
- Every other file in `http-kit` that hand-rolls its own SEC-005 split (`attachments.ts`,
  `delegated-tools.ts`) could, over time, be simplified to build on `ClientFacingError` instead of
  their own local marker types — not done here, out of scope, and each has its own richer status-
  mapping needs (`attachments.ts`'s per-reason HTTP status table, `delegated-tools.ts`'s
  `errorKind`-based `ToolExecutionResult` mapping) that a bare `ApiError` carrier does not replace
  outright.

## Suggested next routing

Hand back to the coordinator/team lead to name the concrete Tovu (or Jini) call site that should
actually throw `ClientFacingError` — the dispatch's own example was illustrative rather than a real
traceable route, so closing the loop on an actual live "undiagnosable 500" needs that route named
first.
