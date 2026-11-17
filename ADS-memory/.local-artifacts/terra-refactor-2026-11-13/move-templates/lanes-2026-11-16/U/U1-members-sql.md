# U1 (revision 2) — members SQL repos -> `@jini-ai/user-management/members/sql`

Security code (U1b). Template: T-SQLREPO rev 2. Facts: `U1-members-sql.facts.md` (3 files, 974 lines, 16 test files).
New relative to audit2 A07 (`split-a07-members-server-domain.md`), which moves `types, ports, repo.memory, agent-tools,
tool-registrations, subscriber-directory` to `packages/user-management/src/members/` (a UNIVERSAL entry) and leaves the SQL
adapters in Tovu. U1 moves them behind A07's ports (OD-3). A07 has NOT landed on Jini `65d73b0d5` = refactor/terra (`src/members` is absent; su-refresh 2026-11-17).
Revision 2 fixes judge finding 5: the two runs now have an exact intermediate tree, bindings and helper owner.

```
id: U1a-members-sql-directory (~200k)   SqlMemberExternalIdentityRepo, SqlMemberRepo, SqlMemberTierRepo, SqlMemberSubscriptionRepo
    U1b-members-sql-credentials (~190k) SqlMemberSessionRepo, SqlMagicLinkTokenRepo, SqlMemberConsentRepo
jini_target: user-management NEW subpath ./members/sql (node): tables.ts, repo.rows.ts, one file per class, index.ts
prerequisites:
  - A07 landed: `ls packages/user-management/src/members/ports.ts`. OD-3 YES.
  - S3a landed (it added the `kysely` optional peer and `./server/sql`): `ls packages/user-management/src/server/sql/index.ts`.
  - S4a landed (U1b only; exports the lock-key builder): `rg -n "export function trashEntityLockKey" packages/cms/src/trash`.
  - S0 DONE (P1 `members:magic-tokens:<ws>`, P2, P5a/P5b, P6). lost-updates: if scheduled on `features/members/repo.ts`, it runs first.
successor_of: U3b (user-management manifest); U1b: U1a
```

## Source map (`features/members/repo.ts`, 604 lines)
imports :1-54 · `MAX_PAGE` :55 · `SqlMemberExternalIdentityRepo` :63-121 · **`withoutId` :122-126 (shared helper)** ·
`SqlMemberRepo` :127-221 · `SqlMemberTierRepo` :222-283 · `SqlMemberSubscriptionRepo` :284-353 ·
`SqlMemberSessionRepo` :354-444 (member lock at :391 and :424) · `SqlMagicLinkTokenRepo` :445-539 (lock at :501) ·
`SqlMemberConsentRepo` :540-604. `repo.rows.ts` (301): mappers for all seven. `repo.sqlite.ts` (69): seven subclasses,
its one production importer is the barrel `features/members/index.ts` (R-BARRELS; only specifiers change there).

## U1a
**J1.** `members/sql/tables.ts` (interfaces for `members`, `member_revisions`, `member_tiers`, `member_subscriptions`,
`member_external_identities`), `repo.rows.ts` (the mappers those four classes import, plus `withoutId` and `MAX_PAGE` as
non-exported module helpers used by the class files through a named internal export), `external-identity-repo.ts`,
`member-repo.ts`, `tier-repo.ts`, `subscription-repo.ts`, `index.ts`, export entry + `jini.entries` line.
Constructors `({ kernel, tables }, _optional = {})`.
**T1 — the exact intermediate tree (compiles alone; finding 5).**
- `features/members/repo.ts`: keeps its imports, **its own copy of `withoutId`** (su-refresh: the three remaining classes use it at :400, :477, :570; a five-line generic helper, duplicated only until U1b deletes this file), and the three classes `SqlMemberSessionRepo`, `SqlMagicLinkTokenRepo`, `SqlMemberConsentRepo`, untouched.
- `features/members/repo.rows.ts`: reduced to the mappers those three classes import (`rg -n "repo\.rows" features/members/repo.ts` after the edit lists them); nothing else.
- `features/members/repo.sqlite.ts`: `SqliteMemberExternalIdentityRepo`, `SqliteMemberRepo`, `SqliteMemberTierRepo`, `SqliteMemberSubscriptionRepo` keep names and constructors and call `super({ kernel: schemaErasedKernel({ store }), tables: MEMBER_TABLES }, {})` on the Jini classes; the other three subclasses still import from `./repo.js`. `MEMBER_TABLES` is a `const` here with all eight real names (`members`, `member_tiers`, `member_subscriptions`, `member_sessions`, `member_magic_tokens`, `member_consents`, `member_external_identities`, `member_revisions`); U1b reuses it.
- Successor guard for U1b: the facts diff may show ONLY these three files changed, in exactly the declarations above.
**characterization (T0).**
| Risk | Test | Mutation -> RED |
|---|---|---|
| Stale member save overwrites; revision history | old `version`: refused by `assertVersionedWrite`, row unchanged; an accepted save appends one `member_revisions` row; pin what a no-op save does today | drop the version predicate; skip the revision insert |
| Cross-workspace read; email lookup case | two workspaces, same emails and ids, every `find*` / `list*`; `findByEmail` casing as today | drop a predicate |
| Password hash column leaks into records | `findById` / list results contain no hash field; `findPasswordHash` / `setPasswordHash` are the only access | add the column to a mapper |
| List paging | `MAX_PAGE` clamp and cursor round trip (`decodeListCursor` / `pageFromOverfetch`) | change the bound |
| External identity bound twice | a provider subject already linked to another member: today's refusal (`MemberConflictError`), nothing written | drop the conflict handling |
| Subscription activity window | `listActiveByMember` at a fixed `nowIso`: active, comped, expired, canceled fixtures -> exact ids | widen the status / time predicate |

