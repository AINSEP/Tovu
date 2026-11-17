Software Architect / Refactor(Review): **Verdict: needs rework.**

Reviewed the INDEX, S0–S8, U1–U3, their facts files, and shared templates at plan commit `655fee236`. Source evidence below uses Tovu `80b00f5bb` and Jini `02edbb684`. Design paths are relative to `move-templates/lanes-2026-11-16/`; Tovu source paths are relative to `apps/website/src/`.

This was a read-only review. No compilation, tests, or mutations were executed.

1. **[blocker] S2’s invalidation port cannot preserve the existing cache contract.**

   **Evidence:** `S/S2-entries-content-types-sql.md:19` proposes an event containing `{ workspaceId, entryId }`, directly bound to `invalidateMediaAccessEvidence`. The real function accepts `{ owner: object }`; its caches use repository object identity (`features/media/access-evidence.ts:16`, `:21`, `:35`). `SqlEntryRepo` passes `this` from both `save` and `transaction` (`features/entries/repo.ts:130`, `:223`). A transaction has no single entry ID.

   The characterization at sheet line 38 also expects no invalidation after a failed write. The current `finally` block expressly invalidates after failure.

   **Fix:** Specify an owner-preserving callback and exact binding, including transaction completion and failure. Test actual linked-cache invalidation, including pending scans, rather than only callback counts. Preserve failure invalidation unless a separate behavior change is approved.

2. **[blocker] U2b depends on the unwritten U2c implementation.**

   **Evidence:** `U/U2-members-auth-domain.md:10–15` schedules password-auth extraction after A07/U1, while deferring `write-service.ts`. But `features/members/password-auth.ts:7–9` imports five runtime helpers from that file: `consumeMemberChallenge`, `dummyPasswordHash`, `issueMemberSession`, `memberPasswordHasher`, and `requestMemberChallenge`.

   These helpers include shared state: `write-service.ts:58–75` owns token generation, the fallback hasher, and the per-hasher dummy-hash cache. U2 specifies neither their earlier extraction nor ports for them.

   **Fix:** Design and land their shared owner before U2b, or define explicit injected contracts and bindings. U2c cannot remain an independent later task while U2b is presented as executable.

3. **[blocker] U2’s destination crosses an existing runtime boundary.**

   **Evidence:** U2 targets `@jini-ai/user-management/members` (`U2:12`). Its A07 prerequisite explicitly defines that entry as **universal** (`split-a07-members-server-domain.md:54`). The resolver imports `node:crypto` at `features/members/access-resolver.ts:16`. Password-auth also reaches Node authentication implementations through the helpers above.

   U2’s isolated phrase “node entry” at line 28 supplies no actual Node subpath or export-map change.

   **Fix:** Separate universal member contracts from Node authentication implementations, and specify the corresponding manifest entries and importer updates.

4. **[blocker] S4a needs contracts that S4b creates later.**

   **Evidence:** S4a moves `entry-sql.ts` and `not-trashed.ts`; both import registry contracts (`features/trash/entry-sql.ts:15`, `not-trashed.ts:20`). Those contracts move only in S4b (`S/S4-trash-sql.md:27`), which explicitly depends on S4a (`:15`).

   The proposed “generic validation/assembly” owner is also fictitious. `buildTrashRegistry()` takes no input and returns a fixed `Map` (`features/trash/registry.ts:164–165`). It does not validate duplicate types or unknown tables. The characterization at sheet line 45 therefore cannot characterize today’s implementation.

   **Fix:** Land the required contracts before, or together with, S4a. Keep the fixed product registry in Tovu. Treat any new validator as separately justified behavior, not extracted existing behavior.

5. **[major] U1’s two-run split lacks a compilable intermediate state.**

   **Evidence:** `U/U1-members-sql.md:9–10` moves four classes in U1a and the remaining three in U1b. The inherited template deletes the moved `repo.ts` in T1 (`T-SQLREPO.md:64`), but U1 never defines a reduced first-run file, split imports, or intermediate bindings. All seven bindings currently import that one file (`features/members/repo.sqlite.ts`).

   The split also omits the shared `withoutId` helper at `features/members/repo.ts:122`, used by classes on both sides.

   **Fix:** Specify U1a’s complete remaining source and bindings, assign shared helpers, and give U1b successor guards. Each run needs its own explicit Jini/Tovu commit contents.

