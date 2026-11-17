# U2 (revision 2) — members auth domain: write-service split, credential core, access resolver, password auth

Security code. Facts: `U2-members-auth-domain.facts.md` (15 files, 3,469 lines). Six files (1,785 lines) belong to audit2
A07 (`agent-tools, ports, repo.memory, tool-registrations, types, subscriber-directory`); `capability-card.ts` to
`delete-site-guide.gen.md`. Rules: T-SQLREPO rev 2 §0, §1, §5, §6 (commits, gates, STOP table) apply to every run here.
Revision 2 fixes judge findings 2 (U2b depended on the unwritten U2c), 3 (the destination crossed the universal /
Node boundary), 9 (invented checks) and writes round-1 item 4: **the write-service design is in this sheet**, as runs
U2c-1..3. Repos are public: checks are named by class and location only.

```
runs, in order (user-management chain; INDEX-SU §3):
  U2c-1 write-service split, TOVU ONLY (~170k)        no Jini prerequisite: may run right after S0
  U2a   console mailer -> @jini-ai/platform/mail (~90k)   independent
  U2c-2 credential + challenge core -> Jini (~170k)   needs A07, S3a (manifest order), U2c-1
  U2b   access resolver + password auth -> Jini (~210k, cut point after J1)   needs U2c-2, S4a (lock-key builder)
  U2c-3 sign-in completion + admin writes -> Jini (~200k)   needs U2c-2
jini_target: user-management NEW Node subpath `./members/server` (`jini.entries` line `"./members/server": "node"`, export-map
  entry `./dist/members/server/index.{d.ts,js}`, README row: all in U2c-2's J1). A07's `./members` stays UNIVERSAL:
  no file of this sheet is exported from it, and `rg -n "node:" packages/user-management/src/members -g '!**/server/**'` prints nothing.
prerequisites: S0 DONE (P2, P5a, P5b). A07 landed (`ls packages/user-management/src/members/ports.ts`; absent on Jini `65d73b0d5` = refactor/terra, 2026-11-17).
  error-system design: if it has a scheduled sheet on `members/write-service.ts`, it runs before U2c-1.
```

## Design: `write-service.ts` (677 lines) by its real dependency graph (LESSONS 1-4)
Call graph generated from the file on Tovu `e801e9ae`; su-refresh re-read every declaration line below on refactor/terra
`232764af5` (unchanged; the local export list is :659, the swallowing `catch` :676) (declaration -> what it calls -> which `deps` it reads):
| Group | Declarations (line) | Calls | `deps` read | State owned |
|---|---|---|---|---|
| **A credentials** | `sessionTokens` (:58), `legacyPasswordHasher` (:59), `memberPasswordHasher` (:62), `dummyHashes` (:67), `dummyPasswordHash` (:70), `hashToken` (:80), `newRawToken` (:84), `isoPlusMs` (:88), `SESSION_TTL_MS` (:50), `issueMemberSession` (:451) | - | `passwordHasher`, `ids`, `sessions` | the ONE token helper instance, the fallback hasher, the per-hasher dummy-hash cache (`WeakMap`) |
| **B challenge core** | `INVALID_SIGN_IN_CREDENTIAL` (:38), `MAGIC_LINK_TTL_MS` (:41), `memberChallengeStore` (:222), `asChallenge` (:254), `saveMemberChallenge` (:278), `consumeMemberChallenge` (:363) | A | `ids`, `magicLinks` | - |
| **C challenge request (host-coupled)** | `MEMBERS_FALLBACK_SENDER` (:43), `resolveSignInLinkPath` (:184), `requireSignInMail` (:208), `safeRedirectPath` (:262), `challengeLinkPath` (:267), `prepareMemberChallenge` (:300), `requestMemberChallenge` (:345), `requestSignInLink` (:351) | A (`sessionTokens` at :314, `memberPasswordHasher`), B (`saveMemberChallenge`), V; imports `./auth-mail.js`, `platform/mail`, core `verified-origin` | `origin`, `mailStatus`, `mailer`, `senderIdentity`, `members`, `clock`, `ids` | - |
| **D sign-in completion** | `resolveOrCreateSignInMember` (:109), `createMember` (:158), `resolveConsumedSignInMember` (:393), `completeSignIn` (:416), `notifyMemberCreated` (:670) | A (`issueMemberSession`), B (`consumeMemberChallenge`), V | `ids`, `members`, `principals`, `clock`, `onMemberCreated` | - |
| **E admin writes** | `VALID_SUBSCRIPTION_STATUSES` (:51), `updateProfile` (:476), `disableMember` (:518), `compSubscription` (:558), `setSubscriptionStatus` (:612) | - | `clock`, `members`, `sessions`, `subscriptions`, `tiers`, `ids` | - |
| **V validation** | `EMAIL_PATTERN` (:40), `assertValidEmail` (:93) | - | - | - |
| **F assembly** | `membersWriteService` (:650), the local export list (:659) | C, D, E | - | - |
Edges are one-directional: V <- {C, D}; A <- {B, C, D}; B <- {C, D}; F <- nothing. No cycle; no deferred read (all
module state is created at import and only read inside functions).
**Destinations.** A, B, D, E and V read only ports: generic, Node (A uses the Node token and password helpers) ->
Jini `members/server`. C reads Tovu's mail platform, sender identity and verified-origin composition -> **stays in Tovu**
(`auth-mail.ts`, which imports `@jini-ai/platform/mail/email-template`, stays with it: user-management may not import
platform). F stays in Tovu: it composes the host's C with the library's D and E.
**Origin / link gates:** `resolveSignInLinkPath` (:184; refuses when the origin is not verified) and `safeRedirectPath`
(:262; only local absolute paths survive) are in C and do not move; U2c-1 pins them before the split.

