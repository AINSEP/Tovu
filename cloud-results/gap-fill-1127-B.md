PARTIAL run B | jobs 5/5 pushed, 0/5 complete | tests added 431 | files 100% 43/174 | bugs 0 | left: um-1 49 files, um-2 4, um-3 22, int-1 15, int-2 26 (exact lists per job below)

# Cloud gap-fill 2026-11-27 — run B (Jini user-management + integrations)

## Summary
- All five jobs pushed **partial** work. Every test added was run and passes. `tsc --noEmit` shows 0 errors in both packages (`packages/user-management` and `packages/integrations`; the package tsconfig type-checks tests too). gitleaks `protect --staged` (v8.21.2, built with `go install`) reported no leaks before every commit. No production code was changed and no existing assertion was edited.
- **The run is partial because each worker hit its tool-call cap.** Four subagents (opus-high), one job each, each capped at 50 tool calls. I ran um-3 myself. All work stopped at the 50-call caps and my own context budget, not at the 3 h wall clock. I am not allowed to start a fifth subagent, so the remaining files need another run.
- **Setup:** Node 24 (`/opt/node24`), Jini `pnpm install --frozen-lockfile` + `pnpm -r build` (green, 3m04s). None of the `codex/w62-cov-*` branches existed, so every job branched from `origin/integ/merge-28-2026-11-26` (d1ced6c5). I read the Codex Cloud branches `codex/ccx-um` (consent-service.test.ts) and `codex/ccx-int` (extract-s8-sets.unit.test.ts) first. Neither file is in any job's list, and we did not touch either.
- **How coverage was measured:** "after" numbers are **scoped** runs: the touched tests plus the existing tests for the same source, with `--coverage.include` set to the job's files. "Before" numbers come from the brief (merge-28 full-suite).

## Branches (Jini) — every one pushed, one SHA each
| job | branch | head | commits |
|---|---|---|---|
| w62-cov-um-1 | codex/w62-cov-um-1 | 6e8f5209 | 1 |
| w62-cov-um-2 | codex/w62-cov-um-2 | 72e378ba | 1 |
| w62-cov-um-3 | codex/w62-cov-um-3 | cbf8cc2e | 5 (6a5b527a, 70ea2230, 7608be63, fd02e14d, cbf8cc2e) |
| w62-cov-int-1 | codex/w62-cov-int-1 | 4cc8b6c8 | 1 |
| w62-cov-int-2 | codex/w62-cov-int-2 | ab05265d | 1 |

## Per-job results (detail in the ledgers appended below)
- **um-1** (78 tests, 9 new `*.gap.test.ts` files + `member-auth.gap-harness.ts`). These now read 100/100/100: members/member-sign-in, password-auth, member-challenge, member-credentials, member-validation, member-admin-writes, identity/repo.authentication. member-login/link-service is 100/97.6/100: `:73-74` cannot be reached because the same unique email resolves both members (refactor candidate). identity/delete-user-service: every brief-listed line is now covered.
- **um-2** (78 tests, 13 files incl. helpers `members/__tests__/members-sqlite.ts` and `newsletter/__tests__/newsletter-sqlite.ts`). The tests run the real SQL repos on in-memory SQLite through the existing `server/sql/__tests__/support/sqlite-kernel.ts`. These now read 100/100/100: members/repo.rows, members/repo.ts, trash-member, newsletter/campaign-write-service, repo-sends, repo-subscribers, newsletter/repo.ts, newsletter/repo.rows. members/repo.sessions is 100/98.2/100: `:115` is a defensive throw that cannot run (refactor candidate).
- **um-3** (87 tests, coordinator). 11 files at 100/100/100 (project-keys create-vault, site-references, site-sealer, attachments, tools; members/roles/users api clients; newsletter tool-registrations.ts/.read/.deps). The passkey adapter is now verified end to end against a **software authenticator** (real ES256 "none" attestation + signed assertion through SimpleWebAuthn).
- **int-1** (90 tests, 10 files + `hosted-mcp/__tests__/sign-in-harness.ts`). These now read 100/100/100: hosted-mcp sign-in-configuration, sign-in-discovery, sign-in-flow, sign-in-provider, oauth-row-writes; connect.ts; budgets.ts. sign-in-status is 98.97/97.67/100: `:147` sits after `for(;;)` and cannot run. host.ts is 100/97.97/90.9: the `randomBytesFn`/`sleep` callbacks only run during a live OAuth flow.
- **int-2** (98 tests, 13 test files + `tool-registrations.fixture.ts`). credentialed-http/tools/tool-registrations 2.15% -> 100/97.7/100. These 10 files now read 100/100/100: custom-credentials agent-tools, credential-ports, write-files-validation; react other-credential-stores, access-token-forms, use-integrations.hooks, webhooks/rules, use-site-key.hooks; webhooks/site/subscriptions, signing.keyring. vendor-credentials/vault-adapter is 93.3/89/80.6 scoped; the rest is covered by the existing test (see the red below).

## EXCEPTIONs (no fake tests written)
- Re-export barrels: user-management `server/sql/index.ts`; integrations `api-connections/hosted-mcp/index.ts`, `secrets/index.ts`, `webhooks/sql/index.ts`, `webhooks/tools/index.ts`.
- Branches that cannot be reached (each a candidate for refactoring the branch away): project-keys `attached-vault.ts:69`, `service.ts:50,152`; `newsletter/subscriptions.ts:162`; `server/mfa/passkey-adapter.ts:23` (SimpleWebAuthn throws rather than returning `verified:false` for "none"); `member-login/link-service.ts:73-74`; `members/repo.sessions.ts:115`; `hosted-mcp/sign-in-status.ts:147`.

## BUGs
None proven. Nothing was appended to development/open-bugs.md.

## For the owner to decide / know
1. **These tests were already red on the unmodified merge-28 tree.** None of the files below was touched by this run, and neither was any production code:
   - user-management (full-suite baseline before any edit: 8 failed / 2061 passed / 229 files):
     - package-entries.test.ts
     - public-args.test.ts
     - user-management-rename.contract.test.ts
     - identity tool-registrations.identity-authorization ("a non-owner cannot enable the protected owner account")
     - members tool-registrations ("magic-link result exposes delivery only")
     - identity/sql user-trash-adapter ("a blocked user purge leaves identity and sessions untouched")
     - newsletter/delivery tool-registrations (2 tests)
   - integrations: `vendor-credentials/__tests__/vault-adapter.test.ts` "the sealed fixture requires the original owner and writes only after protected sealing". It expects the call order `['seal','verify','put']` and gets `['seal','put']`. This test was not in merge-28's red lists, so it may be a regression in the sealer/verify wiring. Not triaged.
2. **Type casts on partial fakes.** The workers' tests use `as unknown as X` / `as never` 39 times in total: int-1 18, int-2 15, um-1 3, um-2 3. My own tests have none. These are not the banned `as any`, and the existing newsletter tests already use the same pattern, but they are an escape from type checking. Replacing them with typed fakes is a cleanup if wanted.
3. Mutation notes were not executed: workers shared one working tree, so no source was mutated. The ledgers list one source mutation per test.

