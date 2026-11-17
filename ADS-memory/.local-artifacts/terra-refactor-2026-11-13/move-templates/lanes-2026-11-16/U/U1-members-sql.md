> **REVISION 2 HOLD (2026-11-17): do NOT dispatch this sheet as written.** The Codex judge's finding(s) below were checked against the code and accepted; the redesign is not written yet (INDEX §7 and "Revision 2 - judge response"). Until this banner is removed the sheet is input for the next planning run, not an executor brief.
> Finding 5: the U1a/U1b split has no compilable middle state (all seven bindings import one `repo.ts`, which T1 deletes; `withoutId` at `features/members/repo.ts:122` is shared by both halves). Needs U1a's exact remaining file, bindings and successor guards.

# U1 — members SQL repos -> `@jini-ai/user-management/members/sql`

Template: T-SQLREPO. Facts: `U1-members-sql.facts.md` (3 files, 974 lines, 16 test files).
New relative to audit2 sheet A07 (`split-a07-members-server-domain.md`, plan/audit2-sheets-a3), which moves
`types, ports, repo.memory, agent-tools, tool-registrations, subscriber-directory` to `user-management/src/members/` and
lists the SQL adapters as staying. U1 moves them behind the ports A07 lands (OD-3).

```
id: U1-members-sql     (two runs: U1a = rows + SqlMemberRepo, SqlMemberTierRepo, SqlMemberSubscriptionRepo, SqlMemberExternalIdentityRepo;
                                  U1b = SqlMemberSessionRepo, SqlMagicLinkTokenRepo, SqlMemberConsentRepo  — the credential-bearing ones)
jini_target: user-management NEW subpath ./members/sql (node): {tables.ts, repo.rows.ts, one file per class, index.ts}
prerequisites:
  - A07 landed: `ls packages/user-management/src/members/ports.ts`. S0 green (P1 `members:magic-tokens:<ws>`, P2, P5 member
    session + magic-token hashes, P6). P-DEP (kysely in user-management). S3a landed (shares `./server/sql` conventions and
    the package.json export block: serial with S3/U3 on that file). S4b landed (exports `trashEntityLockKey`).
```

## The cross-package lock (LESSONS 1, 4, 16)
`members/repo.ts` takes `trash:member:<ws>:<memberId>` at two sites and `members/password-auth.ts` at one; the trash table
adapter takes `trash:${entityType}:…` for entity type `member`. They are the same key on purpose: trashing a member and
writing that member must not interleave. After the moves the member repo (user-management) and the trash kit (cms) may not
import each other. The member repos take a REQUIRED port `locks: { member(input: { workspaceId: string; memberId: string }): string }`;
Tovu binds it to cms's `trashEntityLockKey({ entityType: "member", … })` in `features/members/repo.sqlite.ts`, with the
why-comment. S0-P2 (stays in Tovu, runs against the bindings) is the test that fails if either side drifts.
No default for the port: a default string would let the two keys diverge silently.

## split
`repo.ts`: seven classes MOVE (list above). `repo.rows.ts` (301) MOVE. `repo.sqlite.ts` (69) STAY-WIRING; its one prod
importer is `features/members/index.ts` (134-line barrel, 35 prod + 25 test importers, on R-BARRELS): do not edit the barrel
beyond the lines the census names. Tables: the eight in the facts file (`members`, `member_tiers`, `member_subscriptions`,
`member_sessions`, `member_magic_tokens`, `member_consents`, `member_external_identities`, `member_revisions`).

## Security chain (U1b)
| Step | Test (T0, unmoved code) | Mutation -> RED |
|---|---|---|
| Member session found only by `(workspace, token hash)`; revoked/expired sessions are not returned by the lookup the access resolver uses (pin which layer filters) | two workspaces, same hash; revoked; expired with fixed clock | drop a predicate |
| Magic-link token is single use and expires; consumption is serialized by `members:magic-tokens:<ws>` | consume twice concurrently: exactly one success; expired: refused; lock recorded before the read | remove the lock; make consume not delete/mark |
| `credentials_revoked_at` (migration 0010) invalidates older sessions | session created before the revocation instant is rejected by today's path | ignore the column |
| External identity uniqueness per provider subject | second link of one subject to another member refused as today | drop the conflict handling |
| Member writes advance `version` / write `member_revisions` (lost-updates) | stale save refused; revision row appended; no-op save appends none (pin) | drop the version predicate |
| Trashed member hidden from auth lookups | trashed member's session/magic token does not authenticate | remove the not-trashed condition |

## stops / estimate
- The lost-updates design schedules edits to `members/repo.ts` (file imports `core/optimistic-concurrency`): it runs first.
- A token or session hash would be computed differently (P5).
- U1a ~210k, U1b ~180k. Not verified while planning: class bodies; which layer filters revoked sessions; A07's final port names.
