# U1-members-sql — machine-verified facts (generated; do not hand-edit)

Source: Tovu `origin/integ/merge-b-2026-11-16` @ `491632dc5`. Regenerate: `python3 scripts/inv.py && python3 scripts/rep.py && python3 scripts/facts.py <out>`. Blobs are `git hash-object` of that tree; a sheet executor re-checks every blob (COMMON STOP-on-mismatch).

Files: 3, 974 lines (tests not counted).

## Files
| path (under apps/website/src) | lines | blob | CLASSIFY label | audit row | existing sheet/design mention | prod importers | test importers |
|---|---|---|---|---|---|---|---|
| features/members/repo.rows.ts | 301 | 5f76dde8dbdb4f701047db9f72f502525fbc17ba | - | - | - | 1 | 1 |
| features/members/repo.sqlite.ts | 69 | fc4b2cc5d971121869fce10d3c735c9c05b127c8 | - | - | - | 1 | 3 |
| features/members/repo.ts | 604 | bb8a70ad6090cbede4743a4f392e837734370723 | - | - | - | 2 | 12 |

## Per file: exports, tables, lock keys, imports that leave the folder, importers

### features/members/repo.rows.ts (301 lines)
- exports (23): MemberRow, MemberTierRow, MemberSubscriptionRow, MemberSessionRow, MagicTokenRow, MemberConsentRow, MemberRevisionRow, toMemberExternalIdentityRecord, toMemberExternalIdentityRow, toMemberRecord, toMemberRow, toMemberTierRecord, toMemberTierRow, toMemberSubscriptionRecord, toMemberSubscriptionRow, toMemberSessionRecord, toMemberSessionRow, toMagicLinkTokenRecord, toMagicLinkTokenRow, toMemberConsentRecord, toMemberConsentRow, toMemberConsentRevisionRecord, toConsentRevisionRow
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/contracts/storage, @jini-ai/core/primitives, kysely
- same-folder imports: features/members/types.ts
- imports leaving the folder: platform/db/content-database.generated.ts
- prod importers (1): features/members/repo.ts
- test importers (1): features/members/__tests__/repo.rows.test.ts

### features/members/repo.sqlite.ts (69 lines)
- exports (7): SqliteMemberExternalIdentityRepo, SqliteMemberRepo, SqliteMemberTierRepo, SqliteMemberSubscriptionRepo, SqliteMemberSessionRepo, SqliteMagicLinkTokenRepo, SqliteMemberConsentRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/members/repo.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/sqlite/content-db.ts
- prod importers (1): features/members/index.ts
- test importers (3): features/members/__tests__/consent-service.test.ts, features/members/__tests__/repo.contract.test.ts, features/members/__tests__/restart.integration.test.ts

### features/members/repo.ts (604 lines)
- exports (7): SqlMemberExternalIdentityRepo, SqlMemberRepo, SqlMemberTierRepo, SqlMemberSubscriptionRepo, SqlMemberSessionRepo, SqlMagicLinkTokenRepo, SqlMemberConsentRepo
- tables touched: member_consents, member_external_identities, member_magic_tokens, member_revisions, member_sessions, member_subscriptions, member_tiers, members
- lock keys: 391: await this.kernel.lockKey(`trash:member:${record.workspaceId}:${record.memberId}`); | 424: await this.kernel.lockKey(`trash:member:${required.workspaceId}:${required.memberId}`); | 501: await this.kernel.lockKey(`members:magic-tokens:${required.workspaceId}`);
- flags: -
- npm/@jini-ai imports: @jini-ai/core/list-page, @jini-ai/core/optimistic-concurrency
- same-folder imports: features/members/ports.ts, features/members/repo.rows.ts, features/members/types.ts
- imports leaving the folder: platform/db/content-kernel.ts
- prod importers (2): features/members/index.ts, features/members/repo.sqlite.ts
- test importers (12): features/member-login/__tests__/link-service.dialects.test.ts, features/members/__tests__/credentials-revocation.dialects.test.ts, features/members/__tests__/member-auth-repo.dialects.test.ts, features/members/__tests__/member-external-identities.dialects.test.ts, features/members/__tests__/member-external-identities.postgres.test.ts, features/members/__tests__/member-repo.list-cursor.test.ts, features/members/__tests__/password-lifecycle.dialects.test.ts, features/members/__tests__/repo.dialects.test.ts, features/members/__tests__/tier-repo.lost-update.test.ts, features/trash/__tests__/member-adapter.test.ts, platform/db/migrations/__tests__/member-signup-email-step.test.ts, server/__tests__/routes/member-password-auth.test.ts

