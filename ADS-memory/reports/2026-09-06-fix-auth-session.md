# Fix auth/session defects — 2026-09-06

Persona: `AI-Dev-Shop/agents/programmer/skills.md` v1.7.1 loaded. Branch `restructure/apps-website-phased`.

## Item 1 — DONE — commit `e332ec33`

Claim verified: `apps/desktop/main.cjs`'s `openSiteWindow` called `startTovuServer({..., emitBootToken: true})`
unconditionally on every open, and `authenticateSiteSession` always redeemed it, so every desktop
launch/site-open minted a brand-new `mintSessionForPrincipal` row (`dev-auth.ts:297`) with
`SESSION_TTL_MS` (30 days). No logout call existed anywhere in `apps/desktop`.

Fix, two halves (see commit message for full rationale):
1. `hasActiveSessionCookie` (new, `desktop-auth.cjs`) checks the site's `persist:`-prefixed partition
   for an existing `tovu_session` cookie before minting; `openSiteWindow` now skips
   `--emit-boot-token`/redemption when one is found. Stops the per-launch mint.
2. `endSiteSession` (new, `desktop-auth.cjs`) POSTs the existing `/api/admin/v1/auth/logout` route on
   `window.on("closed", ...)`, before `server.stop()`. Gives every session a real end.

Chose reuse + real revocation over cap/expire — see commit message "Chosen over..." paragraph.

Verification (tsc does not check `.cjs`):
- `node --check apps/desktop/main.cjs` — OK
- `node --check apps/desktop/src/desktop-auth.cjs` — OK
- RED: 7 new tests in `desktop-auth.test.cjs` failed with `is not a function` against pre-change
  source (confirmed via `node --test` on the exact file path).
- GREEN: same command, 17/17 pass after implementation.
- `main.cjs`'s own wiring (the `openSiteWindow` edit) has no direct test — consistent with the rest
  of that file, which is Electron-runtime-only and untested elsewhere too. Verified by manual trace
  only; flagged as residual risk below.

Residual/known risk:
- A hard kill (SIGKILL/crash) skips the `closed` handler, so that one session survives to its natural
  30-day expiry — same fail-open tradeoff already documented for this shell's crash registry.
- The 713 pre-existing live rows are untouched (no mass delete, no boot-time cleanup, per instruction).
  No operator-invoked cleanup script was written — out of scope unless requested; flagging here as a
  follow-up candidate.
- No Electron/Playwright E2E run performed (machine-safety scope: one test process at a time, avoid
  heavy runs in a 5-agent shared tree). `development/e2e/desktop-shell.spec.ts` exists but was not run.

## Item 2 — DONE — commit `2b039738`

Confirmed the "no dependency path between them" claim in `boot-session-token.ts`'s header (lines 41-45,
102-104) was false: `apps/website/src/cli/commands/serve.ts` builds the `RouteDeps` bag
(`createSqliteRouteDeps`, line 214) that flows into `createApp(deps)` (line 257), which registers
`registerAuthRoutes(app, deps)` including the boot-session route — the SAME function that later calls
`mintBootSessionToken()` (line 283) in the `listening` callback. Corrected the comment to the narrower
true claim: neither call site threads the token through `deps`, which is the real reason for the
standalone module.

Added `apps/website/src/server/__tests__/admin-boot-session-route.test.ts`, a real-HTTP route-level
suite (5 tests): exact 401 body for an invalid/spent token, a successful redemption that mints a
session which then authenticates `/me`, single-use enforced at the route (not just the store), the
loopback guard running before the token is examined (via `extractRouteHandler` — this repo's own
documented exception for a branch unreachable through real HTTP in a test environment), and
coexistence with ordinary login.

RED-then-GREEN evidence: the suite passed immediately against the existing route — no defect found,
a valid outcome, not a fix. To prove the suite has real teeth (not a vacuous pass), temporarily
mutated the 401 error text in `dev-auth.ts`, confirmed exactly the two tests asserting that text went
RED (`admin-boot-session-route.test.ts` run: 3 pass / 2 fail), reverted (`git diff` confirmed clean),
reran and confirmed 5/5 green.