## U2c-1 — split in place (Tovu only; no behaviour change; fixes finding 2's ordering)
New files in `features/members/`, bodies and comments verbatim, each under 300 lines:
`member-credentials.ts` (A; also exports the token helper instance as `memberSessionTokens` for C's :314 use),
`member-challenge.ts` (B), `member-challenge-request.ts` (C + `requestPasswordReset`, moved here from
`password-auth.ts`: it is a four-line purposed call of `requestMemberChallenge`), `member-sign-in.ts` (D),
`member-admin-writes.ts` (E), `member-validation.ts` (V). `write-service.ts` keeps F only (the assembly object).
Importers: `password-auth.ts:7-9` -> `member-credentials.js` (3 names) and `member-challenge.js` (1), and it no longer
imports C; `tool-registrations.ts:36` -> the three owning files; `features/members/index.ts:114,133` (barrel, R-BARRELS):
only specifiers and the moved `requestPasswordReset` line change; tests per the facts file. No file re-exports another.
| Risk (T0, before the split) | Test | Mutation -> RED |
|---|---|---|
| Two token helper instances / two dummy caches after the split | `dummyPasswordHash({ hasher })` returns the same promise for one hasher and a different one for another; over two failed sign-ins and one failed code check the hasher fake's `hash` ran ONCE | create the cache inside the function |
| Fallback hasher selection | `memberPasswordHasher`: `deps.passwordHasher` when given, else one stable fallback instance | always return the fallback |
| Challenge is single use, purpose-bound, attempt-limited | existing `__tests__` cases stay; add: a link token for `signin` presented as `password_reset` -> the same invalid-credential error; an unstored challenge id with a code still spends one verification against the dummy (hasher fake count) | drop the purpose from `scope`; skip the decoy verify |
| Outage is not reported as an invalid credential | `memberChallengeStore.consume`: the three known repo refusals -> `false`; any other error rethrown | catch everything |
| Link path leaves the site | `safeRedirectPath` table: absolute local path kept; scheme-relative, backslash, control and encoded-slash forms dropped | accept any string |
| Sign-in link issued for an unverified origin | `resolveSignInLinkPath` with an unverified origin: today's refusal (`OriginNotVerifiedError` path), nothing saved, nothing sent | skip the check |
Gate: T-SQLREPO §5 row T1 (Tovu typecheck, typecheck:tests, all 56 facts-file tests, `check:boundaries` for cycles, size/complexity).

## U2a — console mailer
`mailer.console.ts` (93; `ConsoleMailerAdapter implements MailerPort`; `console.log` at :75; `randomUUID`) -> Jini
`@jini-ai/platform/mail` Node entry, taking a required `write: (line: string) => void` (no `console.*` in Jini); Tovu
passes `console.log` at its one construction site. T0: the composition selects this adapter exactly under today's
condition (pin it; a console mailer prints sign-in links, so it must not become reachable in another mode), and the
printed link equals the URL the real mail carries. Mutation: select it unconditionally. Stop: `MailerPort` in Jini
platform differs from Tovu's member by member (SKIPPED).
`auth-mail.ts` STAY (with C). `trash-member.ts` STAY-WIRING (imports `@jini-ai/cms/trash`). `consent-service.ts` (261,
labelled DELETE, exported by the barrel at `index.ts:123`): no action until OD-7; it writes privacy records.

## U2c-2 — A, B and V -> `members/server/{credentials.ts,challenge.ts,validation.ts,index.ts}`
J1 adds the subpath (manifest lines above) and the three files, importing `NodeSessionTokens`, `Argon2PasswordHasher`,
`loadArgon2Binding` and the challenge primitives by leaf path from `../../server/` (same package) and the port types
from A07's `../ports.js`. State owner after the move: the Jini module `credentials.ts` (one instance per process, as
today). T1 (pair): Tovu's three files deleted; C, D, E, `password-auth.ts` import from
`@jini-ai/user-management/members/server`. T0 = U2c-1's table, unchanged, plus S0-P5a. A compile-time check:
`MembersWriteServiceDeps` in A07's `ports.ts` must not import `@jini-ai/db` (`rg -n "@jini-ai/db" packages/user-management/src/members`): if it does, A07 is incomplete -> SKIPPED.

