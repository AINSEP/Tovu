# Programmer(Outbox): fix-outbox — 2026-09-06

Persona bootstrap: loaded `AI-Dev-Shop/agents/programmer/skills.md` (Programmer Agent v1.7.1) before any other work.

## Item 1 — outbox backoff + attempt cap

**Claim verification (before changing anything):** confirmed exactly as stated.
`apps/website/src/contracts/core/events/outbox-worker.ts:34` called
`outbox.markFailed(row.id, message, now)` — `now` is the same timestamp the row
was just claimed at (captured once per `processOutbox` call, before
`claimPending`). `SqliteOutboxAdapter.markFailed` and `InMemoryOutbox.markFailed`
both persisted that value verbatim as `nextAttemptAt` and always reset
`status` to `"pending"`. Since `claimPending`'s filter is
`status='pending' AND nextAttemptAt <= now`, a failing row was reclaimable on
the very next tick. `attempts` was incremented in `claimPending` on every claim
but read nowhere. Confirmed premise, not disproved — proceeded to fix.

**Fix (commit `0ae3429d`):**
- `computeOutboxBackoffMs(attempts, { random })`: equal-jitter exponential
  backoff (30s base, 30min cap), same formula shape as
  `features/webhooks/delivery.ts`'s `computeBackoffMs` (ADR-036 §4), duplicated
  rather than imported — `contracts/core` may not depend on `features`
  (`.dependency-cruiser.mjs` line ~124). `processOutbox` now computes
  `nextAttemptAt = now + backoff(row.attempts)` on failure instead of `now`.
  `random` is threaded through `processOutbox`'s optional bag for
  deterministic tests, matching the webhook worker's `ProcessDueDeliveriesOptional.random`.
- `MAX_OUTBOX_ATTEMPTS = 6`, exported from `outbox-worker.ts` and re-exported
  via `contracts/core/events/index.ts`.
- Terminal state: once a row's own already-persisted `attempts` reaches the cap,
  `markFailed` seals it into `OutboxRecord`'s existing `"failed"` status
  (declared in the `@jini-ai/cms` port type's status union, previously dead —
  the adapter always wrote `"pending"`) instead of re-entering `"pending"`.
  `claimPending` only ever selects `status = "pending"`, so a `"failed"` row is
  permanently excluded from retry regardless of `nextAttemptAt`.

**Why the cap decision lives in the adapters, not the worker (design note /
deviation from the ADR-036 shape as reused):** `WebhookDeliveryRepoPort.markFailed`
(Tovu-owned, `features/webhooks/ports.ts`) takes an explicit `nextStatus:
"failed" | "dead"` — the caller (`recordDeliveryOutcome`) decides and the repo
just persists. `OutboxPort.markFailed(id, error, nextAttemptAt)` has no such
parameter, and it is defined in the external `@jini-ai/cms` package
(`/Users/la/Programming/Jini/packages/cms/src/core/ports.ts`, symlinked into
`node_modules`), not this repo. Adding a `nextStatus` param there would touch
every `OutboxPort` consumer and both adapters, and require a scoped Jini
package rebuild plus a dev-server restart to pick up — explicitly out of
proportion for a "one commit, independently revertible" dispatch item, and I
was told not to restart the dev server tonight. So instead, both adapters
(`InMemoryOutbox`, `SqliteOutboxAdapter`) independently compare their own
persisted `attempts` against the shared `MAX_OUTBOX_ATTEMPTS` constant inside
`markFailed`. This is a real, disclosed split of the retry-cap decision away
from the worker (which computes the backoff-time policy) into the adapters
(which decide the terminal-status policy) — flagged as a WARNING-level
architecture note below, not hidden. A follow-up port-contract change
(`markFailed({ ..., nextStatus })`, mirroring the webhook shape exactly) would
let the worker own both decisions the way ADR-036 does; I did not do it here
because of the cross-repo blast radius above.

