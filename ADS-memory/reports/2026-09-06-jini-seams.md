# Jini cross-repo seams — 2026-09-06

Persona: `AI-Dev-Shop/agents/programmer/skills.md` v1.7.1 loaded. Label: `Programmer(Jini Seams):`.

## Status: investigation done, implementing

Read both source reports (`2026-09-06-fix-auth-session.md` item 3, `2026-09-06-fix-outbox.md`
item 1) plus the live source:
- `Jini/packages/cms/src/identity/auth-service.ts` (`login`, private `hashToken`/`newRawToken`)
- `Jini/packages/cms/src/identity/index.ts` (barrel)
- `Jini/packages/cms/src/core/ports.ts` (`OutboxPort`)
- `Tovu/apps/website/src/server/inbound/admin-http/dev-auth.ts` (`mintSessionForPrincipal`,
  actual path — the dispatch's line refs were stale, file lives one directory up from where
  cited)
- `Tovu/apps/website/src/contracts/core/events/{outbox-worker,memory-bus,index}.ts`,
  `platform/db/sqlite/outbox-repo.sqlite.ts`
- `Tovu/apps/website/src/features/webhooks/{ports,delivery}.ts`,
  `platform/db/sqlite/webhook-repo.sqlite.ts` (the ADR-036 comparison shape)

Confirmed no other Jini-internal caller of `OutboxPort.markFailed` (grep across `packages/`,
excluding `dist/`) — three test doubles (`workspace/__tests__/create.test.ts`,
`navigation/__tests__/{resolver,menu-service}.test.ts`) implement `markFailed: async () => {}`
with fewer params, which stays structurally assignable to a 4-param interface method in
TypeScript (extra declared params on the interface side, none used in the body) — confirmed this
does not need touching.

Confirmed `entries/write-service.ts` and `content-types/write-service.ts` each declare their own,
unrelated, narrower local `OutboxPort` (`{ enqueue(event) }` only) — not the `core/ports.ts` type,
unaffected by this change.

## Hex vs base64url decision (seam 1)

**Hex wins.** Reasoning: the raw token is never persisted, only its SHA-256 hash is
(`tokenHash`) — `validateSession` re-hashes whatever raw string the cookie presents and looks up
by that hash. So the *generation* encoding is not part of any stored contract; changing it
changes nothing about how already-issued cookies validate. Confirmed this does **not invalidate
existing sessions**: an old base64url-encoded raw token, once issued, is still hashed and
compared as an opaque string exactly as before — nothing re-derives or re-encodes a
previously-minted token.

Given that, the natural resolution is to delete Tovu's duplicated `newRawToken`/`hashToken`
entirely and delegate to Jini's existing private helpers via the new
`createSessionForPrincipal` export — which are hex today. Touching `newRawToken()`'s encoding
itself would be an unrelated, unnecessary behavior change to `login()`'s already-load-bearing
path for zero benefit. So: Jini's hex convention survives; Tovu's boot-session route's
newly-minted tokens become hex-encoded going forward (its stored `tokenHash` column is unaffected
either way — same SHA-256 hex digest shape regardless of raw-token encoding).

## Plan

1. Jini commit: export `createSessionForPrincipal` from `auth-service.ts`, factor `login()` to
   call it, export via `identity/index.ts`.
2. Jini commit: add `nextStatus` to `OutboxPort.markFailed` in `core/ports.ts`.
3. Scoped rebuild: `pnpm --filter @jini-ai/cms build` only (symlinked into Tovu's
   `node_modules`). No repo-wide build. No restart requested yet — will message team lead once
   Tovu-side changes are also ready to verify together, per "do not restart, message and wait."
4. Tovu commit: `mintSessionForPrincipal` becomes a thin wrapper over `createSessionForPrincipal`.
5. Tovu commit: `outbox-worker.ts` computes `nextStatus` and passes it; both adapters
   (`InMemoryOutbox`, `SqliteOutboxAdapter`) become dumb persisters (matches
   `WebhookDeliveryRepoPort`/`webhook-repo.sqlite.ts` shape exactly).

Continuing below as each lands.

## DONE — both seams landed