## U1b
**J1.** adds `tables.ts` interfaces for `member_sessions`, `member_magic_tokens`, `member_consents`; `session-repo.ts`,
`magic-link-token-repo.ts`, `consent-repo.ts`; the remaining mappers. **T1:** `features/members/repo.ts` and
`repo.rows.ts` deleted; the last three subclasses bind the Jini classes.
**The cross-package lock (LESSONS 1, 4, 16).** `SqlMemberSessionRepo` takes `` `trash:member:${workspaceId}:${memberId}` ``
at :391 and :424; `password-auth.ts:125` takes it too; the cms trash adapter takes `trash:<entityType>:<ws>:<id>` for
entity type `member`. Same key on purpose: trashing a member, minting a session, revoking all sessions and persisting a
password must not interleave. user-management and cms may not import each other, so the session repo takes a REQUIRED
port `locks: { member(required: { workspaceId: string; memberId: string }): string }` and Tovu binds it in `repo.sqlite.ts`:
`member: ({ workspaceId, memberId }) => trashEntityLockKey({ entityType: "member", workspaceId, entityId: memberId })`
(from `@jini-ai/cms/trash`), with the why-comment. No default: a default string would let the two keys drift silently.
S0-P2 stays in Tovu and fails if either side drifts. `` `members:magic-tokens:${workspaceId}` `` (:501) is the members
domain's own key and moves as a literal builder, pinned by S0-P1.
**Security chain (T0, unmoved code; each row is repo behaviour — the filtering of revoked / expired sessions is NOT here: `access-resolver.ts` `resolveMemberSession` does it, see U2b).**
| Step today | Test | Mutation -> RED |
|---|---|---|
| Session found only by `(workspace, exact digest)` | S0-P5 fixture; same digest in another workspace not found; the repo itself does NOT filter revoked / expired rows (`findByTokenHash` :360-367 has only the workspace and digest predicates, read 2026-11-17): a revoked and an expired session ARE returned, pin that | drop a predicate |
| Session save and `revokeAllForMember` (with `exceptSessionId`) run under the member lock, in a transaction | recording kernel: lock string and order at :391 and :424; `exceptSessionId` survives, every other live session of that member gets the instant, other members' sessions untouched | remove each lock; drop the member predicate; ignore the exception |
| Sign-in token is single use and expires | `consume` twice concurrently: exactly one success; expired: refused; the three refusal messages are EXACT strings the challenge adapter matches today (`features/members/write-service.ts:243-246`: `magic link token '<id>' was not found` / `has expired` / `was already consumed`): assert each verbatim | make consume unconditional; change one message |
| Code attempts are reserved atomically | `reserveCodeAttempt` up to `maxAttempts` concurrently: exactly `maxAttempts` succeed | drop the attempts predicate |
| Token lookups serialized by `members:magic-tokens:<ws>` | recording kernel at the method of :501 | remove the lock |
| Trashing a member revokes its credentials (`features/trash/adapters/member.ts`, stays in Tovu) | `hide` on the member adapter: live sessions get `revoked_at`, unconsumed tokens get `consumed_at`, in the hide transaction (a failing second write rolls the marker back); a no-op re-hide writes neither | remove either UPDATE in the adapter |
| Consent records are append-only per member | pin today's write / read set for `SqlMemberConsentRepo` (privacy record: no delete is added) | - |

## stops
- A07's landed port names differ from the ones `repo.ts:5-13` imports: step 0 prints both; any member mismatch = SKIPPED.
- A token or session digest would be computed differently (S0-P5a/b red).
- The `locks.member` binding and the trash key differ (S0-P2 red).
Not verified while planning: the bodies of the seven classes beyond the lock sites and line ranges.
su-refresh (refactor/terra `232764af5`): source map, lock lines :391/:424/:501, `password-auth.ts:125`, the three refusal
fragments (`write-service.ts:245`, matched as `prefix + reason`), `withoutId` uses and `findByTokenHash` re-read; facts identical.