## Test files that import a file of this sheet (blob-guard each before editing)
| test | lines | blob |
|---|---|---|
| features/members/__tests__/repo.rows.test.ts | 20 | c809f11bfccb74ce3aff417035388c4ac05266ed |
| features/members/__tests__/consent-service.test.ts | 292 | 2af33b12ed4b39b50a8996b458881341ba815e19 |
| features/members/__tests__/repo.contract.test.ts | 464 | a7438828cc2390a151a08a9de87abd7cafae177b |
| features/members/__tests__/restart.integration.test.ts | 86 | 523fedf1b32a1edb481f8c0661abe3008330ffd2 |
| features/member-login/__tests__/link-service.dialects.test.ts | 55 | 6b9a5b54d58d5fcb933b28ba13d6d6e21c2ad872 |
| features/members/__tests__/credentials-revocation.dialects.test.ts | 135 | 9805806144f6df1d35ffdc2847f58b3998447b8e |
| features/members/__tests__/member-auth-repo.dialects.test.ts | 140 | a82c96d9b38e99fe4303557180031620b702980a |
| features/members/__tests__/member-external-identities.dialects.test.ts | 35 | d2b3c6f0ec9f59bb55dd73fb63f633751a350245 |
| features/members/__tests__/member-external-identities.postgres.test.ts | 25 | 54fb66718d7011cfa9702dcbef4275780d3d2208 |
| features/members/__tests__/member-repo.list-cursor.test.ts | 74 | e50d6485a037c59cda79a05d8c4d51f3bcd6407f |
| features/members/__tests__/password-lifecycle.dialects.test.ts | 240 | 9d0aeee1cdffa7e1b6921fbbabea2dc335afb3b0 |
| features/members/__tests__/repo.dialects.test.ts | 603 | f114d078a47484db4c2f027c58226d23fbcba23b |
| features/members/__tests__/tier-repo.lost-update.test.ts | 64 | f19e2cb3cb15f3aac479a5ff598e37e536a5fbce |
| features/trash/__tests__/member-adapter.test.ts | 369 | f2658334970b73a7790ffe38f1f7967fdebbf336 |
| platform/db/migrations/__tests__/member-signup-email-step.test.ts | 38 | 8fb56162357ba389b135b4114dee7d7443495349 |
| server/__tests__/routes/member-password-auth.test.ts | 587 | ccba41091ae080d745d4aae3e3228c6fb632d09a |

## vi.mock / vi.doMock / importActual sites that name a file of this sheet (lesson 2: mock factories are consumers)
- none found by pattern (re-check with the census at execution)

## Path-keyed baselines / configs that name a file of this sheet (lesson 10: debt does not follow moved code silently)
- development/scripts/write-path-inventory.baseline.json: `src/features/members/repo.sqlite.ts` at lines 2317, 2326, 2334, 2342, 2350, 2359, 2367, 2375, 2383, 2391, 2399, 2407 (12 hits)

## Census command (run from the Tovu clone root; every hit must be listed above)
```
rg -n --no-heading -e 'repo|repo\.rows|repo\.sqlite' apps development scripts --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx' -g '*.json' -g '*.mjs' -g '*.cjs' | rg 'members'
```