6. **[major] S2 omits the content-owner dependency and unresolved entry contracts.**

   **Evidence:** S2 moves content-type row mappers but says `declared-owners.ts` is untouched and tests only the consumer’s repository instance type (`S2:31`, `:42`). The mapper actually calls `declaredOwnerFor` on reads and writes, and enumerates `DECLARED_CONTENT_TYPE_OWNERS` in refusal details (`features/content-types/repo.rows.ts:10`, `:31`, `:51–53`). This determines which namespace validates stored content.

   The entry repository also implements Tovu-local `EntryPublishReadPort` and uses local query contracts (`features/entries/repo.ts:10–18`). S2 does not assign their destinations. Jini’s existing collection query contract lacks Tovu’s optional `offset` field (`packages/cms/src/widgets/resolvers/ports.ts:9–14` versus `features/entries/public-list.ts:57–63`).

   **Fix:** Define the owner lookup, diagnostic contract, bindings, and contract destinations. Test widget-owner restoration, rejection of unsupported owners, and pagination offsets.

7. **[major] S6c loses its stored-row mapper dependency across the package boundary.**

   **Evidence:** `features/platform` is not involved here: the actual dependency is `platform/db/repos/form-delivery-repo.ts:12`, which imports `outboxEventValues` and calls it inside the plan transaction at line 131. S6a moves that implementation to `@jini-ai/db/events` (`S/S6-…md:19`), while S6c moves its caller to cms. Cms cannot import db under the owner rule.

   S6c declares only a status limit and row type; it supplies no mapper port or prerequisite for this dependency.

   **Fix:** Specify the shared row-format owner and a permitted host-injected binding. Preserve insertion into the caller’s transaction and test rollback and exact stored-row compatibility.

8. **[major] The security characterization plan names incorrect producers and invariants.**

   **Evidence:**
   - `S0:22` proposes swapping a hasher in identity wiring to break member-session and magic-token fixtures. Those hashes are produced by the separate `NodeSessionTokens` instance in `features/members/write-service.ts:58`, `:80–85`.
   - `S3:61` describes an MFA-store passkey **read**. Its only `owner_passkeys` operation is deletion during `clear` (`features/identity/mfa.repo.ts:48–53`).
   - `S3:59` treats separately locked `factor` and `saveFactor` calls as an indivisible anti-replay sequence. They each open their own transaction (`mfa.repo.ts:22–32`); the existing concurrency test explicitly wraps the complete proof in an outer identity transaction (`features/identity/__tests__/mfa.repo.dialects.test.ts:59–67`).

   **Fix:** Trace each stored credential to its actual producer and verification path. Give each pin a mutation on that path. Test the complete outer anti-replay transaction, and separately test MFA clearing of passkeys. The supplied mutation catalog does not establish the requested every-check coverage.

9. **[major] U2 invents authentication behavior rather than characterizing it.**

   **Evidence:** U2 line 28 identifies a constant-time comparison in the resolver and proposes replacing `timingSafeEqual`. The resolver imports only `createHash` and computes SHA-256 (`access-resolver.ts:16`, `:59–60`).

   U2 line 27 also places member-status checks in the resolver, which reads sessions, subscriptions, and tiers—not members (`:78–82`, `:108–127`). Its password-sign-in row names a lock that sign-in does not take; password persistence takes that lock (`password-auth.ts:24–49`, `:123–134`).

   **Fix:** Replace the invented chain with the actual chain. Assign checks to their current owners, and map existing race tests to the corresponding mutations. Do not add a comparer seam for a comparison that does not exist.

10. **[major] S5’s concurrency test assumes an unimplemented repository contract.**

    **Evidence:** `S/S5-settings-token-origin-sql.md:15` says settings writes carry `expectedRevision`, and line 27 requires competing writes to produce one conflict. The source has no `expectedRevision`; value writes are unconditional upserts (`features/settings/repo.ts:257–293`). The revision lock orders ledger commits (`:343–375`), rather than rejecting stale client submissions.

    Similarly, the token store accepts only `{ token, now }` at redemption (`platform/db/repos/gated-mutation-token-repo.ts:79`); wrong-action/target validation cannot be tested solely at that adapter as the sheet suggests.

    **Fix:** Make the approved lost-updates implementation an explicit prerequisite and regenerate the sheet against it, or characterize the current behavior accurately. Locate action-binding checks in their actual service lifecycle.

