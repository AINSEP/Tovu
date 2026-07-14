# Tasks: members-remediation

- Spec: SPEC-013 v1.0.0 (hash: sha256:4223c9dd7808b2a49977075b897ed237e979ce83b611ac6b4a963dd6b82eb5b1)
- ADR: ADR-PIPE-013 (ACCEPTED 2026-07-13 — human approval: Leona Burime, blanket approval across ADR-PIPE-008..015; `/audit-work`/Red-Team have NOT run — accepted with that acknowledged gap. `pipeline-state.md`'s `stage`/`red_team_status` rows still read PROPOSED/NOT YET RUN as of the architect pass; this tasks.md treats `adr.md`'s own Status line — ACCEPTED — as authoritative per this dispatch's directive, and the Coordinator should reconcile `pipeline-state.md`'s stale rows in the same pass that records this file.)
- Outline: ADS-project-knowledge/reports/pipeline/013-members/implementation-outline.md (Status: PRODUCED)
- Date: 2026-07-13T00:00:00Z
- Author: Coordinator

## ⚠ Coordinator Audit (2026-07-13, post-session-limit termination)

The implementation agent was killed by an API session limit mid-run, not by a task failure. Audited by direct file inspection + scoped test runs. **Individual task checkboxes below are NOT updated** — verified at phase/module level, not task-by-task. Findings — **this feature is essentially complete**:

- **Done and verified (102/102 scoped tests passing, `tsc` clean):** Phase 1 authz-gap fix — `list.ts`/`get-by-id.ts`/`request-magic-link.ts` all now call `authorize()`, matching `disable.ts`'s shape exactly, confirmed live in the source (not just tested). Phase 2 — public `src/server/routes/members/{sign-in,complete-sign-in}.ts` exist and ARE wired into `server/app.ts`. Phase 3 — `consent-service.ts` (D1c) built and tested. Phase 4 — `SqliteMemberRepo` built and contract-tested; correctly **NOT** flipped live in `app.ts`/`deps.ts` (still `InMemoryMemberRepo`), matching the deliberate restraint the architect specified. Phase 5 — `Members.tsx` UI updated (disable/resend-link/detail actions present, confirmed via grep).
- **Unverified (not disproven, just not directly checked):** Polish tasks (INFO.md, full coverage sign-off, traceability backfill).
- **Next step if resuming:** just a final full-suite convergence run + Polish — this feature looks ready to consider done pending a final pass, not a resume-from-the-middle situation like SEO/Redirects/Newsletter.

## Format

`[ID] [P?] [Story ref] Description` — [P] = parallel-safe (different files, no shared mutable state within the phase). Phases + order derived from the implementation outline's Module Map, Contract Map, Wiring Map, and Downstream Handoff Notes.

Task checkboxes are **Coordinator-owned state**. TDD, Programmer, TestRunner, and Code Review treat this file as **read-only** unless the Coordinator explicitly delegates a task-list update.

---

## Cross-Feature Dependency Note (read before dispatching)

This feature's permission-naming question (ADR-PIPE-013 Decision §6) resolved as **NO RENAME** — `member.manage` stays exactly as registered, aligning with the flat `domain.verb` precedent Menus (ADR-PIPE-012) and Integrations (ADR-PIPE-015) already landed in `src/identity/permissions.ts`. **Consequently, this feature does NOT need Menus' shared `permission-migrations.ts` mechanism.** No task below imports, extends, or waits on that file. If a sibling agent's handoff implies Members should wire into it, that is a false cross-feature dependency — reject it; Decision §6 explicitly closes this question with "no migration."

