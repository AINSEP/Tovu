TDD(Direct): Selected the TDD persona for behavior-focused coverage tests.

CHANGED FILES:

- [extractor.integration.test.ts](/Users/la/Programming/Tovu/apps/website/src/contracts/core/entry-refs/__tests__/integration/extractor.integration.test.ts)
- [identity/repo.contract.test.ts](/Users/la/Programming/Tovu/apps/website/src/features/identity/__tests__/repo.contract.test.ts)
- [delete-user-service.test.ts](/Users/la/Programming/Tovu/apps/website/src/features/identity/__tests__/delete-user-service.test.ts)
- [settings/repo.sqlite.test.ts](/Users/la/Programming/Tovu/apps/website/src/features/settings/__tests__/repo.sqlite.test.ts)
- [sources.unit.test.ts](/Users/la/Programming/Tovu/apps/website/src/features/site-backup/__tests__/sources.unit.test.ts)
- [sources.ts](/Users/la/Programming/Tovu/apps/website/src/features/site-backup/sources.ts)
- [PublishContentDialog.unit.test.tsx](/Users/la/Programming/Tovu/apps/admin/src/features/publish-content/__tests__/PublishContentDialog.unit.test.tsx)

PER FILE:

Tests added for these paths; execution remains with the verifier.

| Source | Coverage scenarios added |
|---|---|
| `entry-refs/extractor.ts` | Malformed nodes/configs, reference suffixes, gallery/media paths, duplicate media references, HTML reference budgets and maximum ID length. |
| `identity/repo.ts` | Populated and cleared login timestamps, session IP/user-agent fields, and optional-field decoding through existing adapter contracts. |
| `settings/repo.ts` | Version fallback/misses, workspace definitions, coercion decoding, scoped value reads/lists, missing-ID errors, cleared values, revision JSON and empty/nonempty revision heads. |
| `site-backup/sources.ts` | Missing paths, filesystem failures, disappearing files, invalid plugin paths, symlinks/non-files, byte formatting, truncated reads, handle cleanup and database-free manifests. Added optional filesystem ports with existing Node defaults. |
| `identity/delete-user-service.ts` | Constrained wildcards, role classifications, owner floor, action guards, missing user rows, absent Trash wiring and email display metadata. |
| `use-publish-content-confirm.hooks.ts` | Peer/destination failures and stale responses, missing connected site, criteria reports, refused/failed narrowing, pending-overwrite guards, unmount cancellation and default API wiring. |

UNREACHABLE:

- [extractor.ts:171](/Users/la/Programming/Tovu/apps/website/src/contracts/core/entry-refs/extractor.ts:171): `fieldsExt ?? {}` fallback is unreachable for the declared, validated input contract.
- [sources.ts:322](/Users/la/Programming/Tovu/apps/website/src/features/site-backup/sources.ts:322): comparator equality requires duplicate backup paths; native directory listings and the scope layout produce unique paths.
- [delete-user-service.ts:336](/Users/la/Programming/Tovu/apps/website/src/features/identity/delete-user-service.ts:336): the rejection arm follows `tail`, whose rejections are always caught.
- [use-publish-content-confirm.hooks.ts:433](/Users/la/Programming/Tovu/apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts:433): skipped-row reasons are already normalized to non-null strings.

These defenses remain unchanged for owner disposition.

NOT DONE:

- Tests, typechecks, builds and coverage were not run, as instructed. **100% coverage is not established.**
- The platform-specific missing-`O_NOFOLLOW` fallback remains unexercised.
- Whitespace validation passed. No git state was changed.