## LEFT (exact)
- **um-1 (49 files):**
  - mail/status/* (all 8)
  - member-login oidc-login.ts, oidc-request.ts, credentials.ts, providers.ts, unlink-identity.ts
  - identity: repo.ts, repo.authorization.ts, tool-registrations.ts, role-manage-permission.ts, user-manage-permission.ts, user-purge-types.ts, username-change-ports.ts, permission-list-tool.ts, owner-reset-env.ts, sql/kernel-user-trash-store.ts, sql/user-trash-adapter.ts
  - members: repo.memory.ts, ports.ts, public-member-auth-response.ts, capability-card.ts, access-resolver.ts, member-challenge-request.ts
  - all admin-http/* and admin/* branch/function gaps
  - The worker's ledger has the authoritative list.
- **um-2 (4 files):** members/tool-registrations.ts, newsletter/confirmation.ts, newsletter/delivery/tool-registrations.ts, newsletter/repo.memory.ts.
- **um-3 (22 files):** see the LEFT line in the um-3 ledger.
- **int-1 (15 files):** hosted-mcp/sign-in.ts, shared-sign-in.ts, credentialed-http/tools/credential-copy-tool.ts, sets/vault-repo.ts, sets/store.ts, declarations.ts, shared-owner.ts, vault-stores.ts, contribution.ts, shared-api.ts, shared.ts, shared-oauth-disconnect.ts, credentialed-request.ts:405, tools/index.ts:18, plus host.ts remainder.
- **int-2 (26 files):** see the LEFT section in the int-2 ledger. It covers the React components, the remaining hooks, and the 1–2 line branch gaps.

---
# Appendix: per-job ledgers (verbatim from the workers; um-3 from the coordinator)


## Ledger w62-cov-um-1

# w62-cov-um-1 ledger (TDD(GapFill))
TOUCHED:
packages/user-management/src/members/__tests__/member-auth.gap-harness.ts
packages/user-management/src/members/__tests__/member-sign-in.gap.test.ts
packages/user-management/src/members/__tests__/password-auth.gap.test.ts
packages/user-management/src/members/__tests__/password-auth.set.gap.test.ts
packages/user-management/src/members/__tests__/member-challenge.gap.test.ts
packages/user-management/src/members/__tests__/member-admin-writes.gap.test.ts
packages/user-management/src/member-login/__tests__/link-service.gap.test.ts
packages/user-management/src/member-login/__tests__/link-service.proof.gap.test.ts
packages/user-management/src/identity/__tests__/delete-user-service.gap.test.ts
packages/user-management/src/identity/__tests__/repo.authentication.gap.test.ts

FILES:
src/members/member-sign-in.ts | before L11.83/B100/F33.33 -> after 100/100/100 | tests added 12 (+1 in member-challenge.gap)
src/members/password-auth.ts | before 0/100/100 -> after 100/100/100 | tests added 20
src/members/member-challenge.ts | before 61.9/54.55/44.44 -> after 100/100/100 | tests added 7
src/members/member-credentials.ts | before 32.56/66.67/33.33 -> after 100/100/100 | tests added 1 (+ exercised by all above)
src/members/member-validation.ts | before 80/50/100 -> after 100/100/100 | (covered by createMember malformed-address test)
src/members/member-admin-writes.ts | before 6.4/100/0 -> after 100/100/100 | tests added 10
src/member-login/link-service.ts | before 14.81/100/8.33 -> after 100/97.61/100 | tests added 16 (73-74: proof.id/email mismatch with a resolved member is unreachable — the proof member is found by the same unique email; no-member-with-proof right side of ?? likewise)
src/identity/delete-user-service.ts | before 88.57/69.64/94.12 -> after (scoped to its 2 test files) 96.57/95.38/94.11; all brief-listed lines now covered; remaining 233-236,252-253 are covered elsewhere in the package suite (not in brief) | tests added 7
src/identity/repo.authentication.ts | before 72.5/70.97/77.78 -> after (with sql-identity.test.ts) 100/100/100 | tests added 4

MUTATIONS:
member-sign-in.gap:"saves the member principal first..." -> swap principals.save/members.save order, or drop .trim() on name
member-sign-in.gap:"refuses an address that already exists..." -> remove the existing?.status==="trash" branch (message changes)
member-sign-in.gap:"treats a disabled member appearing between..." -> remove `if (!member) throw` at member-sign-in.ts:79
member-sign-in.gap:"creates the account for a new-address link..." -> pass memberId: undefined / creationSource "operator" in resolveConsumedSignInMember
member-sign-in.gap:"signs a legacy member-bound link... keeping an earlier verification date" -> emailVerifiedAt: nowIso (drop ??)
member-sign-in.gap:"refuses a legacy link whose member no longer exists..." -> return resolved.member without null check
member-sign-in.gap:"refuses a link minted at or before the credential cutoff..." -> change >= to > at line 126
member-sign-in.gap:"accepts the right six-digit code once..." -> status stays existingMember.status
member-sign-in.gap:"refuses a wrong code and a code for a purpose..." -> skip verifyChallengeCode in consumeMemberChallenge
password-auth.gap:"normalizes the address..." -> drop toLowerCase()/trim in signInWithPassword
password-auth.gap:"spends a verify against the dummy hash..." -> skip verify when hash is null
password-auth.gap:"refuses a wrong password, a passwordless... pending" -> drop `|| !hash` or requireActiveMember
password-auth.gap:"refuses when an administrator disables..." -> drop the findById re-read (line 189-190)
password-auth.gap:"revokes the just-minted session..." -> drop currentHash re-read / revoke
password-auth.gap:"rejects a policy-violating password before consuming" -> move policy check after consume
password-auth.gap:"writes the hash, revokes every session and verifies + activates" -> verifyInbox:false in resetPassword
password-auth.gap:"fails closed without a transactional credential lifecycle" -> fall back to non-transactional writes
password-auth.gap:"refuses a missing member, disabled, cutoff" -> change >= to > in resettableMember
password-auth.gap:"refuses when the link expires while hashing" -> drop expiresAt<=committedAt clause
password-auth.gap:"refuses when the credential cutoff moves" -> drop credentialsRevokedAt!== clause
password-auth.set.gap:"keeps only the presenting session" -> omit exceptSessionId
password-auth.set.gap:"accepts a session issued within 15 min and refuses older" -> change <= 15*60_000 to <
password-auth.set.gap:"re-checks session age inside the lock" -> remove line 289 authorizePasswordSet call
password-auth.set.gap:"refuses when another password lands while hashing" -> remove currentHash!==hash check (line 288)
member-challenge.gap:"refuses issuance without member identity..." -> drop realm check at line 22
member-challenge.gap:"normalizes a legacy link-only row" -> drop `?? 0` / `?? null` in asChallenge
member-challenge.gap:"refuses a code once the attempt budget is spent" -> ignore reserveCodeAttempt result
member-challenge.gap:"lost CAS race" -> ignore store.consume result
member-challenge.gap:"memberPasswordHasher prefers injected" -> always return legacyPasswordHasher
member-admin-writes.gap:"trims the new name and note" -> drop .trim() on note
member-admin-writes.gap:"keeps the existing name and note" -> note = input.note?.trim() (undefined when absent)
member-admin-writes.gap:"disables, stamps the credential cutoff and revokes" -> remove revokeAllForMember call
member-admin-writes.gap:"is a no-op for an already-disabled member" -> remove early return at line 69
member-admin-writes.gap:"refuses ... archived tier and a duplicate" -> remove tier.status check / duplicate .some() check
member-admin-writes.gap:"cancels with a cancellation stamp" -> canceledAt: existing.canceledAt always
member-admin-writes.gap:"keeps the prior reference" -> externalRef: input.externalRef (drop ??)
member-admin-writes.gap:"refuses ... status outside the allowed set" -> remove VALID_SUBSCRIPTION_STATUSES check
link-service.gap:"creates an active, verified member..." -> notify with creationSource "operator" or drop the deferCreatedNotification flag (2 events)
link-service.gap:"links an existing pending member..." -> remove revokeAllForMember in activateAndLink / skip second lockKey
link-service.gap:"signs a linked active member straight in" -> always call activateAndLink (version/linkedAt change)
link-service.gap:"re-activates a linked but pending member" -> id: deps.ids.newId() ignoring pair.id
link-service.gap:"asks for inbox proof" -> email: input.identity.email always
link-service.gap:"refuses a subject whose member is gone..." -> drop providerId check in assertSubjectOwner
link-service.gap:"refuses when the member already has a different live subject" -> drop pair check
link-service.gap:"blocks ... credential cutoff" -> change >= to > in assertEligible
link-service.gap:"rejects an unparseable start time / maps unexpected" -> rethrow raw error in catch
link-service.proof.gap:"links after a correct code and revokes the session" -> remove sessions.revoke in verifyInbox
link-service.proof.gap:"reports a proof-created account as new without a second event" -> drop `&& !proof?.isNewMember`
link-service.proof.gap:"refuses a proof for a different address" -> remove proofMatchesTarget email check
link-service.proof.gap:"connects a different provider address" -> inbox applied unconditionally
link-service.proof.gap:"retries the whole transaction once" -> remove retry / retry on every error
delete-user-service.gap:"hands removeUser the user's username and email" -> title = target.displayName for users
delete-user-service.gap:"labels an api_key principal" -> subtitle null for api_key
delete-user-service.gap:"is an idempotent no-op" -> drop isInTrash check
delete-user-service.gap:"refuses a missing principal, non-user kind, no user row, self" -> drop kind check / user-row check
delete-user-service.gap:"refuses when the composition has no Trash wiring" -> call removeUser?.() and return undefined
delete-user-service.gap:"words self-disable and seeded-owner refusals" -> swap the ?: message arms
delete-user-service.gap:"assertActiveOwnerFloor" -> change <= 0 to < 0
repo.authentication.gap:"round-trips ip and user agent..." -> drop the ip/user_agent spread in toSessionRecord, or drop workspace_id predicate in findByTokenHash
repo.authentication.gap:"lists a principal's sessions" -> drop principal_id predicate
repo.authentication.gap:"round-trips every optional column..." -> drop issuedPolicyId/lastUsedAt/expiresAt spread in toApiKeyRecord
repo.authentication.gap:"updates a live key in place" -> onConflict doNothing (lastUsedAt stays absent)

EXCEPTION:
(none written; link-service.ts:73-74 residual branches are unreachable in practice — the inbox-proof member is resolved by the same unique email as the link target — flagged as a Refactor candidate, not fake-tested)
BUG:
(none found)
LEFT:
Not reached (cap): identity/repo.authorization.ts, identity/repo.ts, identity/tool-registrations.ts, identity/permission-list-tool.ts, identity/role-manage-permission.ts, identity/user-manage-permission.ts, identity/user-purge-types.ts, identity/username-change-ports.ts, identity/owner-reset-env.ts, identity/sql/*, mail/status/* (all 8), member-login/oidc-login.ts, oidc-request.ts, credentials.ts, providers.ts, unlink-identity.ts, members/access-resolver.ts, capability-card.ts, member-challenge-request.ts, ports.ts, public-member-auth-response.ts, repo.memory.ts, and all admin-http/* and admin/* branch-only gaps.
NOTE: baseline reds listed by coordinator do not touch any file I edited. member-auth.gap-harness.ts lives under __tests__ so public-args.test.ts does not scan it; its exported functions take one object arg anyway.

TESTS PASS: yes — Test Files 15 passed (15), Tests 101 passed (101) (9 new gap files = 78 new tests + 6 existing neighbour files); tsc: no errors in my files


## Ledger w62-cov-um-2

# w62-cov-um-2 ledger (TDD(GapFill))
TOUCHED:
packages/user-management/src/members/__tests__/members-sqlite.ts
packages/user-management/src/members/__tests__/repo.sessions.sqlite.test.ts
packages/user-management/src/members/__tests__/repo.sessions.revoke.sqlite.test.ts
packages/user-management/src/members/__tests__/repo.magic-tokens.sqlite.test.ts
packages/user-management/src/members/__tests__/repo.rows.mappers.test.ts
packages/user-management/src/newsletter/__tests__/campaign-write-service.gap.test.ts
packages/user-management/src/newsletter/__tests__/newsletter-sqlite.ts
packages/user-management/src/newsletter/__tests__/repo-sends.sqlite.test.ts
packages/user-management/src/newsletter/__tests__/repo-subscribers.sqlite.test.ts
packages/user-management/src/newsletter/__tests__/repo.campaigns.sqlite.test.ts
packages/user-management/src/newsletter/__tests__/repo.rows.campaign.test.ts
packages/user-management/src/members/__tests__/trash-member.test.ts
packages/user-management/src/members/__tests__/repo.members.sqlite.test.ts
packages/user-management/src/members/__tests__/repo.tiers-consents.sqlite.test.ts

FILES:
packages/user-management/src/members/repo.sessions.ts | before L30.19/B68.75/F42.86 -> after L100/B98.21/F100 | tests added 17 (real in-memory SQLite via server/sql/__tests__/support/sqlite-kernel.ts + new members-sqlite.ts DDL helper)

packages/user-management/src/members/repo.rows.ts | before L48.13/B44.0/F43.75 -> after L100/B~100 (242-243 closed by last tier case)/F100 | tests added 9 (pure mapper round-trips)
packages/user-management/src/newsletter/campaign-write-service.ts | before L17.34/B37.5/F27.27 -> after L100/B100/F100 | tests added 13 (in-memory campaign/list repos)
packages/user-management/src/newsletter/repo-sends.ts | before L30.29/B81.82/F37.5 -> after L100/B100/F100 | tests added 8 (real in-memory SQLite, new newsletter-sqlite.ts DDL helper)
packages/user-management/src/newsletter/repo-subscribers.ts | before L36.19/B92.31/F45.0 -> after L100/B100/F100 | tests added 5 (real in-memory SQLite)

packages/user-management/src/newsletter/repo.ts | before L43.65/B85.71/F41.67 -> after L100/B100/F100 | tests added 6 (real SQLite, driven through campaign-write-service)
packages/user-management/src/newsletter/repo.rows.ts | before L27.78/B90.0/F16.67 -> after L100/B100/F100 | tests added 5 (+ covered by the sqlite repo tests)
packages/user-management/src/members/trash-member.ts | before L0/B100/F100 -> after L100/B100/F100 | tests added 5 (InMemoryMemberRepo + injected RemoveEntity fake)

packages/user-management/src/members/repo.ts | before L49.83/B87.5/F50.0 -> after L100/B100/F100 | tests added 11 (real in-memory SQLite)
(members/repo.rows.ts final: L100/B100/F100 after tier-unpriced case)

MUTATIONS:
repo.members.sqlite.test.ts:"finds by id and by trimmed, lower-cased email" -> drop `.trim().toLowerCase()`
repo.members.sqlite.test.ts:"stores and reads the password hash only through the credential methods" -> drop `status <> 'trash'` in findPasswordHash; or add password_hash to toMemberRow
repo.members.sqlite.test.ts:"pages non-Trash members" -> drop `status <> 'trash'` in list / drop Math.min cap
repo.members.sqlite.test.ts:"accepts only the next version and never writes over Trash" -> `version = record.version - 1` to `<=`
repo.members.sqlite.test.ts:"never erases or lowers a stored credential cutoff" -> drop the credentials_revoked_at where
repo.members.sqlite.test.ts:"refuses a subject swap or reconnect unless relink is allowed" -> drop `if (!allowRelink)` guard / drop unlink `unlinked_at is null`
repo.tiers-consents.sqlite.test.ts:"updates only at the expected version" -> drop `.where("version","=",expectedVersion)`
repo.tiers-consents.sqlite.test.ts:"lists only active/comped subscriptions still in period" -> `>` to `>=` / drop status in-list
repo.tiers-consents.sqlite.test.ts:"upserts by id ... revisions ... by purpose" -> drop purpose where in listRevisions
repo.campaigns.sqlite.test.ts:"writes the row and its revision in one transaction under the campaign lock" -> drop lockKey("newsletter:campaigns") in transaction()
repo.campaigns.sqlite.test.ts:"keeps counters and the write-once creator kind on a re-save" -> stop excluding counters_json/created_by_kind in updatableCampaignColumns
repo.campaigns.sqlite.test.ts:"rolls the row back when the transaction body fails" -> transaction() calls fn() without kernel.transaction
repo.campaigns.sqlite.test.ts:"pages envelopes by id with a cursor" -> drop `id > after` where
repo.campaigns.sqlite.test.ts:"reports whether any campaign in the workspace is sending" -> drop status='sending' where
repo.campaigns.sqlite.test.ts:"increments one counter ... absent counter at zero" -> `(counters[c] ?? 0)` -> `counters[c]` (NaN -> null in JSON)
repo.rows.campaign.test.ts:"reports a non-object revision" -> drop `Array.isArray(state)` / `!state` guard
repo.rows.campaign.test.ts:"stores an absent creator kind as person" -> `c.createdByKind ?? "agent"`
trash-member.test.ts:"passes the member's display, version, time and actor" -> expectedVersion: null
trash-member.test.ts:"sends a null subtitle" -> `subtitle: member.name`
trash-member.test.ts:"maps the port's not-found, version-changed and blocked outcomes" -> swap the two reason branches
repo.rows.mappers.test.ts:"maps every populated column and never carries the password hash" -> add `passwordHash: row.password_hash` to toMemberRecord
repo.rows.mappers.test.ts:"maps NULL columns to absent record fields" -> drop the `credentials_revoked_at == null ? {}` spread guard
repo.rows.mappers.test.ts:"keeps the legacy token shape" -> always spread `email: row.email`
repo.rows.mappers.test.ts:"maps an external identity's unlink marker only when present" -> `unlinked_at: record.unlinkedAt` (undefined instead of null)
repo.rows.mappers.test.ts:"writes a consent revision with compact JSON snapshots" -> entity_kind "member"
repo.rows.mappers.test.ts:"round-trips a portal-visible tier" -> `visible_in_portal: 1` constant
campaign-write-service.gap.test.ts:"rejects a subject of length" -> `<` SUBJECT_MIN changed to `<=` 0 / drop max check
campaign-write-service.gap.test.ts:"accepts a preheader at the limit" -> `>` to `>=` PREHEADER_MAX
campaign-write-service.gap.test.ts:"creates a draft ... revision 1" -> seq starts at 0 / createdByKind default "agent"
campaign-write-service.gap.test.ts:"edits a draft, bumps the version" -> drop `version: existing.version + 1`
campaign-write-service.gap.test.ts:"rejects editing an unknown campaign, a stale version, and a non-draft" -> drop expectedVersion check
campaign-write-service.gap.test.ts:"clears the preheader when an edit omits it" -> `preheader: input.fields.preheader ?? existing.preheader`
campaign-write-service.gap.test.ts:"cancels a draft and refuses to cancel twice" -> skip transitionCampaignStatus in transitionAndWrite
campaign-write-service.gap.test.ts:"validates schedule timestamps" -> remove the calendar round-trip check (2026-02-30 accepted)
repo-sends.sqlite.test.ts:"pages a campaign's sends by id" -> drop afterId where
repo-sends.sqlite.test.ts:"lists and counts only pending sends" -> drop status = 'pending'
repo-sends.sqlite.test.ts:"upserts the updatable columns on id" -> add campaign_id to updatableSendColumns
repo-sends.sqlite.test.ts:"saves a batch in one transaction and rolls back" -> replace kernel.transaction with plain loop
repo-sends.sqlite.test.ts:"claims a pending send only when its lease is free or expired" -> `<=` to `<` on next_attempt_at
repo-sends.sqlite.test.ts:"records an outcome once" -> drop status='pending' where / always set provider_message_id
repo-subscribers.sqlite.test.ts:"finds by id, finds the default..." -> updatableListColumns keeps workspace_id/created_at
repo-subscribers.sqlite.test.ts:"pages a list's subscriptions" -> drop Math.min cap / cursor where
repo-subscribers.sqlite.test.ts:"lists only subscribed rows..." -> drop status='subscribed'; remove without workspace_id
repo-subscribers.sqlite.test.ts:"finds tokens ... re-save only moves consumed_at" -> doUpdateSet(values minus id)
repo.sessions.sqlite.test.ts:"refuses a session for a %s member" -> drop `member.status === "trash"` / `=== "disabled"` from save guard
repo.sessions.sqlite.test.ts:"refuses a session minted before the credential cutoff..." -> change `>` to `>=` in revokedAfterCreation (s2 at cutoff rejected)
repo.sessions.sqlite.test.ts:"updates an existing session but never clears its stored revocation" -> drop `revoked_at: keepStoredRevocation(...)` from doUpdateSet (would only matter with real port; here coalesce helper); or drop onConflict -> PK error
repo.sessions.sqlite.test.ts:"finds a session by token hash inside the workspace only" -> remove workspace_id where
repo.sessions.revoke.sqlite.test.ts:"advances an older cutoff but never lowers a newer one" -> remove the `credentials_revoked_at < revokedAt` or-branch
repo.sessions.revoke.sqlite.test.ts:"spares the excepted session" -> drop `.where("id","!=",exceptSessionId)`
repo.sessions.revoke.sqlite.test.ts:"revokeAllForMember ... live sessions" -> drop `.where("revoked_at","is",null)` (s3 stamp overwritten)
repo.magic-tokens.sqlite.test.ts:"counts attempts up to the default maximum of five" -> default maxAttempts = 6
repo.magic-tokens.sqlite.test.ts:"honours a caller maximum and refuses expired..." -> drop `consumed_at is null` / `expires_at >` where
repo.magic-tokens.sqlite.test.ts:"stamps consumed_at once" -> remove `if (existing.consumed_at)` throw
repo.magic-tokens.sqlite.test.ts:"rejects unknown and expired tokens" -> `<=` to `<` in expiry check

NOTES:
repo.sessions.ts:115 — defensive throw inside `$if(exceptSessionId !== undefined, ...)`; unreachable by construction (only narrows the type for TS). Refactor candidate (use a non-null local), not fake-tested.

EXCEPTION:
BUG:
LEFT:
packages/user-management/src/members/tool-registrations.ts (tool-call cap; baseline-red test members/__tests__/tool-registrations.test.ts is pre-existing, untouched)
packages/user-management/src/newsletter/confirmation.ts
packages/user-management/src/newsletter/delivery/tool-registrations.ts (baseline-red existing test untouched)
packages/user-management/src/newsletter/repo.memory.ts (partially exercised by campaign-write-service.gap.test.ts via InMemory campaign/list repos; not measured)

NOTE: mutations above are named, not executed (did not edit production files while other workers share the tree).
NOTE: new helpers members/__tests__/members-sqlite.ts and newsletter/__tests__/newsletter-sqlite.ts import the shared real-SQLite kernel server/sql/__tests__/support/sqlite-kernel.ts (read-only reuse) and carry DDL mirroring repo.rows.ts row types.

TESTS PASS: yes — Test Files 16 passed (16), Tests 91 passed (91); tsc clean for all touched files.


## Ledger w62-cov-um-3

(coordinator-written; all runs scoped to the touched test files plus existing tests of the same sources)

TOUCHED:
packages/user-management/src/project-keys/__tests__/{attached-vault,attachments,create-vault,site-references,site-sealer}.test.ts (extended)
packages/user-management/src/project-keys/__tests__/{service,tools}.behaviour.test.ts (new)
packages/user-management/src/react/{members,users}/__tests__/{members,users}-api.unit.test.ts, react/roles/__tests__/roles-api.unit.test.ts (new)
packages/user-management/src/server/__tests__/recovery-codes.test.ts (extended), server/mfa/__tests__/passkey-adapter.test.ts (new)
packages/user-management/src/newsletter/__tests__/subscriptions.save-import.test.ts, tool-registrations.harness.ts, tool-registrations.read.test.ts, tool-registrations.write.gap.test.ts (new)

COVERAGE (lines/branches/functions, before -> after):
project-keys/attached-vault.ts 58.6/69.2/62.5 -> 100/97.3/100 (69 = EXCEPTION)
project-keys/create-vault.ts 68.4/60/75 -> 100/100/100
project-keys/service.ts 55.9/39.1/38.9 -> 100/98.2/100 (50,152 = EXCEPTION)
project-keys/site-references.ts 63.5/75/60 -> 100/100/100
project-keys/site-sealer.ts 97.6/79.2/90 -> 100/100/100
project-keys/sql/attachments.ts 86/73.9/60 -> 100/100/100
project-keys/tools.ts 62.5/83.3/36.4 -> 100/100/100
react/members/api/members-api.ts, react/roles/api/roles-api.ts, react/users/api/users-api.ts 0 -> 100/100/100
server/mfa/passkey-adapter.ts 10.3/100/0 -> 100/91.7/100 (23 = EXCEPTION)
server/recovery-codes.ts 91.4/90.7/100 -> listed lines 37-38,66-67,99-100 covered (scoped 95.7/92.9/100; 61-63 covered by other suites)
newsletter/subscriptions.ts 18.6/83.3/20 -> 100/96.9/100 (162 = EXCEPTION)
newsletter/tool-registrations.ts 0 -> 100/100/100; tool-registrations.read.ts 23.4/100/11.1 -> 100/100/100; tool-registrations.deps.ts fn 50 -> 100/100/100
newsletter/tool-registrations.write.ts 29.1/61.5/15.4 -> 99.5/93.8/100 (170 = diagnostic-of-diagnostic catch)

MUTATIONS (test -> source mutation that turns it red):
attached-vault: forwards exact args -> drop `options` in vault.find; failing grant check -> return row instead of null in catch / drop report; list scope -> remove isInVaultQueryScope filter; inventory failure -> drop policy.report({kind:"list"}); findByLabel -> skip find() grant recheck / drop label report; absent label index -> always add findByLabel; findOne -> ignore ownerKey/principalId filter; findDefault -> return rows[0] when >1 rows; writes refused -> forward put to vault.
create-vault: new create -> call view.put; conflict -> rethrow VaultError instead of conflictError({}); refused replacement -> drop `!allowReplacement ||`; allowed replacement -> skip owner.put.
site-references: read shape -> drop typeof credentialId check; id validation -> drop length/NUL check; set revision -> hardcode expectedRevision null; remove missing -> delete unconditionally; has -> drop equality check.
service.behaviour: use attach/detach + references.set; missing site / unknown key / OAuth without binder; bind-before-attach order; reapply restart/failed message; site-key adoption (drop adopt spread); permissionFor site source; list labels (card saveKind filter, describeOAuth, api-connection filter); inventory preference; listChoices/listGranted usedBy; savedResult guards (store/scope site, saved/created, keyId/credential.id/credentialId).
tools.behaviour: catalog permissions/const false; list authorize+cards; unavailable copy; malformed revoke input; usedBy:[] hidden; abort before use; site_restart prepare/describe/ask/declined; run decisions (null/accepted false/true, awaitAcceptance); abort before restart.
site-sealer: granted open returns plaintext (swap allowed check order), seal pass-through; malformed AAD (drop prefix/JSON/shape checks).
attachments: isAttached empty site; usersOf ordering (ORDER BY); renameSite/removeKey; attach without site; empty-site keysFor/keyForLabel; object meta (drop typeof string branch); table identifier regex.
api clients: each path/method/body (encodeURIComponent removal, method swap, `|| undefined` removal for resourceType).
recovery-codes: ghost owner (drop principal check); entropy (drop Set size / regex check); bad code format (drop regex).
passkey-adapter: options (rpName/userID hash/excludeCredentials/userVerification); real attestation + assertion via software authenticator (counter return, publicKey encoding); wrong challenge rejected; impostor key -> "Passkey assertion was not verified" (drop verified check).
subscriptions: pending row + mail link; existing row reuse (`existing ??`); unknown/archived list, unknown subscriber; import per-row failures and INTERNAL_ERROR; batch bounds 0/501/500; unsubscribe unknown id, null consent capability.
newsletter tools: registration set/derived risk/contributor; list status filter + hidden fields; get not-found code; forbidden; lists/subscriptions views + subscriber.read permission; send-log cursor paging/truncated; send-pipeline default false; create/update/cancel/pause/list/archive/subscription/remove/resend handlers (permission names, field fallbacks, list mismatch, mail-off drivers + re-check, pending-only resend, abort, logged failure).

EXCEPTION:
project-keys/attached-vault.ts:69 (`only === undefined` when rows.length===1: unreachable, noUncheckedIndexedAccess guard)
project-keys/service.ts:50,152 ("no site key source" throws: isSiteKey() already requires siteKeys)
server/mfa/passkey-adapter.ts:23 (registration `verified:false` branch: SimpleWebAuthn throws for every malformed "none" attestation instead of returning false)
newsletter/subscriptions.ts:162 (row undefined inside bounds loop: unreachable)
server/sql/index.ts:1,3-5 (pure re-export barrel)
BUG: none.
LEFT (not reached): newsletter/send-pipeline.ts, public-http/routes/mail/feedback.ts, react/auth/{Passkeys.hooks.ts,Passkeys.tsx,TotpSettings.hooks.ts,TotpSettings.tsx,hooks/use-login.hooks.ts}, react/mail/{Email.tsx,EmailProviderTab.tsx,EmailTemplateEditor.tsx}, react/users/{UsersDialogs.tsx,UsersTable.tsx,hooks/use-localized-users.hooks.ts}, server/{auth-service.ts,link-policy.ts,login-providers.ts,mfa/passkey-service.ts,mfa/service.ts,owner-reset-input.ts,repo.memory.ts}.
TESTS PASS: yes — touched files 100% green; user-management `tsc --noEmit` 0 errors.


## Ledger w62-cov-int-1

# w62-cov-int-1 ledger (TDD(GapFill))
TOUCHED:
packages/integrations/src/api-connections/hosted-mcp/__tests__/sign-in-harness.ts
packages/integrations/src/api-connections/hosted-mcp/__tests__/sign-in-provider.test.ts
packages/integrations/src/api-connections/hosted-mcp/__tests__/oauth-row-writes.test.ts
packages/integrations/src/api-connections/hosted-mcp/__tests__/sign-in-flow.test.ts
packages/integrations/src/api-connections/hosted-mcp/__tests__/sign-in-status.test.ts
packages/integrations/src/api-connections/hosted-mcp/__tests__/sign-in-discovery.test.ts
packages/integrations/src/api-connections/hosted-mcp/__tests__/sign-in-configuration.test.ts
packages/integrations/src/api-connections/__tests__/connect.unit.test.ts
packages/integrations/src/api-connections/__tests__/host.unit.test.ts
packages/integrations/src/api-connections/__tests__/budgets.unit.test.ts

COVERAGE:
src/api-connections/hosted-mcp/sign-in-configuration.ts | 5.19/100/0 -> 100/100/100 | tests 7
src/api-connections/hosted-mcp/sign-in-discovery.ts | 10.34/100/0 -> 100/100/100 | tests 8
src/api-connections/hosted-mcp/sign-in-flow.ts | 18.75/100/0 -> 100/100/100 | tests 5
src/api-connections/hosted-mcp/sign-in-provider.ts | 9.57/100/0 -> 100/100/100 | tests 15
src/api-connections/hosted-mcp/sign-in-status.ts | 4.08/100/0 -> 98.97/97.67/100 | tests 13
src/api-connections/hosted-mcp/oauth-row-writes.ts | 7.41/100/0 -> 100/100/100 | tests 6
src/api-connections/connect.ts | 5.66/100/0 -> 100/100/100 | tests 14
src/api-connections/host.ts | 3.66/100/0 -> 100/97.97/90.9 | tests 17
src/api-connections/budgets.ts | 86.67/66.67/87.5 -> 100/100/100 | tests 5

MUTATIONS:
sign-in-provider.test.ts:"builds a connection-owned provider ..." -> change `connection-${serverId}` fallback or drop deviceAuthorizationEndpoint spread
sign-in-provider.test.ts:"isStaleSelfRegisteredClient ..." -> remove the `oauthGrant === "device_code"` early return
oauth-row-writes.test.ts:"retries once after a missed write..." -> applyInternalChange loop bound 2 -> 1
oauth-row-writes.test.ts:"writes the built row one version up" -> drop `version: current.version + 1`
sign-in-flow.test.ts:"binds the state AAD ..." -> drop browserBinding/config.version from AAD parts
sign-in-status.test.ts:"forgets a self-registered client ..." -> keep clientSecret when forgetClient (dropClientSecret ignored)
sign-in-status.test.ts:"retries an unconfigured reseal up to three attempts" -> CLEAR_TOKEN_RESEAL_ATTEMPTS 3 -> 2
sign-in-status.test.ts:"rethrows any other open failure" -> swallow non-unconfigured open errors
sign-in-discovery.test.ts:"prefers authorization_code, then device_code" -> swap the two includes checks
sign-in-discovery.test.ts:"registers a redirect client ..." -> registrationGrantTypes returns authorization_code for device_code
sign-in-configuration.test.ts:"mints a public device client ..." -> `identity.clientSecret ?? existing.clientSecret`
sign-in-configuration.test.ts:"replaces a self-registered client pinned ..." -> selfConfiguredEndpoints lets discovered override stored
sign-in-configuration.test.ts:"returns a fully configured row untouched ..." -> remove the early-return guard
connect.unit.test.ts:"aborts an earlier listener for the same connection..." -> drop `slots.get(key)?.abort()` in claimLoopbackSlot
connect.unit.test.ts:"listens on loopback, starts, and completes..." -> omit `state` from complete().callbackParams
connect.unit.test.ts:"maps a connection refusal to a tool input error..." -> asToolError rethrows ApiConnectionError raw
connect.unit.test.ts:"returns connected and selects the local copy..." -> pass local:false to statusOf / skip selectLocal
host.unit.test.ts:"accepts a declared or configured origin and refuses the rest" -> drop configuredOrigins(...) from `allowed`
host.unit.test.ts:"marks a connection whose tokens belong to another client..." -> isUnreadableTokenRecord ignores "owner-mismatch"
host.unit.test.ts:"turns an unreadable token record into reconnect-required..." -> refuseChangedClient rethrows instead of clientChanged
host.unit.test.ts:"reuses a stored shared context, else builds one..." -> byoOAuthClient uses clientKind "confidential" on desktop
host.unit.test.ts:"refuses a missing client id or a missing confidential secret..." -> drop the confidential-secret check
budgets.unit.test.ts:"names exactly what is wrong" -> remove duplicate-scope check
budgets.unit.test.ts:"checks the connection budget before the instance one..." -> drop the sort / key limiter per call
budgets.unit.test.ts:"refuses with the retry wait in milliseconds..." -> retryAfterMs = retryAfterSeconds

EXCEPTION:
src/api-connections/hosted-mcp/sign-in-status.ts:147 — closing brace after `for(;;)` in resealClearedOAuthToken; the loop only exits by return/throw, so V8's implicit function-end is unreachable. Refactor candidate (e.g. `while (true)` with explicit throw after), not testable.
src/api-connections/host.ts — remaining: fn 90.9 = the `randomBytesFn`/`sleep` lambdas passed into createApiConnectionService (only invoked during a live OAuth flow; covered by the integration suites, not by this unit file). Branches 161/171/173 (`?? []`/compareAndSet-false/`!connection` arms in markReconnectRequired/tokensForAnotherClient) not reached — LEFT.

BUG: none found.

LEFT (not reached, tool-call cap):
src/api-connections/hosted-mcp/sign-in.ts
src/api-connections/hosted-mcp/shared-sign-in.ts
src/credentialed-http/tools/credential-copy-tool.ts
src/credentialed-http/sets/vault-repo.ts
src/credentialed-http/sets/store.ts
src/api-connections/declarations.ts
src/api-connections/shared-owner.ts
src/api-connections/vault-stores.ts
src/api-connections/contribution.ts (branches/functions)
src/api-connections/shared-api.ts, shared.ts, shared-oauth-disconnect.ts (branch-only gaps)
src/credentialed-http/credentialed-request.ts:405
src/credentialed-http/tools/index.ts:18
src/api-connections/hosted-mcp/index.ts — EXCEPTION candidate: barrel (type re-exports + 2 value re-exports), not tested.

Typecheck: `tsc -p tsconfig.json --noEmit` shows no errors in any touched file.
TESTS PASS: yes — Test Files 10 passed (10), Tests 92 passed (92) (90 new + 2 pre-existing shared-owner)


## Ledger w62-cov-int-2

# Ledger w62-cov-int-2 (TDD(GapFill), packages/integrations)
TOUCHED:
packages/integrations/src/credentialed-http/tools/__tests__/tool-registrations.fixture.ts
packages/integrations/src/credentialed-http/tools/__tests__/tool-registrations.test.ts
packages/integrations/src/credentialed-http/tools/__tests__/tool-registrations.save.test.ts
packages/integrations/src/custom-credentials/__tests__/agent-tools.unit.test.ts
packages/integrations/src/custom-credentials/__tests__/credential-ports.unit.test.ts
packages/integrations/src/custom-credentials/__tests__/write-files-validation.gap.test.ts
packages/integrations/src/react/credentials/__tests__/other-credential-stores.unit.test.ts
packages/integrations/src/react/credentials/__tests__/access-token-forms.gap.unit.test.ts
packages/integrations/src/react/webhooks/hooks/__tests__/use-integrations.hooks.unit.test.tsx
packages/integrations/src/react/webhooks/__tests__/rules.unit.test.ts
packages/integrations/src/react/site-key/hooks/__tests__/use-site-key.hooks.unit.test.tsx
packages/integrations/src/vendor-credentials/__tests__/vault-adapter.gap.test.ts
packages/integrations/src/webhooks/site/__tests__/subscriptions.test.ts
packages/integrations/src/webhooks/site/__tests__/signing.keyring.test.ts

COVERAGE:
src/credentialed-http/tools/tool-registrations.ts | before L2.15/B100/F0 -> after L100/B97.74/F100 | tests added 34
src/custom-credentials/agent-tools.ts | before L0/B100/F100 -> after L100/B100/F100 | tests added 5
src/custom-credentials/credential-ports.ts | before L0/B100/F100 -> after L100/B100/F100 | tests added 3
src/custom-credentials/write-files-validation.ts | before L73.15/B69.44/F88.89 -> after L100/B100/F100 | tests added 9
src/react/credentials/other-credential-stores.ts | before L0/B0/F0 -> after L100/B100/F100 | tests added 7
src/react/credentials/access-token-forms.ts | before L26.23/B25/F12.5 -> after L100/B100/F100 | tests added 8
src/react/webhooks/hooks/use-integrations.hooks.ts | before L0/B0/F0 -> after L100/B100/F100 | tests added 7
src/react/webhooks/rules.ts | before L67.5/B75/F42.86 -> after L100/B100/F100 | tests added 4
src/react/site-key/hooks/use-site-key.hooks.ts | before L0/B0/F0 -> after L100/B100/F100 | tests added 7
src/vendor-credentials/vault-adapter.ts | before L78.18/B79.37/F76.92 -> after L93.33/B89.01/F80.55 (gap+bindings only; remaining 138-158 are covered by existing vault-adapter.test.ts, which has 1 PRE-EXISTING failure, see below) | tests added 7
src/webhooks/site/subscriptions.ts | before L73.91/B75/F50 -> after L100/B100/F100 | tests added 3
src/webhooks/site/signing.keyring.ts | before L0/B0/F0 -> after L100/B100/F100 (not a barrel: binds SIGNATURE_VOCABULARY) | tests added 1

MUTATIONS:
tool-registrations.test.ts:list strips token hints... -> drop `tokenHint` destructure in listCredentials (hint leaks)
tool-registrations.test.ts:list ignores non-api plugin cards... -> remove `saveKind === 'api'` filter / `?? []`
tool-registrations.test.ts:set-username sets, clears... -> remove rejectUnexpectedSetUsernameFields call / allow blank username
tool-registrations.test.ts:set-username refuses unknown label and aborted run -> drop ctx.signal.throwIfAborted()
tool-registrations.test.ts:non-DELETE requests pass headers/body -> pass headers inside required arg
tool-registrations.test.ts:validation and egress refusals... -> drop "egress-refused" from category check (raw address leaks)
tool-registrations.test.ts:asks a human with the resolved target... -> skip approval for DELETE / drop url.search from path
tool-registrations.test.ts:declined is cancelled... -> map declined to reason:'declined'
tool-registrations.test.ts:fails closed without a surface channel... -> remove `!emitSurface` throw
tool-registrations.test.ts:returns a setup failure... -> remove `"credentialSetup" in target` early return
tool-registrations.test.ts:plans then commits the same plan... -> re-plan inside performRepositoryFilesWrite / schemes change
tool-registrations.test.ts:shape rejections become input errors -> isWriteFilesShapeRejection returns false
tool-registrations.test.ts:build and plan failures... -> drop diagnostics.writeFailure({phase:'plan'})
tool-registrations.test.ts:abandons after planning when aborted... -> remove ctx.signal.aborted check before commit
tool-registrations.save.test.ts:re-reads the row, keeps its current username -> use existing.username instead of describe()
tool-registrations.save.test.ts:falls back to the sealed username -> drop resolve() fallback
tool-registrations.save.test.ts:a row deleted while the form was open -> remove `if (!current) throw`
tool-registrations.save.test.ts:a run aborted during save -> remove `signal.aborted` runEnded throw
tool-registrations.save.test.ts:probes the plugin url... -> drop refused/unavailable check in probeCardBeforeSave
tool-registrations.save.test.ts:refuses a probe url on a different origin -> remove origin comparison
tool-registrations.save.test.ts:saves with defaults, invalidates after save -> skip invalidate({after}) / default category ''
tool-registrations.save.test.ts:a duplicate label is refused -> return err.message instead of messages.duplicateLabel
tool-registrations.save.test.ts:a project conflict keeps the store message -> classify validation as 'error'
tool-registrations.save.test.ts:a blank or non-free label displays as Untitled -> safeCredentialLabel returns label unchanged
tool-registrations.save.test.ts:saves the plugin card values with its extra hosts -> drop additionalHosts spread
tool-registrations.save.test.ts:refuses an unknown provider -> drop `if (!card)` throw
agent-tools.unit.test.ts:names five tools... -> give makeRequest permissions.read / sideEffects none
agent-tools.unit.test.ts:make-request allows only the five methods -> add 'HEAD' to enum
agent-tools.unit.test.ts:set-username requires a username that may be null -> type 'string' only
agent-tools.unit.test.ts:write-files caps the file count -> hardcode maxItems 25
credential-ports.unit.test.ts:egress refusals expose only the caller-safe message -> rebuild callerSafeError with error.message
credential-ports.unit.test.ts:maps validation, not-found... -> swap not-found/validation order or drop transport branch
credential-ports.unit.test.ts:forwards each call... -> pass deps (not {repo}) to resolveRequestTarget / drop body
write-files-validation.gap.test.ts:passes the provider validator through only when given -> always pass {validateTarget}
write-files-validation.gap.test.ts:refuses over-long, NUL, absolute... -> remove drive-letter regex / NUL check
write-files-validation.gap.test.ts:refuses malformed entries and an over-cap single file -> drop per-file cap check
write-files-validation.gap.test.ts:refuses missing, empty and over-count file lists -> `>=` vs `>` maxFiles
other-credential-stores.unit.test.ts:finds the store by id and falls back -> drop `?? stores[0]`
other-credential-stores.unit.test.ts:matches a trimmed, case-insensitive query -> remove purposeLabel match / toLowerCase
other-credential-stores.unit.test.ts:keeps only well-formed provider cards -> drop label typeof check
other-credential-stores.unit.test.ts:counts saved tokens... -> `.replace("{query}", query)` (string form expands $&)
access-token-forms.gap.unit.test.ts:replacement without a token is ready only on a rename -> compare untrimmed names
access-token-forms.gap.unit.test.ts:existing rows: worksFor-only edits save... -> drop `row.kind !== SOURCE_CONTROL`
access-token-forms.gap.unit.test.ts:publish uses the provider spec or a token-only default -> put token under "token" always
access-token-forms.gap.unit.test.ts:patch carries worksFor only for publish rows -> drop ref.kind === "publish"
access-token-forms.gap.unit.test.ts:maps duplicate-label and validation markers -> use e.message only (ignore code)
use-integrations.hooks.unit.test.tsx:creates with parsed topics... -> skip setFormOpen(false)/clears
use-integrations.hooks.unit.test.tsx:toggles pause by current status -> paused: subscription.status === "paused"
use-integrations.hooks.unit.test.tsx:deletes only the pending row... -> move setPendingDelete(null) out of finally / skip reset of toggle error
use-integrations.hooks.unit.test.tsx:loads subscriptions and invalidates -> onRefresh no-op
rules.unit.test.ts:offers Resume for paused rows -> invert status check
rules.unit.test.ts:prefers deliveredAt -> use createdAt only
rules.unit.test.ts:orders toggle, delete, then list error -> drop hasSubscriptions guard
use-site-key.hooks.unit.test.tsx:reveal does nothing for an inactive key -> drop `!status?.active` guard
use-site-key.hooks.unit.test.tsx:generates only when no key exists -> drop `status?.source !== "none"` guard / skip loader.replace
use-site-key.hooks.unit.test.tsx:classifies a refused generate, and refresh clears it -> remove setGenerateError(null) in refresh
use-site-key.hooks.unit.test.tsx:maps each refusal marker -> use refusal.message before code
vault-adapter.gap.test.ts:update keeps the hint for the same envelope -> always copy existing.last4
vault-adapter.gap.test.ts:a vendor row whose meta is not vendor-typed is hidden -> drop credentialType check
vault-adapter.gap.test.ts:missing or foreign rows are a no-op; a conflict is swallowed -> swallow every error
subscriptions.test.ts:create stamps the host ISO clock -> drop createdByPluginId spread
subscriptions.test.ts:update re-checks the target -> adaptSubscriptionDeps drops isAllowedTarget
signing.keyring.test.ts:derives the per-subscription secret -> pass version: 1 / different vocabulary

EXCEPTION:
packages/integrations/src/secrets/index.ts:1-2 — pure `export *` barrel (types.js, ports.js)
packages/integrations/src/webhooks/sql/index.ts:1 — pure re-export barrel
packages/integrations/src/webhooks/tools/index.ts:2,4-5 — pure re-export barrel

BUG: none found.
PRE-EXISTING FAILURE (not my file, not edited): src/vendor-credentials/__tests__/vault-adapter.test.ts "the sealed fixture requires the original owner and writes only after protected sealing" — expected ['seal','verify','put'] got ['seal','put'] (line 76). packages/platform has no local changes; likely a platform behaviour/dist drift. Coordinator should triage.

LEFT (cap reached, not started): custom-credentials/credentialed-request.ts (90-92), custom-credential-create-ui.ts (182-191), provider-settings-card.ts (branch), media-providers/catalog-projection.ts (36-37), media-providers/dispatch/engine.ts, dispatch/openai-compatible.ts, react/admin-credentials/AdminByokKeyPanel.tsx, react/credentials/OtherCredentialsSection.hooks.tsx, OtherCredentialsSection.tsx, credential-copy.ts (branch), react/site-key/SiteKeyRecoveryCard.tsx, SiteKeyTab.tsx, hooks/use-site-key-recovery.hooks.ts, react/webhooks/IntegrationDeliveries.tsx, Integrations.tsx, hooks/use-integration-deliveries.hooks.ts, vendor-credentials/abort-guarded-repo.ts, project-scope.ts, web-screenshot/capture-retention.ts, web-screenshot.ts, webhooks/site/http.memory.ts, repo.memory.ts, seal-aad-invariant.node.ts, webhooks/sql/webhook-repo.ts, webhooks/tools/tool-handlers.ts, tool-views.ts

TESTS PASS: yes — 14 test files / 98 tests passed (all files I created; final run after type fixes). tsc: no errors in my test files.