## U2b — `access-resolver.ts` (237) and `password-auth.ts` (204 minus `requestPasswordReset`) -> `members/server/`
Both whole files go to the NODE subpath (finding 3): the resolver computes a digest (`node:crypto`, :16) and
password auth reaches the Node hashers through A. The resolver's private digest (:59-60) is replaced by A's `hashToken`:
both are the same function today (`NodeSessionTokens.hashToken`, `packages/user-management/src/server/session-tokens.ts:12-14`,
and the resolver's copy: SHA-256, hex) and S0-P5a/P5b pin the equality; one owner afterwards.
Importers of the resolver (8 direct production files under `server/inbound/public-http/**` + the barrel lines
`index.ts:100,134`) repoint to the new subpath.
**Member lock (pair).** `persistMemberPassword` (:125) calls `lifecycle.lockKey("trash:member:<ws>:<id>")` on
`deps.credentialLifecycle`. In Jini the port member becomes `credentialLifecycle: { transaction<T>(fn): Promise<T>; lockMember(required: { workspaceId: string; memberId: string }): Promise<void> }`
(edit in A07's `members/ports.ts` and its in-memory lifecycle), and the literal leaves user-management. Tovu binds it at
`server/runtime/composition/http-app/mount-members-newsletter.ts:69`: `lockMember: ({ workspaceId, memberId }) => kernel.lockKey(trashEntityLockKey({ entityType: "member", workspaceId, entityId: memberId }))`.
Binding test: recording kernel receives exactly `trash:member:<ws>:<id>`; S0-P2 stays green.
su-refresh: `mount-members-newsletter.ts:69` is `credentialLifecycle: routeDeps.contentKernel ?? createInMemoryCredentialLifecycle()`;
the binding therefore keeps that choice: the kernel branch becomes `{ transaction: (fn) => kernel.transaction(fn), lockMember: … }`
as above, and the in-memory branch is A07's lifecycle, which gains `lockMember` in the same Jini commit (a no-op lock on
one process, as its `lockKey` is today). Both branches get a binding test.

**The real chains (finding 9). T0, unmoved code, fakes of the A07 port interfaces with a recording hasher; fixed clock.**
| # | What the code does today | Test | Mutation -> RED |
|---|---|---|---|
| R1 | Session resolution: no token -> none; lookup by `(workspace, digest)`; a row with `revokedAt`, or `expiresAt <= now`, -> none (`access-resolver.ts`, `resolveMemberSession`). **The resolver reads sessions, subscriptions and tiers only: it never reads the member record**; a disabled or trashed member is shut out because disable and Trash revoke the sessions | table: no token, unknown, other workspace, revoked, expired exactly at `now`, valid; the deps given to the resolver contain NO members repo (it cannot be consulted) | drop each of the two conditions; compare `<` instead of `<=` |
| R2 | Context: active subscriptions at `now` -> `activeTierIds`; `isPaid` when any of those tiers is of the paid type | fixtures: none, free tier, paid tier, lapsed paid tier | ignore `nowIso`; treat any tier as paid |
| R3 | Decision table: public; members; paid; tiers; an unknown visibility is DENIED without teaser; malformed stored access settings resolve to an unknown visibility (fail closed) | every visibility x (anonymous, member, paid member, member of a listed tier): exact decision objects | allow in the default branch; return `public` for malformed input |
| P1 | Password sign-in: email normalised; ONE verification always (the stored hash, or the per-hasher dummy when there is no member or no hash); unknown member, wrong password and no-password all give the same error | hasher fake: exactly one `verify` in each of the three cases, the dummy's hash as argument in two of them; identical error | skip the decoy; return early for an unknown member |
| P2 | Member status is checked AFTER verification, then re-read by id and checked again (a disable racing the slow verify) | members fake flips to disabled between the two reads: refused, no session saved | remove the re-read |
| P3 | After the session is saved the stored hash is re-read; if it changed, that session is revoked and sign-in fails. Sign-in takes NO lock | fake changes the hash after `sessions.save`: session revoked with the sign-in instant, error returned; recording lifecycle: zero `lockMember` calls in sign-in | remove the post-save re-read |
| P4 | Persisting a password: hash computed BEFORE the lock; then one transaction: member lock, member re-read (active or pending only), the caller's authorization, hash write, revoke-all (except the current session when setting), member save with the credential-revocation instant and `version + 1` | recording order of all calls; missing lifecycle -> today's validation error; the existing `__tests__/password-lifecycle.dialects.test.ts` race cases stay and are the dialect proof | remove the lock; hash inside the lock; skip revoke-all; skip the revocation instant |
| P5 | Reset: policy check BEFORE the single-use challenge is consumed; member must not be disabled / trashed / have a credential revocation at or after the challenge's creation; inside the lock the same checks repeat, plus not-expired-at-commit and revocation instant unchanged; success verifies the inbox and activates a pending member | each refusal as its own case (the weak-password case leaves the challenge unconsumed); a second reset with the same token fails | swap policy and consume; drop the in-lock re-check |
| P6 | Set password: valid session; with an existing hash the current password is required and verified; without one the session must be at most 15 minutes old (else the re-authentication error); in-lock revalidation: same session id, same member, revocation instant and hash unchanged | boundary at exactly 15 minutes; session revoked between authorize and commit -> refused | drop the age check; drop the in-lock revalidation |
The old rows about a constant-time comparison in the resolver and a lock in sign-in are withdrawn: neither exists.
No comparer seam is added.

## U2c-3 — D and E -> `members/server/{sign-in.ts,admin-writes.ts}`
Ports only (`ids`, `members`, `principals`, `sessions`, `subscriptions`, `tiers`, `clock`, `onMemberCreated`,
`report`). T0: existing tests + (a) a consumed new-address challenge creates the member exactly once when two links for
one address are completed concurrently; (b) `notifyMemberCreated` (`write-service.ts:670`): an observer that throws does
not change the result (pins today's outcome); (c) `disableMember` revokes the member's sessions (this is what R1 relies
on). Mutations: drop the email re-check; let the observer error propagate; skip the revocation.
**The observer error is reported, not swallowed (owner rule: errors are never swallowed; coordinator decision 5).** Today
`notifyMemberCreated` ends in `catch { /* Optional product analytics cannot alter a committed member. */ }`. It does NOT
move into Jini as-is. The Jini `sign-in.ts` version takes a REQUIRED port on its deps:
```ts
/** Receives an error that must not change the operation's result (an observer failed after the member was committed). */
export type MembersReportPort = (required: { error: unknown; context: { operation: "member-created-observer"; workspaceId: string; memberId: string } }) => void;
// in notifyMemberCreated, the catch becomes:
//   catch (error) { deps.report({ error, context: { operation: "member-created-observer", workspaceId: member.workspaceId, memberId: member.id } }); }
```
The comment moves with it, reworded neutral ("An observer cannot alter a committed member: its error is reported and the
result is unchanged"). Result and return type stay as today.
The port's shape is the host's existing `ObservabilityPort.reportError({ error, context })` (documented at
`server/inbound/shared/observability-middleware.ts:48`, implemented at `server/runtime/composition/product-telemetry.ts:199`).
Tovu binds it at BOTH places that build `MembersWriteServiceDeps` today: `toPublicMembersWriteServiceDeps`
(`server/inbound/public-http/routes/members/deps.ts:75`) and `buildMembersWriteServiceDeps`
(`features/members/tool-registrations.ts:95`); a source deps type that does not carry the observability port gets it as
a REQUIRED field (the typecheck lists every caller). No `console` fallback and no default: a missing binding is a
compile error. This is the one intended behaviour change of U2c-3 (an error that was dropped is now reported; the
result is unchanged), so T0's case (b) stays green across the move. Extra tests, J1 (Jini, fakes; `report` does not exist
before J1): (d) observer throws -> `report` called once with the thrown error and that context, result unchanged;
(e) observer succeeds -> `report` never called. Mutations: drop the `report` call (d fails); call `report` on success
(e fails). T1 (Tovu): one binding test per build site: the deps it returns carry a `report` that forwards to the
observability port's `reportError` (recording fake). If `report` itself throws, the error propagates (no nested swallow).

## Barrel rule for `features/members/index.ts` (su-refresh; replaces "only specifiers change" for moves to Jini)
xpkg COMMON S3 fails on any added `export { … } from` line and the owner rule forbids forwarders, so a barrel line may
NOT be repointed to `@jini-ai/user-management/members/server`. In the T1 commit that moves a symbol to Jini, its barrel
line (or the symbol inside a multi-line block) is DELETED and every barrel importer of that symbol imports it from the
Jini subpath instead (allowed edit (a) for tests). Barrel importers on refactor/terra (2026-11-17, list command below):
- U2b (resolver + password auth: `DefaultMemberAccessResolver`, `createMemberAccessResolver`, `resolvePostMemberAccess`,
  `MemberAccessResolverDeps`, `resolveMemberSession`, `signInWithPassword`, `resetPassword`, `setMemberPassword`; barrel
  `index.ts:96-100,133-134`): 11 files: `assistant/site/__tests__/member-access.fixture.ts`, `features/seo/index.ts`,
  `features/site-search/cms-document-source.ts`, `server/inbound/admin-http/routes/posts/template-preview-render.ts`,
  `server/inbound/public-http/routes/members/{me,oidc-deps,password-sign-in,reset-password,set-password}.ts`,
  `server/runtime/composition/deps.ts` (shared file: INDEX-SU §3.4), `server/runtime/composition/modules/site-assistant.ts`.
- U2c-2 (`issueMemberSession`): `features/member-login/link-service.ts`, `server/inbound/public-http/routes/members/unlink-identity.ts`.
- U2c-3 (`compSubscription`, `createMember`, `completeSignIn`, `notifyMemberCreated`, `disableMember`, `setSubscriptionStatus`,
  `updateProfile`): `features/member-login/link-service.ts`, `server/inbound/admin-http/routes/members/disable.ts`,
  `server/inbound/public-http/routes/members/complete-sign-in.ts`.
- U2c-1 (Tovu-only split): barrel lines that name a symbol moving between TOVU files change only their `./…` specifier
  (`index.ts:102-114` block, `:133` for `requestPasswordReset`). These are existing barrel lines, not new forwarders; the
  run report lists each such S3 hit with this paragraph as its allowance. Anything else S3 prints = STOP.
```bash
cd "$TOVU"/apps/website/src   # barrel importers of a symbol set; S = the run's symbols, joined by |
S='DefaultMemberAccessResolver|createMemberAccessResolver|resolvePostMemberAccess|MemberAccessResolverDeps|resolveMemberSession|signInWithPassword|resetPassword|setMemberPassword'
rg -l -U "import[^;]*\b($S)\b[^;]*from \"[^\"]*(features/members/index|members/index\.js|\./index\.js)[^\"]*\"" . | grep -v '^./features/members/index.ts' | sort
```
A file that is not in the run's list above = STOP (a new importer since 2026-11-17: regenerate the list, never widen silently).

## stops
- A step of R1-P6 would become a host callback, or its mutation stays green: do not move that file.
- `./members` (universal) would export or import anything Node: the `rg` in the header.
- A refusal's error class or message changes (routes map them): the chain tables assert both.
- C would have to move for a run to compile: it must not; report the import.
Not verified while planning: bodies of groups C, D, E beyond the call graph; the console-mailer selection condition;
A07's final port names; whether `validatePasswordPolicy` and the challenge primitives are exported from leaf files
(`rg -n "export (async )?function (validatePasswordPolicy|decideChallenge|verifyChallengeCode|newChallengeSecrets)" packages/user-management/src/server`).