### Seam 1 — `createSessionForPrincipal`

- Jini commit `b05a4bc4` — `feat(identity): export createSessionForPrincipal, factor login() to use it`.
  Factored `login()`'s inline session-construction block into a new exported
  `createSessionForPrincipal({ deps, input: { workspaceId, principalId, ip?, userAgent? } })`;
  `login()` now calls it (and reuses `session.createdAt` for `lastLoginAt` instead of a second
  `clock.nowIso()` read). Exported via `identity/index.ts` next to `login`.
  - Had to widen `ip`/`userAgent` to `string | undefined` (not bare `?: string`) to satisfy the
    package's `exactOptionalPropertyTypes: true` — matches `SessionRecord`'s own field style.
  - RED: reverted just `auth-service.ts` + `index.ts` (saved/restored via `git diff`/`git apply -R`
    /`git apply`, keeping the new test file in place) — 2 new tests failed with
    `createSessionForPrincipal is not a function`, 7 pre-existing passed.
  - GREEN: restored, same 2 tests pass. Full `identity/` suite: **111/111 green**.
  - `npx tsc -p tsconfig.json --noEmit` (packages/cms): clean.
- Tovu commit `4c6a0797` — `refactor(auth): delegate mintSessionForPrincipal to Jini's shared minter`.
  Deleted the inline `createHash`/`randomBytes`/`SESSION_TTL_MS`-math block; now a thin call to
  the shared minter.
  - RED: added an assertion in `admin-boot-session-route.test.ts` that the issued raw token
    matches `/^[0-9a-f]{64}$/` — failed against the pre-change code (actual value was a
    43-char base64url string). GREEN after the delegation. Full suite: **5/5 green**.
  - `npx tsc --noEmit -p tsconfig.json` (repo root — `apps/website/tsconfig.json` does not exist
    as a separate file, the dispatch's path was stale): clean for every touched file.

**Hex vs base64url — final answer: hex.** Written up in full above; short version: the raw
token's encoding is not part of any stored contract (only its SHA-256 hash is persisted, and
`validateSession` treats the raw token as an opaque string to re-hash), so **no existing session
is invalidated** either way — this only changes what NEW tokens look like. Hex was chosen because
it is what the shared minter's existing, load-bearing `newRawToken()` already produces; touching
that helper's encoding to chase base64url would have been an unrelated, unjustified change to
`login()`'s own path.

### Seam 2 — `OutboxPort.markFailed` `nextStatus`

- Jini commit `c96762fb` — `feat(core): add nextStatus to OutboxPort.markFailed`. Added a required
  4th positional param, `nextStatus: Extract<OutboxRecord["status"], "pending" | "failed">`,
  mirroring `WebhookDeliveryRepoPort.markFailed`'s existing shape exactly (checked against
  `features/webhooks/ports.ts` before writing this). No Jini-internal caller needed updating — the
  three test doubles that implement `markFailed: async () => {}` with fewer params stay
  structurally assignable in TypeScript. `tsc --noEmit`: clean. Ran the 3 affected Jini suites
  (`workspace/create`, `navigation/resolver`, `navigation/menu-service`): **54/54 green**.
- Tovu commit `8d041b52` — `refactor(outbox): move the retry-cap terminal-state decision into the
  worker`. `processOutbox` now computes `nextStatus` from `row.attempts` (the same signal the
  adapters used to read for themselves) and passes it; `InMemoryOutbox`/`SqliteOutboxAdapter`
  became dumb persisters — `SqliteOutboxAdapter.markFailed` also lost its read-then-write
  transaction (nothing left to read before writing).
  - RED: reverted just the 3 implementation files (saved/restored diff), kept the new contract
    test. The new "`markFailed` honors the caller's `nextStatus` rather than re-deriving it from
    persisted attempts" test failed on **both** adapters (`1 !== 0` — a row at `attempts=1`
    declared terminal by the caller came back retryable, because the old adapter overrode the
    caller's decision with its own attempts-based one).
  - GREEN: restored. `outbox-worker.test.ts` + `outbox-repo.contract.test.ts`: **25/25 green**.
  - Regression sweep (**125/125 green**, `env -u TOVU_ADMIN_PASSWORD`):
    `outbox-workspace-id.integration`, `outbox-restart.integration`, `site-glue
    events.integration`, `forms-webhook-fanout`, `newsletter send-pipeline`, `entries-routes`,
    `forms submit-service`, `sitemap-invalidation.integration`,
    `content-types-lifecycle-gap-fill`, `workspace create`.
  - `npx tsc --noEmit -p tsconfig.json`: clean (0 errors repo-wide — the single pre-existing error
    at `outbox-worker.ts:105`, `Expected 4 arguments, but got 3`, that appeared right after the
    Jini port change and before this commit, is gone).
  - `npx eslint` on all 4 changed files: clean, no output (complexity ceiling 9 intact — no new
    branching beyond the ternary already reviewed in the prior fix-outbox report).