11. **[major] U3’s middleware test cannot prove authentication still runs.**

    **Evidence:** `U/U3-api-keys.md:77–80` requires revoked and unknown keys to return identical responses, then claims the test fails if middleware stops calling authentication. Removing the authentication call can leave both requests equally unauthenticated, so equality still passes. The actual success path is `dev-auth.ts:285–291`.

    **Fix:** Add a valid-key positive control reaching a protected operation, assert the resolved principal and credential kind, and then assert revoked/unknown denial. Include session precedence and the existing machine-credential restrictions.

12. **[major] The proposed source shapes are not executable under the owner limits.**

    **Evidence:** S1 moves a 555-line taxonomy repository into one `repo.ts` without a file split (`S1:23`; source `features/taxonomy/repo.ts`). U3 moves `issueApiKey` verbatim (`U3:26`), but that function spans `api-key-service.ts:277–361`—about 70 nonblank lines excluding line comments. Its STOP checks only `authenticateApiKey`.

    U3’s purported declaration inventory also omits the security-bearing `findIssuableTargetOrThrow` and `collectSnapshotSourceRows` helpers (`api-key-service.ts:193`, `:222`).

    **Fix:** Provide actual file/function partitions and complete declaration maps before dispatch. “Measure and STOP” does not finish a design whose current source already exceeds the prescribed limits.

13. **[major] Shared instructions do not enforce the claimed green-commit gates.**

    **Evidence:** `COMMON.md:9` prohibits tests, typechecks, and builds. Its checks permit unresolved new Jini imports (`:42`) and largely filter lint findings by changed lines (`:40`). Meanwhile, `T-SQLREPO.md:80–82` promises independently green commits without executable commands or a per-commit stop protocol.

    S0-P6 is especially exposed: it is a type-level test under `__tests__`, which the normal Tovu tsconfig excludes (`tsconfig.json:19–23`). Node’s test execution does not establish its type assertions. The repository provides a separate `typecheck:tests` command (`package.json:37`), absent from the sheet.

    **Fix:** Define instruction precedence and an explicit verification handoff for every intermediate commit. Include test typechecking and mutation results. State the failure/STOP behavior before dependent execution proceeds.

14. **[major] The migration graph omits shared tests and successor inventories.**

    **Evidence:** INDEX lines 65–69 name only three shared Tovu files. Yet the facts files assign `platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts` to S3, S5, S6, and S7—different package chains allowed to run concurrently.

    S0 also creates new direct consumers under `__tests__/lane-su-pins/`. Those files cannot be in the frozen importer lists, while `T-SQLREPO.md:63` requires every census hit to be listed. Sequential runs similarly change files guarded by the original blobs.

    **Fix:** Schedule shared test edits explicitly. Regenerate approved inventories after S0 and prerequisite changes, and supply successor guards for each run. Refreshing a guard must preserve an approved scope rather than authorize new executor decisions.

15. **[major] U3 defers reuse even though the package move removes the stated obstacle.**

    **Evidence:** U3 lines 67–72 retain a second grant clamp because Jini’s implementation is “unexported.” It is exported from its declaring leaf (`packages/user-management/src/server/grant-service.ts:174`) and already called internally by `admin-crud-service.ts:3`. A service moved into that package can use the leaf without a public export-map entry.

    Both implementations deduplicate permissions, resolve effective permissions, and apply the same unconstrained/wildcard checks (`grant-service.ts:174–195`; Tovu `api-key-service.ts:82–101`).

    **Fix:** Perform the behavior comparison during planning and reuse the existing owner in U3b if equivalent. U3c’s public-export premise does not justify postponing that ownership decision.