Verification commands used (repo root, `TOVU_ADMIN_PASSWORD` unset):
```
env -u TOVU_ADMIN_PASSWORD node --import tsx --test --experimental-test-module-mocks apps/website/src/server/__tests__/admin-boot-session-route.test.ts
npx tsc --noEmit -p apps/website/tsconfig.json   # no errors in touched files
```

## Item 3 — INVESTIGATION COMPLETE, no implementation (as directed)

Confirmed the duplication is real. Read (read-only, no edits, no build) `@jini-ai/cms`'s
`/Users/la/Programming/Jini/packages/cms/src/identity/auth-service.ts`:

- Its private `hashToken` (line 35-37): `createHash("sha256").update(rawToken).digest("hex")` —
  byte-for-byte what Tovu's `mintSessionForPrincipal` (`dev-auth.ts:306`) re-implements inline.
- `login()` (lines 57-102) is the library's only session minter, and it hard-requires a
  username+password verification path (lines 68-84) before it will construct a `SessionRecord` —
  there is no way to reach the session-construction lines (86-99) without also proving a password,
  which is exactly why Tovu's boot-session route (already principal-identified via a loopback-only
  single-use token, not a password) cannot call `login()` and had to duplicate the session-write
  logic instead.
- One existing, minor divergence from the duplication: Jini's `newRawToken()` uses
  `randomBytes(32).toString("hex")` (64 chars); Tovu's inline version uses
  `randomBytes(32).toString("base64url")` (~43 chars). Harmless today (each side hashes whatever
  string it generated, so `validateSession` still matches), but it is exactly the kind of
  independent-encoding drift the doc comment on `mintSessionForPrincipal` already flags as "the one
  real fork risk in this route."
- `login()` also records `ip`/`userAgent` on the `SessionRecord`; Tovu's boot-session mint sets
  neither (left `undefined`) since it isn't going through `login()`. A shared seam should decide
  whether the boot-session route should pass those through too.
- `identity`'s public barrel (`src/identity/index.ts:75-82`) exports `login`, `logout`,
  `validateSession`, `getEffectivePermissions`, `SESSION_TTL_MS` from `auth-service.ts` — confirmed
  no `createSessionForPrincipal` (or equivalent) exists today.

**Proposed seam**: a new exported `createSessionForPrincipal` in
`Jini/packages/cms/src/identity/auth-service.ts`, alongside `login`/`logout`/`validateSession`:

```ts
export async function createSessionForPrincipal(required: {
  deps: AuthServiceDeps;
  input: { workspaceId: UUID; principalId: UUID; ip?: string; userAgent?: string };
}): Promise<{ session: SessionRecord; rawToken: string }> {
  const { deps, input } = required;
  const nowIso = deps.clock.nowIso();
  const rawToken = newRawToken();
  const session: SessionRecord = {
    id: deps.idGen.newId(),
    workspaceId: input.workspaceId,
    principalId: input.principalId,
    tokenHash: hashToken(rawToken),
    createdAt: nowIso,
    expiresAt: isoPlusMs(nowIso, SESSION_TTL_MS),
    ip: input.ip,
    userAgent: input.userAgent,
  };
  await deps.repos.sessions.save(session);
  return { session, rawToken };
}
```

- Factors the session-construction block already inside `login()` (lines 86-98) into this function;
  `login()` would call it after its own password verification instead of duplicating the write, so
  the library gains ONE minter used by both `login()` and any principal-already-identified caller
  (`login()`'s own `lastLoginAt` write could then read `session.createdAt` instead of calling
  `clock.nowIso()` a second time — a small extra correctness win, not required for the seam itself).
- Export it from `identity/index.ts`'s existing `auth-service.js` export block (next to `login`).
- Tovu's `mintSessionForPrincipal` (`dev-auth.ts:297-312`) becomes a thin call to this export,
  deleting its own `createHash`/`randomBytes`/expiry-math entirely — closing both the hash-drift risk
  and the token-encoding divergence in one move.
- Explicitly NOT done tonight: no Jini file was edited, no Jini build was run (`pnpm -r build` or
  scoped) — per instruction, since Jini is symlinked into this Tovu checkout's `node_modules` and
  four other agents are active in this tree. This is scheduled separately.