## Build

`pnpm --filter @jini-ai/cms build` — the ONLY Jini package rebuilt (scoped, matches the
dispatch's constraint). Confirmed both seams reached `dist/` (`createSessionForPrincipal` in
`dist/identity/{index.d.ts,index.js,auth-service.js}`; `nextStatus` in `dist/core/ports.d.ts`).
No `pnpm -r build`. No `npm publish` / `pnpm publish`.

## Restart

**Did NOT restart the Tovu dev API or any other process.** All verification above ran as fresh
`node --test` processes (which import the just-rebuilt Jini `dist/` directly) — no restart was
needed for my own evidence. A restart IS needed for the long-running Tovu dev server (if one is
up) to pick up this Jini rebuild for anyone driving it live; per instruction I messaged the team
lead instead of doing it myself.

## Commits

Jini (`/Users/la/Programming/Jini`, branch `general-work`):
- `b05a4bc4` — `feat(identity): export createSessionForPrincipal, factor login() to use it`
- `c96762fb` — `feat(core): add nextStatus to OutboxPort.markFailed`

Tovu (`/Users/la/Programming/Tovu`, branch `restructure/apps-website-phased`):
- `4c6a0797` — `refactor(auth): delegate mintSessionForPrincipal to Jini's shared minter`
- `8d041b52` — `refactor(outbox): move the retry-cap terminal-state decision into the worker`

All four are independently revertible (separate commit per seam, per repo, as required).

## Architecture Audit

- Status: **PASS**. Both changes are pure seam extractions matching an already-reviewed sibling
  shape (`WebhookDeliveryRepoPort`/ADR-036) — no boundary violations introduced.
- ADR rules checked: `contracts/core` may not depend on `features` (unaffected — no new imports
  crossing that boundary); `.dependency-cruiser.mjs`'s guarded-module rules for
  `contracts/core/events` (the removed `MAX_OUTBOX_ATTEMPTS` import from the two adapters only
  *shrinks* their dependency surface); Jini's own `packages/cms` `exactOptionalPropertyTypes`
  strictness (caught and fixed during implementation, not shipped broken).
- Files audited: all 7 changed files across both repos (listed above) plus the 2 test files.
- Violations found: none.
- ADR ambiguity: none blocking.

## Pre-Completion Checklist

- Requirements re-verified against the dispatch: both seams implemented exactly as proposed in
  the source reports, including the explicitly-required hex-vs-base64url decision and its
  invalidation analysis.
- Fresh evidence: every RED/GREEN pair above was run in this session, not reused from a prior
  report.
- Test integrity: no certified test deleted or weakened. `outbox-repo.contract.test.ts`'s existing
  cap test was extended (renamed to reflect the caller-decides model) rather than removed; its
  original two markFailed calls gained an explicit `nextStatus` argument, preserving their
  original assertions.
- Scope: touched only the files listed in the commits above. Did not touch `apps/admin/src`,
  `server/routes/types.ts` (read-only), or any other off-limits path from the dispatch.
- Open items: none for this dispatch. The Tovu dev API restart (if a long-running instance is up)
  is outstanding and intentionally left to the team lead.

## Self-Validation

Not applicable in the runtime-harness sense (no new HTTP surface, no new UI) beyond the
route-level HTTP test (`admin-boot-session-route.test.ts`) already exercised as real fresh
evidence above.