Also note: `deps.authorize` already exists on the shared `RouteDeps` interface (`src/server/routes/types.ts` line 152, `AuthorizeFn`) and is already used by `disable.ts` — the Phase 1 authz-gap fix requires **zero** changes to `src/server/routes/admin/members/deps.ts` (it only needs the 3 route files to call the already-available `deps.authorize(...)`, copying `disable.ts`'s exact call shape). `deps.ts` only changes later, in Phase 2 (rate-limiter instances) and Phase 3/4 wiring notes below — see the shared-file caution in Parallelization Rules.

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` (lines/branches/functions/statements). No human-approved override requested.
- Integration minimums: defaults `90/90/90/90`.
- E2E minimums: N/A — no browser E2E suite. `apps/admin` has no test runner configured at all today (confirmed via `apps/admin/package.json` — no `vitest`/`jest` dependency, no `test` script); the UI wiring phase (Phase 5) gets a manual `/verify` pass instead, matching the precedent `007-settings-core-ledger/tasks.md` Phase 6 already set for `Settings.tsx`. Adding a frontend test harness is out of this narrowly-scoped remediation's boundary (Article III — ADR-PIPE-013 Decision §7 explicitly scopes this to the 3 already-supported client methods).
- Convergence threshold before Code Review: default `100%` of P1 acceptance tests and all invariants (INV-06 extended, INV-NEW-01, INV-NEW-02, INV-NEW-03) passing. No lower threshold requested.
- **Contract Tests** (from outline): `MemberConsentRepoPort` + the 5 pre-existing member ports, one shared contract-test suite run against both `repo.memory.ts` and `repo.sqlite.ts` (C-002; mirrors `PostRepoPort`'s and `SettingsRepoPort`'s existing convention). No such shared-suite file exists today for the 5 pre-existing ports — only adapter-specific unit tests (`repo.memory.test.ts`) — so this is new test infrastructure for `members`, not an extension of an existing file.

### Required Suites

- Unit: **required** — rate-limit profile boundary behavior, `requestSignInLink`'s origin-fallback branch, consent chokepoint grant-path invariant, consent read totality.
- Integration: **required** — 3 newly-authorized admin routes (403 proof), 2 new public HTTP routes (rate-limit + cookie-isolation + INV-06 proof), the admin-triggered request-magic-link route's added rate-limit + authz-ordering proof.
- E2E: **not applicable** — see Coverage Profile note above.

### Coverage Tool

- Tool: node:test built-in coverage — `node --import tsx --test --experimental-test-coverage` (matches existing `npm run test:cov`, no new dependency).
- Machine-readable output path: `coverage/lcov.info`.
- Cleanup paths before run: `coverage/`.
- Per-suite output: unit + integration share the node:test run (co-located `*.test.ts`); split reporting by path glob if TestRunner needs per-suite numbers.

### Performance (optional)

- N/A — no new latency/throughput NFR beyond the rate-limit profiles themselves, which are the feature (not a performance target to separately benchmark).

---

## Phase 0 — Setup

No story dependencies. Both tasks are pure data/schema additions with no behavior change on their own.

- [ ] T001 [P] Add 7 Drizzle table definitions to `src/infra/db/schema.ts`: `members`, `member_tiers`, `member_subscriptions`, `member_sessions`, `member_magic_tokens`, `member_consents` (new), and widen `member_revisions.entity_kind` to include `'consent'` (per ADR-PIPE-013 Decision §5, mirroring `SqlitePostRepo`'s/`src/features/settings/repo.sqlite.ts`'s existing table-definition shape)
- [ ] T002 [P] Add 3 `RateLimitProfile` constants to `src/server/middleware/rate-limit.ts`: `MAGIC_LINK_PER_EMAIL` (windowSeconds=3600, max=5, burst=0), `MAGIC_LINK_PER_IP` (windowSeconds=3600, max=20, burst=0), `MAGIC_LINK_COMPLETE_ATTEMPT` (windowSeconds=60, max=20, burst=5) — data constants only, no change to `createRateLimiter`/`resolveClientIp`

---

## Phase 1 — [Story: REQ-10/AC-20/AC-21] Authorization gap fix — HIGHEST PRIORITY, live security gap (P1)

**Goal**: All four admin member routes (`list`, `get-by-id`, `request-magic-link`, `disable`) uniformly require `authorize({permission:'member.manage', ...})` before acting — closing a live, exploitable authorization gap in already-shipped code. Per the dispatch directive, TDD-certifies this with a failing 403 test **first**, the same treatment SPEC-014 (Analytics) gave its identical class of gap.
**Independent test**: call `list`/`get-by-id`/`request-magic-link` with a valid admin session but no `member.manage` grant → assert `403 FORBIDDEN` on all three, matching `disable.ts`'s existing (already-correct) behavior.
**No dependency on anything else in this outline** (per implementation-outline.md Downstream Handoff Notes) — this phase can be dispatched immediately, independent of Phase 0.

- [ ] T003 [P] [AC-20, AC-21] Write failing test: `GET /api/admin/v1/workspaces/:workspaceId/members` without `member.manage` → `403 FORBIDDEN` — `src/server/__tests__/routes/members-auth.test.ts` (new file)
- [ ] T004 [P] [AC-20, AC-21] Write failing test: `GET /api/admin/v1/workspaces/:workspaceId/members/:memberId` without `member.manage` → `403 FORBIDDEN` — same file
- [ ] T005 [P] [AC-20, AC-21] Write failing test: `POST /api/admin/v1/workspaces/:workspaceId/members/request-magic-link` without `member.manage` → `403 FORBIDDEN` (authz check only in this phase — the shared rate-limit check on this same route is added in Phase 2, T022) — same file
- [ ] T006 [P] [AC-20, AC-21] Implement `authorize({principalId, permission:'member.manage', workspaceId, entityType:'member'})` in `list.ts`, copying `disable.ts`'s exact call shape (including its `403` response body shape: `{error, code:'FORBIDDEN', details:{permission, reason}}`) — `src/server/routes/admin/members/list.ts` (depends T003)
- [ ] T007 [P] [AC-20, AC-21] Same as T006 for `get-by-id.ts`, with `entityId: memberId` — `src/server/routes/admin/members/get-by-id.ts` (depends T004)
- [ ] T008 [P] [AC-20, AC-21, INV-NEW-03] Same as T006 for `request-magic-link.ts` — `authorize()` only in this phase, placed so that Phase 2's rate-limit check (T022) will land strictly *after* it (INV-NEW-03: authz must run before the rate-limit check consumes any budget) — `src/server/routes/admin/members/request-magic-link.ts` (depends T005)
- [ ] T009 Run Phase 1 tests to convergence — assert all 3 previously-ungated routes now return `403` for a caller without `member.manage`, and that an existing seed-data caller who already holds `member.manage` (the only caller type that exists today, per ADR-PIPE-013 Migration Safety) sees no behavior change

**Checkpoint**: Live authorization gap closed — all four admin member routes uniformly gated. **This is the highest-priority remediation slice and should be dispatched to TDD first**, ahead of every other phase in this file.

---

## Phase 2 — [Story: coupled sign-in slice] Public sign-in routes + magic-link rate limiting (P1)

**Goal**: The two missing public routes (`sign-in` request + `complete-sign-in`) land together with the rate limiter ADR-030 OQ-8 names as a hard pre-launch precondition — per ADR-PIPE-013 Decision §2+3, these are treated as **one coherent story phase**, not split, because shipping `completeSignIn`'s route without the public request route (or without the rate limiter) leaves the feature non-functional or reopens an abuse surface.
**Independent test**: a real visitor can `POST .../sign-in` with their email, receive a magic link (absolute URL if their workspace has a verified origin, relative otherwise), `POST .../sign-in/complete` with the token, and receive a `tovu_member_session` cookie distinct from the admin `tovu_session` cookie — end-to-end, with no operator involvement.
**Depends on**: Phase 0 (T002, rate-limit profiles must exist before any route consumes them) and Phase 1 (T008 — `request-magic-link.ts` is a shared file; this phase's rate-limit addition to that same route must land *after* Phase 1's `authorize()` addition, not in parallel with it).

- [ ] T010 [P] Write failing unit test: `MAGIC_LINK_PER_EMAIL` — the 6th request within the window for the same email is denied with `retryAfterSeconds`; window resets correctly — `src/server/middleware/__tests__/rate-limit.test.ts` (extend existing file)
- [ ] T011 [P] Write failing unit test: `MAGIC_LINK_PER_IP` — the 21st request within the window for the same IP is denied — same file
- [ ] T012 [P] Write failing unit test: `MAGIC_LINK_COMPLETE_ATTEMPT` — the 26th attempt within 60s from one IP is denied — same file
- [ ] T013 [P] Write failing unit test: `requestSignInLink`'s origin-fallback branch — a workspace with a verified origin gets an absolute link via `OriginRegistryPort.canonicalOrigin`; a workspace that throws `OriginNotVerifiedError` falls back to today's relative-path link, logs one warning-level line (`workspaceId` only — never the email or token), and returns the same `{delivered:true}` shape either way (INV-06 preserved) — `src/members/__tests__/write-service.test.ts` (extend existing file)
- [ ] T014 [INV-06] Implement the origin-fallback + warn-log logic in `requestSignInLink` — `src/members/write-service.ts` (depends T013)
- [ ] T015 [P] [INV-06] Write failing integration test: `registerPublicMemberSignInRequestRoute` — both `MAGIC_LINK_PER_EMAIL` and `MAGIC_LINK_PER_IP` are independently enforced (6th same-email request denied even from different IPs; 21st same-IP request denied even for different emails); a registered and an unregistered email both get `{delivered:true}` below the limit and both get `429` identically once exceeded — `src/server/__tests__/routes/members-public-sign-in.test.ts` (new file)
- [ ] T016 [P] [INV-NEW-01] Write failing integration test: `registerPublicMemberCompleteSignInRoute` — response sets cookie name `tovu_member_session`, never `tovu_session`; a request carrying only a `tovu_session` cookie (no token) is still treated as anonymous/rejected — the admin cookie has zero effect on this route; `MAGIC_LINK_COMPLETE_ATTEMPT` enforced — `src/server/__tests__/routes/members-public-complete-sign-in.test.ts` (new file)
- [ ] T017 [P] [INV-NEW-03] Write failing integration test: the admin-triggered `request-magic-link.ts` route now also enforces `MAGIC_LINK_PER_EMAIL` (defense-in-depth), and an unauthorized caller's `403` does **not** decrement the rate-limit window for that email (authz-before-rate-limit ordering) — extend `src/server/__tests__/routes/members-auth.test.ts` (from Phase 1)
- [ ] T018 [P] Implement `MemberPublicRouteDeps` — a narrower deps bundle with no `authorize`/session dependency (this route family must stay unauthenticated by design) — `src/server/routes/members/deps.ts` (new file)
- [ ] T019 [P] Implement `PublicMemberResponse` type + serializer, excluding every field `toAdminMemberResponse` excludes plus `emailVerifiedAt`/`workspaceId`/`version` (a public serializer leaking an internal field is a direct PII exposure on an unauthenticated response) — `src/server/http/members.ts` (new file, mirrors `src/server/http/admin/members.ts`)
- [ ] T020 [P] Implement `registerPublicMemberSignInRequestRoute` — checks `MAGIC_LINK_PER_EMAIL` AND `MAGIC_LINK_PER_IP` (both must pass) before calling `requestSignInLink` — `src/server/routes/members/sign-in.ts` (new file; depends T010, T011, T014, T015, T018)
- [ ] T021 [P] Implement `registerPublicMemberCompleteSignInRoute` — checks `MAGIC_LINK_COMPLETE_ATTEMPT`, calls `completeSignIn`, sets the `tovu_member_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`), never reads/writes `tovu_session` — `src/server/routes/members/complete-sign-in.ts` (new file; depends T012, T016, T018, T019)
- [ ] T022 [INV-NEW-03] Add the `MAGIC_LINK_PER_EMAIL` check to the admin `request-magic-link.ts` route, placed strictly after Phase 1's `authorize()` call (T008) — `src/server/routes/admin/members/request-magic-link.ts` (depends T008, T010, T017 — **shared-file caution**: do not dispatch this in parallel with T008; it must start only after Phase 1's checkpoint passes)
- [ ] T023 Wire rate-limiter instances into `MembersRouteDeps` — `src/server/routes/admin/members/deps.ts` (depends T022 — **shared-file caution**: this file is touched again in Phase 4 for `memberConsentRepo`; see Parallelization Rules)
- [ ] T024 Wire `app.ts`: import + register the 2 new public routes **outside** `/api/admin`'s `requireAdminSession` middleware (alongside the existing `registerContentPostGetRoute`-style public mount), and wire the 3 rate-limiter instances into route deps — `src/server/app.ts` (depends T020, T021, T023 — **shared-file caution**: `app.ts` is touched again in Phase 4 for `MemberConsentRepoPort` wiring; boot-time repo adapters remain in-memory, unchanged by this task — see Phase 4's explicit non-task)
- [ ] T025 Run Phase 2 tests to convergence — assert INV-06 holds under both rate-limit and origin-fallback conditions, INV-NEW-01 (cookie isolation) and INV-NEW-03 (authz-before-rate-limit ordering) both hold

**Checkpoint**: The feature is genuinely end-to-end functional for a real visitor for the first time; OQ-8's hard pre-launch precondition (rate limiter) is closed.

---

## Phase 3 — [Story: D1c] Consent module (`consent-service.ts`) (P1) — [P] with Phase 2

**Goal**: `MemberConsentRepoPort` + `consent-service.ts` implement the locked 4-0 crosscutting-sweep D1c ruling — Members-owned, purpose-keyed consent records, request-then-confirm-only path to `granted`. Newsletter's own calling-side wiring is explicitly out of scope (ADR-PIPE-013 Decision §4, W-007).
**Independent test**: `requestConsent` then `confirmConsent` for the same `(memberId, purpose)` reaches `status='granted'`; calling `confirmConsent` with no prior `requestConsent` throws `MemberNotFoundError` and never silently creates a granted row (INV-NEW-02); `revokeConsent` on an already-revoked purpose is a no-op.
**Independent of Phase 2** (disjoint files: `consent-service.ts`/`ports.ts`/`types.ts` vs. the sign-in-slice's route files) — safe to dispatch in parallel with Phase 2. Depends on Phase 0 (T001) only for the eventual SQLite mapping in Phase 4, not for this phase's own tests/implementation.

- [ ] T026 Implement `MemberConsentRecord`, `ConsentPurpose`, `ConsentStatus`, `ConsentEvidence` types — `src/members/types.ts`
- [ ] T027 Implement `MemberConsentRepoPort` interface (rule-of-two seam) — `src/members/ports.ts` (depends T026)
- [ ] T028 [P] [INV-NEW-02] Write failing test: `requestConsent` creates exactly one `status='pending'` value row + one same-tx `member_revisions` row (`entity_kind='consent'`, `op='consent_request'`) — `src/members/__tests__/consent-service.test.ts` (new file)
- [ ] T029 [P] [INV-NEW-02] Write failing test: `confirmConsent` transitions `pending → granted`; calling it with no prior `requestConsent` call for that `(memberId, purpose)` throws `MemberNotFoundError` and creates no row — same file
- [ ] T030 [P] Write failing test: `revokeConsent` is idempotent — revoking an already-revoked purpose is a no-op, not an error, matching `disableMember`'s idempotency convention — same file
- [ ] T031 [P] Write failing test: `checkConsent` returns `{status:'none'}` (total function, never throws) when no row exists for that `(memberId, purpose)` — same file
- [ ] T032 Implement `InMemoryMemberConsentRepo` — `src/members/repo.memory.ts` (depends T027)
- [ ] T033 [INV-NEW-02] Implement `consent-service.ts`: `requestConsent`/`confirmConsent`/`revokeConsent`/`checkConsent`, kept separate from `write-service.ts` (distinct actor model — `originModule` attribution, not member/operator), same-tx `member_revisions` writes on every state change — `src/members/consent-service.ts` (new file; depends T027, T032, T028–T031)
- [ ] T034 Update barrel exports for the 4 new functions + 4 new types — `src/members/index.ts` (depends T033)
- [ ] T035 Run Phase 3 tests to convergence — assert INV-NEW-02 (no path to `granted` except via `requestConsent` then `confirmConsent`) holds

**Checkpoint**: D1c's locked cross-cutting ruling has a concrete, buildable owner-side implementation. Newsletter's calling side (W-007) remains correctly unbuilt — not this feature's scope.

---

## Phase 4 — [Story: REQ-18] SQLite/Drizzle adapter for all 6 ports (P1, Article IV parity) — [P] with Phase 2/3 in principle, but depends on their outputs

**Goal**: `src/members/repo.sqlite.ts` implements all 6 ports (the 5 pre-existing + the new `MemberConsentRepoPort`), reaching Article IV rule-of-two parity with every sibling feature module. Explicitly does **not** flip `app.ts`'s boot wiring — see the non-task below.
**Independent test**: the shared contract-test suite (T036) passes identically against `repo.memory.ts` and `repo.sqlite.ts` for every one of the 6 ports' full interface.
**Depends on**: Phase 0 (T001, the 7 Drizzle table defs) and Phase 3 (T026, T027 — the `MemberConsentRepoPort` interface and its backing types must exist before the SQLite adapter can implement them; T032, since the contract suite needs the in-memory adapter to run against too).

- [ ] T036 [C-002] Build a shared contract-test suite covering all 6 `Member*RepoPort` interfaces (the 5 pre-existing + `MemberConsentRepoPort`) — new file, no such shared-suite convention exists today for the 5 pre-existing ports (only adapter-specific unit tests in `repo.memory.test.ts`); mirrors `src/features/settings/__tests__/repo.contract.test.ts`'s shape — `src/members/__tests__/repo.contract.test.ts` (depends T027, T032)
- [ ] T037 Implement `src/members/repo.sqlite.ts` for all 6 ports, mirroring `SqlitePostRepo`'s/`src/features/settings/repo.sqlite.ts`'s exact shape (typed row → domain-record mapping, `.onConflictDoUpdate` upserts, `and(eq(...))` composite-key queries) — `src/members/repo.sqlite.ts` (new file; depends T001, T027, T036)
- [ ] T038 Run the shared contract-test suite against **both** adapters to convergence — proves adapter equivalence with no live-data reconciliation needed (no persisted member data exists anywhere today to reconcile). **Explicitly does NOT include a task that flips `src/server/app.ts`'s boot wiring from `InMemoryMemberRepo`/`InMemoryMemberConsentRepo` to the new SQLite adapters** — ADR-PIPE-013 Decision §5 deliberately defers this: no feature in this repo has flipped that switch yet (confirmed `SqlitePostRepo` exists but `app.ts` still boots `InMemoryPostRepo`), and making Members the first would be a unilateral, repo-wide infrastructure decision this feature's remediation should not make alone. That switch-flip is tracked as a Re-evaluation Trigger in ADR-PIPE-013, not a task here.

**Checkpoint**: Rule-of-two closed for all 6 ports; boot wiring intentionally, explicitly untouched.

---

## Phase 5 — [Story: REQ-11] UI wiring (P1/P2) — independent of every backend phase

**Goal**: `Members.tsx` gains a disable action, a resend-sign-in-link action, and a detail-expansion, calling the 3 already-existing, already-unused `apps/admin/src/lib/api.ts` client methods (`disableMember`, `requestMemberMagicLink`, `getMember`). No new backend contract is needed. Pagination is explicitly deferred (ADR-PIPE-013 Decision §7) — not part of this phase.
**Independent test**: click disable on a row → the row's status updates without a full reload; click resend-link → an inline success/error notice appears; click a row → a detail panel calling `getMember` renders.
**Depends on nothing new on the backend** — all 3 methods already exist and are already wired end-to-end in `api.ts`; this phase can proceed fully in parallel with every backend phase above.

- [ ] T039 Implement `Members.tsx`: a disable action per row (`api.disableMember`), a resend-sign-in-link action per row (`api.requestMemberMagicLink`), and a member detail expansion on row click (`api.getMember`); disable the clicked control during in-flight requests; surface errors via the existing `notice error` convention — `apps/admin/src/sections/Members.tsx`. **No test-first task**: `apps/admin` has no test runner configured today (confirmed via `package.json` — no `vitest`/`jest`, no `test` script); matches `007-settings-core-ledger/tasks.md`'s T045 precedent for `Settings.tsx`. Stays a single flat file, matching every other admin section's convention.
- [ ] T040 Manual `/verify` pass: exercise disable, resend-sign-in-link, and detail-expand actions in a running browser session

**Checkpoint**: All 3 named UI gaps wired; pagination remains a named, separately-scoped follow-up (not silently dropped — see Deferred section below).

---

## Phase N — Polish

Cross-cutting improvements after all required stories pass.

- [ ] T041 [P] Update `ADS-project-knowledge/specs/013-members/traceability.spec.md`: mark AC-21 ("list.ts has no permission check") as superseded by this remediation — record the one deliberate breaking change (a caller with a valid admin session but no `member.manage` now gets `403` instead of `200`) — and add rows for the new contracts (C-001..C-016), the extended INV-06, and the two new internal invariants (INV-NEW-01 cookie isolation, INV-NEW-02 consent grant path, INV-NEW-03 authz-before-rate-limit ordering)
- [ ] T042 [P] Full `npm run test:cov` pass — confirm 98/98/98/98 unit / 90/90/90/90 integration coverage minimums for every new/modified file in this remediation, or file a human-approved override with TestRunner's actual measured numbers

---

## Parallelization Rules

- Tasks marked [P] in the same phase can be dispatched simultaneously.
- Modules must have no shared mutable state during parallel execution.
- No Programmer instance writes to a file another instance reads.
- If a shared utility needs changes, serialize — do not parallelize writes to shared code.
- **Phase 1 is the highest-priority slice and has no dependency on anything else in this file** — dispatch it first, standalone, per the dispatch directive.
- Phase 2 and Phase 3 are parallelizable with each other (disjoint files: the sign-in-slice's route/rate-limit files vs. `consent-service.ts`/`ports.ts`/`types.ts`), but Phase 2 depends on Phase 0 (T002) and on Phase 1 (T008) specifically for `request-magic-link.ts` — do not dispatch T022 until Phase 1's checkpoint passes.
- Phase 4 depends on Phase 0 (T001) and Phase 3 (T026, T027, T032) — it cannot start until `MemberConsentRepoPort`'s interface exists, even though Phase 4's own file (`repo.sqlite.ts`) is otherwise independent of Phase 2.
- **Shared-file caution — `src/server/routes/admin/members/deps.ts`**: touched by Phase 2 (T023, rate-limiter instances) and referenced again conceptually by Phase 4 (no `memberConsentRepo` field is added there in this task list, since Phase 4 deliberately does not wire boot-time adapters — see T038's non-task). If a future pass does add that wiring, serialize it after T023, do not parallelize.
- **Shared-file caution — `src/server/app.ts`**: touched by Phase 2 (T024, public route registration). No Phase 4 task touches it (boot wiring is explicitly deferred). If Code Review sees an unplanned `app.ts` edit wiring the SQLite adapter into boot, treat it as scope creep against ADR-PIPE-013 Decision §5, not an approved task.
- Phase 5 (UI) is independent of every backend phase and can run fully in parallel with all of them.

## Execution Strategies

**Sequential (single agent):** Phase 0 → Phase 1 checkpoint → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase N

**Parallel (multiple Programmer instances):** Phase 0 → Phase 1 (dispatch first, standalone, highest priority) → {Phase 2 (after Phase 1 checkpoint for T022 only; T010–T021 can start once Phase 0 lands), Phase 3, Phase 5} simultaneously → Phase 4 (once Phase 3's T026/T027/T032 land) → TestRunner aggregates → Phase N

---

## Coverage Summary Against SPEC-013 v1.0.0 + ADR-PIPE-013

Every P1 REQ/AC/INV/EC this remediation targets has explicit task coverage, including the two gaps this ADR discovered beyond ADR-030's original text.

| Spec/ADR Item | Priority | Task Coverage |
|---|---|---|
| REQ-10 / AC-20 (missing member.manage → 403 on `disable.ts`) | P1 | Already correct pre-remediation; T009 re-confirms no regression |
| REQ-10 / AC-21 (list.ts has no permission check) — **the only-disable-authorizes gap** | P1 | T003, T006, T009 |
| (same gap class, `get-by-id.ts`) | P1 | T004, T007, T009 |
| (same gap class, `request-magic-link.ts`) | P1 | T005, T008, T009 |
| REQ-15 / AC-27 (`completeSignIn` has zero HTTP callers) + **the newly-discovered missing public `requestSignInLink` route** | P1 | T015, T016, T018–T021, T024, T025 |
| REQ-17 (no magic-link rate limiter exists) / ADR-030 OQ-8 (hard pre-launch precondition) | P1 | T002, T010–T012, T015–T017, T020–T023, T025 |
| REQ-16 (D1c consent — no code exists) | P1 | T026–T035 |
| REQ-18 / AC-29 (no SQLite/Drizzle adapter, no member table in schema.ts) | P1 | T001, T036–T038 |
| REQ-14 (permission-naming, OQ-03) | — | **No task** — ADR-PIPE-013 Decision §6 resolves this as "no rename"; `src/identity/permissions.ts` is explicitly UNCHANGED. Recorded here so no task is mistakenly added. |
| REQ-11 / AC-22, AC-23 (UI gaps — 3 unused client methods) | P1/P2 | T039, T040 |
| INV-06 (constant anti-enumeration response, extended) | P1 | T013–T015, T025 |
| INV-NEW-01 (cookie-family isolation, `[internal-invariant]`) | P1 | T016, T021, T025 |
| INV-NEW-02 (consent grant path, `[internal-invariant]`) | P1 | T028, T029, T033, T035 |
| INV-NEW-03 (authz-before-rate-limit ordering, `[internal-invariant]`) | P1 | T008, T017, T022, T025 |
| C-001..C-006 (consent types/port/service) | — | T026–T034 |
| C-007 (`requestSignInLink` modified) | — | T013, T014 |
| C-008/C-009/C-010 (rate-limit profile constants) | — | T002 |
| C-011 (request-magic-link route modified) | — | T008 (authz), T022 (rate limit) |
| C-012/C-013 (public route registrars) | — | T020, T021 |
| C-014 (`PublicMemberResponse` serializer) | — | T019 |
| C-015 (rate-limit wiring, shared instance) | — | T023, T024 |
| C-016 (Members.tsx row actions) | — | T039 |
| OQ-01 (public completeSignIn route) | Resolved by this ADR | T015, T016, T018–T021 |
| OQ-02 (permission-gate list/get/request-magic-link) | Resolved by this ADR | T003–T009 |
| OQ-03 (rename member.manage) | Resolved by this ADR — no rename | No task (see REQ-14 row above) |
| AC-21 traceability update (the row this remediation intentionally contradicts) | — | T041 |

---

## Deferred (ADR-backed, not a coverage gap)

- Flipping `app.ts`'s boot wiring from in-memory to SQLite for Members — explicitly deferred per ADR-PIPE-013 Decision §5; a repo-wide item (no feature has done this yet), not solved unilaterally here. Not tracked as a task by design (see T038's explicit non-task note).
- Building real multi-origin serving infrastructure for full physical member/admin session isolation — out of scope; this remediation ships the achievable logical isolation (distinct cookie name, distinct route family, no shared middleware) instead, per ADR-PIPE-013 Decision §3 and Tradeoff Tension.
- Newsletter's own calling-side wiring to `consent-service.ts` — Newsletter's own future ADR-PIPE-011 concern (Wave 2), explicitly not duplicated here (W-007).
- `apps/admin/src/lib/api.ts` pagination support for `listMembers()` — a separately-scoped follow-up per ADR-PIPE-013 Decision §7; not folded into T039's UI slice.
- Governance-ADR text correction reconciling ADR-030/`ADR-INDEX.md`'s stale `admin.members.*` prose with the actual landed flat-`domain.verb` convention — flagged in ADR-PIPE-013 Related Decisions and `pipeline-state.md`'s `governance_adr_promotion` row as owed, but it is a governance-file edit, not a Members implementation task; route separately to the `adr-governance` skill evaluation, not this tasks.md.
- Red-Team dispatch against ADR-PIPE-013 — owed before the ADR would normally reach ACCEPTED under the standard gate, but this ADR was accepted via blanket human approval (ADR-PIPE-008..015) with that gap acknowledged. Not a task in this file; a Coordinator-level follow-up.