**RED then GREEN (fresh evidence, not reused from memory of intent):**
- Wrote/updated tests first, then proved RED via the "prove without reverting
  the tree" technique (`git diff` of only the 4 implementation files into
  `.../scratchpad/outbox-fix.patch`, `git apply -R` to revert just those files,
  ran the tests, `git apply` to restore — never left the fix missing from the
  tree while idle).
- **RED** (against reverted pre-fix code):
  `apps/website/src/contracts/core/events/__tests__/outbox-worker.test.ts` and
  `outbox-repo.contract.test.ts` both failed at import time —
  `SyntaxError: The requested module '../outbox-worker.js' does not provide an
  export named 'MAX_OUTBOX_ATTEMPTS'` (2 failing, 0 passing).
- **GREEN** (after `git apply` restored the fix):
  ```
  TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test \
    --experimental-test-module-mocks \
    apps/website/src/contracts/core/events/__tests__/outbox-worker.test.ts \
    apps/website/src/contracts/core/events/__tests__/outbox-repo.contract.test.ts
  ```
  `tests 23 / pass 23 / fail 0` (one iteration caught a bug in my own new test's
  assumption about which `attempts` value first hits the backoff cap — fixed
  the test, re-ran, GREEN).
- Two **pre-existing** tests (`processOutbox catches Error during publish...`,
  `...catches non-Error...`) asserted the bug as correct behavior (reclaiming a
  just-failed row at the exact same `now`, with the comment "status reset to
  pending" as if that were the intended terminal effect). Fixed those two
  assertions in place — did not delete or weaken them — and kept their original
  purpose (asserting `lastError` capture for both Error and non-Error throws)
  intact, adding the immediate-reclaim-must-be-empty check plus a day-later
  eventual-reclaim check to each.
- New coverage added: exact deterministic backoff-delay assertion (injected
  `random`, asserts the concrete `nextAttemptAt` timestamp, not just "later");
  `computeOutboxBackoffMs` bounds/cap test; `MAX_OUTBOX_ATTEMPTS` value test; a
  repeated-failure loop asserting the handler is invoked **exactly**
  `MAX_OUTBOX_ATTEMPTS` times (not more, not fewer) and that the row is never
  reclaimable again even decades in the future; and a contract-suite test
  (`outbox-repo.contract.test.ts`) proving the same terminal-exclusion behavior
  against **both** `InMemoryOutbox` and `SqliteOutboxAdapter` (rule-of-two).

**Lint / architecture:**
- `npx eslint` on all 6 changed files: clean, no output (complexity ceiling 9
  intact — the only new branching is a single ternary per adapter's
  `markFailed`).
- Dependency-cruiser: did not execute the full-repo `check:architecture` run
  (known-RED baseline already, per prior audits, and it scans the whole
  project graph — heavier than warranted mid-fix under tonight's load). Traced
  the two relevant rules by hand against `.dependency-cruiser.mjs` instead:
  the new `platform/db/sqlite/outbox-repo.sqlite.ts -> contracts/core/events`
  import resolves to `contracts/core/events/index.ts` (the barrel), which the
  guarded-module regex's `(?!index\.ts$)` negative lookahead excludes from
  both `no-deep-imports:contracts/core/events` and
  `no-deep-value-imports-from-db-sqlite:contracts/core/events` — so this
  import is compliant by the same barrel-only precedent already used by
  `features/post/tool-registrations.ts`'s identical import of `processOutbox`.

**Regressions:** load spiked to ~204 (1-min `uptime`) with no test activity
from me in between checks, so I initially held off on a broader sweep beyond
the 2 directly-affected test files (23/23 GREEN) per the machine-safety
directive. Load settled back to ~76-104 shortly after, so I ran the sweep:

- `features/site-glue/__tests__/integration/events.integration.test.ts` alone
  first — **caught a real regression**: `REQ-8: a throwing glue handler...`
  asserted `outbox.claimPending(10, clock.nowIso())` returns the row a few
  milliseconds after the failing `processOutbox()` call, which only ever
  passed because of the exact bug this fix removes (`nextAttemptAt === now`).
  Fixed by checking one hour later instead (still proves "retryable, not
  delivered" — REQ-8's actual intent; commit `6be26ddb`).
- Then, with that fixed, ran the remaining callers together:
  `forms-webhook-fanout.test.ts`, `send-pipeline.test.ts`,
  `entries-routes.test.ts`, `submit-service.test.ts`,
  `sitemap-invalidation.integration.test.ts` (not touched by
  `processOutbox`'s import graph but shares the outbox-drain idiom),
  `content-types-lifecycle-gap-fill.test.ts`. First pass showed several
  `entries-routes.test.ts` failures (`401 !== 200` in `loginAsOwner`) — traced
  to a stray `TOVU_ADMIN_PASSWORD` set in my own shell environment (the known
  "must be UNSET" trap), unrelated to this fix. Re-ran with
  `env -u TOVU_ADMIN_PASSWORD`: **107/107 GREEN**, no other regressions.
- Combined with the 23 from the two files above and the 3 from
  `events.integration.test.ts`: **133 tests, all green**, across every
  in-repo caller of `processOutbox` I could find via `grep -rn processOutbox`.

**Architecture Audit:**
- Status: **WARNING** (not a boundary violation, but a disclosed policy-split
  deviation from the reused ADR-036 shape — see design note above: the
  attempt-cap/terminal-state decision lives in each `OutboxPort` adapter
  instead of in the domain-layer worker, because the cross-repo port contract
  offers no way for the worker to communicate that decision).
- ADR rules checked: `.dependency-cruiser.mjs`'s `contracts/core` module
  boundary (`GUARDED_MODULES` incl. `contracts/core/events`), the
  `core -> platform/db` prohibition (not violated — my new edge runs the other
  direction), the `core -> features` prohibition (respected by duplicating
  rather than importing `computeBackoffMs`).
- Files audited: all 6 changed files.
- Violations found: none at error severity. The adapter-owns-cap-decision
  split above is the one WARNING-level item; smallest compliant fix is the
  `OutboxPort.markFailed({ ..., nextStatus })` port-contract change described
  above, deferred as a cross-repo follow-up.
- ADR ambiguity: none blocking.

**Pre-Completion Checklist:**
- Requirements re-verified: real backoff (exponential, capped) + attempt limit
  with a defined terminal state — both present.
- Fresh evidence: RED (2 failing at import) then GREEN (23/23), then the full
  133-test regression sweep GREEN, all shown above, run in this session, not
  reused from a prior report.
- Test integrity: no certified test deleted; three were corrected in place
  with an explanatory comment (they asserted the exact bug being fixed) — the
  two in `outbox-worker.test.ts` plus `events.integration.test.ts`'s REQ-8.
- Scope: touched 7 files across two commits (`0ae3429d`, `6be26ddb`); did not
  touch `deps.ts`, `apps/admin/src`, or any `fix-comp-root`-held file.
- Open items: cross-repo `OutboxPort.markFailed` contract change (optional
  follow-up, not done). Regression sweep is now complete (see above) — no
  longer an open item.

**Known defect at `deps.ts` lines ~439-441 / ~934** (per dispatch, not mine to
fix): confirmed by inspection this file is off-limits (`fix-comp-root` is live
in it) — did not open beyond what was necessary to know not to touch it, and
did not verify the comment/construction mismatch directly since that would
mean reading a file another agent is actively writing. Reporting only that I
respected the off-limits boundary; I did not independently re-confirm the
described comment defect.

## Item 2 — `server/error-mapping/`

Confirmed: `apps/website/src/server/error-mapping/` contains only `INFO.md`
(no `.ts` files). Grepped the whole `apps/website/src` tree for
`error-mapping` — every hit outside that directory is prose in a comment or
spec doc (`features/newsletter/errors.ts:8`, a test file comment, a spec doc),
never an actual `import ... from ".../error-mapping..."`. Ad hoc per-route
error mapping is real and already in use elsewhere (`statusFor()` referenced
in `content-types-routes.test.ts`, an inline "error-mapping helper" in
newsletter's `deps.ts`, route-local logic in
`routes/members/__tests__/disable.unit.test.ts`).

**New finding that changes the recommendation:** `error-mapping/` is not a
uniquely orphaned leftover. `apps/website/src/server/`'s two other declared
"Scaffold" entries in `server/INFO.md` — `request-context/` and `middleware/`
— are in the **identical** state: an `INFO.md` describing intended content and
nothing else. This looks like a deliberate "forward-declared module boundary"
convention for this part of the codebase, not an accident specific to
error-mapping.

**Recommendation: leave `error-mapping/` as-is. Do not delete it in this
dispatch.** Deleting it alone, while its two structurally identical siblings
stay untouched, would be an arbitrary, inconsistent edit against what appears
to be an intentional scaffolding convention — not the "obviously stale,
nothing-references-it, trivially safe" cleanup the dispatch authorized. If the
convention itself should be retired (delete all unbuilt scaffold stubs, or
commit to building them), that is a call for whoever owns the `server/`
module's structure, covering all three stubs together, not a one-off deletion
buried in an unrelated outbox fix. Did not build an error-mapping layer, per
the explicit instruction not to.

## Self-Validation

Not required — this is a pure retry-policy/backoff change inside
`processOutbox`'s failure path with no new HTTP surface, no new external I/O,
and no runtime/UI/auth/migration behavior in scope. Verified entirely through
the unit/contract test suite above (node's native test runner against both the
in-memory and real SQLite adapters).

## Style / function-quality notes

| unit | disposition | findings | local fix attempted |
|---|---|---|---|
| `computeOutboxBackoffMs` | NO_RECORDED_FINDINGS | pure, O(1), injectable randomness for determinism | n/a |
| `processOutbox` | NO_RECORDED_FINDINGS | unchanged shape/complexity; one line's value changed from `now` to a computed backoff timestamp | n/a |
| `SqliteOutboxAdapter.markFailed` | NO_RECORDED_FINDINGS | now wraps a read+write in one transaction (previously a single blind UPDATE) to avoid a lost-update race between two concurrent `markFailed` calls on the same row | n/a |
| `InMemoryOutbox.markFailed` | NO_RECORDED_FINDINGS | mirrors the SQLite adapter's decision using the array's own in-memory row state | n/a |

Zero-findings skepticism pass: the two `markFailed` methods each gained one
new ternary comparing a stored counter to a constant — checked for an
off-by-one against `claimPending`'s "increment before attempt" semantics (an
attempt that reaches `MAX_OUTBOX_ATTEMPTS` is the one that seals the row, not
the one after) by direct test (`outbox-repo.contract.test.ts`'s new case
claims exactly `MAX_OUTBOX_ATTEMPTS` times before asserting permanent
exclusion) rather than trusting the arithmetic by inspection.

## Deviations from plan

- Attempt-cap terminal-state decision placed in the adapters rather than the
  worker (see Architecture Audit WARNING above) — cross-repo port contract
  limitation, not a judgment shortcut.
- Did not implement Item 2 (explicitly conditional on "trivially safe," and
  new evidence — two identical sibling placeholders — made a solo deletion
  no longer trivially safe/obviously correct).

## Suggested next routing

- Optional follow-up: extend `OutboxPort.markFailed` (Jini `packages/cms`) with
  a `nextStatus` parameter to fully match the ADR-036 shape and remove the
  adapter-side policy split — requires a scoped Jini rebuild + restart, so
  scope it as its own dispatch, not bundled with a "keep the dev server up"
  night.
- Item 2: bring to whoever owns `apps/website/src/server/`'s module structure
  as a single decision covering `error-mapping/`, `request-context/`, and
  `middleware/` together.

## Commits

- `0ae3429d` — `fix(outbox): stop immediate re-queue, add exponential backoff and an attempt cap`
  (6 files changed, 231 insertions, 16 deletions).
- `6be26ddb` — `test(site-glue): fix REQ-8 assertion that relied on the pre-fix immediate-reclaim bug`
  (1 file changed, 6 insertions, 1 deletion) — collateral fix found by the
  post-landing regression sweep, kept as its own commit so it reverts
  independently of the main fix.

Both independently revertible (`git revert 6be26ddb` / `git revert 0ae3429d`).