16. **[minor] The INDEX and hand-written counts disagree with their own facts.**

    **Evidence:** INDEX line 28 claims 69 labelled files and 31 unlabelled files. `coverage.tsv` contains **60 labelled and 40 unlabelled** rows; only 51 labelled rows have no sheet/design mention.

    S1 calls navigation’s SQLite binding unused (`S1:24`), while its facts list three production and two test importers (`S1.facts.md:75–76`). S2 calls the content-type SQLite binding production-unused (`S2:31`), while its facts list three production importers (`S2.facts.md:98`).

    **Fix:** Generate these summaries from the inventory and remove contradictory branch instructions before dispatch.

The reconciliation sample covered the following 18 rows. The first ten were checked against all seven available Tovu `moves/*` refs and all five `audit2-sheets-*` refs; none was already moved or assigned as an executable audit2 extraction. Classification labels alone were not treated as completed work.

| Sampled source | Recorded label | Source check |
|---|---|---|
| taxonomy/repo.ts | MOVE | 555 lines; four scoped classes |
| navigation/repo.ts | MOVE | 332 lines; two classes |
| content-types/repo.rows.ts | MOVE | Declared-owner dependency omitted by S2 |
| identity/mfa.repo.ts | MOVE-AFTER | Passkey operation is deletion |
| identity/passkeys.repo.ts | MOVE-AFTER | Ownership/public-key/RP predicates present |
| trash/registry.ts | MIXED | Fixed registry; no validator |
| settings/repo.ts | Unlabelled | No expected-revision contract |
| db/repos/outbox-repo.ts | MOVE-AFTER | Mapper and adapter remain present |
| members/access-resolver.ts | MOVE-AFTER | Hashing, not timing-safe comparison |
| identity/api-key-service.ts | MIXED | Issuance exceeds specified function limit |
| identity/recovery-codes.repo.ts | MOVE-AFTER | Caller-owned transaction contract |
| trash/table-adapter.ts | MOVE-AFTER | Registry and shared-lock dependencies |
| members/password-auth.ts | MOVE-AFTER | Depends on deferred write-service |
| members/consent-service.ts | DELETE | Writer exists; dead-code status unproven |
| members/mailer.console.ts | MOVE | Logs truncated body and metadata |
| identity/api-key-secret.ts | MOVE | Scheme and stored scrypt format present |
| entries/repo.ts | MOVE-AFTER | Object-keyed invalidation in `finally` |
| media/guard-rendition-repo.ts | MOVE | Conditional source-persistence guard |

I separately checked A07’s six-file allocation and A08’s media allocation. I found no duplicate completed move in that sample. I cannot certify complete scope coverage: dependencies such as entry contracts, declared-owner behavior, theme-slot defaults, and password helpers remain unallocated or unresolved by the executable sheets.

The eight remaining items are **not all correctly scoped**:

| Remaining item | Judgment |
|---|---|
| 1. S4c adapters | Needs explicit per-file ownership; U1/S3 do not actually schedule all adapters attributed to them. |
| 2. S2c memory entry repo | Bounded follow-up, but must share the corrected invalidation contract. |
| 3. S8c memory bus | Blocked work; OD-6 alone does not supply its behavior comparison. |
| 4. U2c write-service | Required prerequisite for U2b’s current design. |
| 5. U3c clamp dedupe | Resolve during U3b planning; the stated obstacle disappears after moving packages. |
| 6. Other identity files | Explicitly deferred, without executable coverage; the wider users/identity lane remains incomplete. |
| 7. Members barrel | Assigned to R-BARRELS, but its importer edits need integration into the execution graph. |
| 8. Wiring texts/table types | Missing acceptance-critical content of existing sheets, not a separate future feature. |

For migrations, the inspected plan freezes stored formats and leaves the Drizzle chain and TS migrations in Tovu. ADR-066 lines 36–65 and automatic migration at `platform/db/sqlite/content-db.ts:103` remain the applicable owners. I found no evidence that a pure move requires a new migration. However, P5’s incorrect producer mapping prevents accepting the proposed credential compatibility verification; no upgrade or N-1 test was executed here.

## Recurring mistake classes

- **Validate the assembled executor brief as one contract.** Shared appendices must not negate a sheet’s verification gates, and hand-written instructions must not contradict generated facts.
