TDD(Execution): Used the TDD persona for behavior-focused coverage tests. Extended 10 existing suites; production code is unchanged.

CHANGED FILES:

```text
/Users/la/Programming/Tovu/apps/website/src/features/media-import/__tests__/fetch-image.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/media-import/__tests__/import-local-file.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/media-import/__tests__/tool-registrations.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/navigation/__tests__/repoint-menu-refs.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/pages/__tests__/regions.move.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/pages/__tests__/regions.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/pages/__tests__/tool-registrations.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/permanent-delete/__tests__/tool-registrations.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/publish-trust/__tests__/keys.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/publish-trust/__tests__/revocations.test.ts
```

PER FILE — added cases target:

- `media-import/fetch-image.ts`: empty allowlist, malformed/HTTPS URLs with allowlists, distinct redirect origins, custom policy and Accept header.
- `media-import/tool-registrations.ts`: default filesystem-root resolution, injected logging, transport and metadata-storage failures, custom diagnostic tool ID.
- `navigation/repoint-menu-refs.ts`: empty children/collections, unmatched references, unchanged nested trees, parent-only changes with shared children.
- `pages/regions.ts`: malformed tags, unterminated declarations/open tags, empty untagged elements, moves without surrounding whitespace.
- `pages/tool-registrations.ts`: missing captured version, incomplete theme dependencies, missing content array, post IDs, trash race, theme refresh, read/write failures and conflicts.
- `permanent-delete/tool-registrations.ts`: whitespace-only IDs, supplied warning, abort during final authorization, contributor wiring.
- `publish-trust/keys.ts`: crypto-provider failure with valid key/signature material.
- `publish-trust/revocations.ts`: whitespace documents, invalid/oversized fields, inclusive field limits, omitted/null notes.

UNREACHABLE:

- [fetch-image.ts:137](/Users/la/Programming/Tovu/apps/website/src/features/media-import/fetch-image.ts:137): `value === twinOrigin` cannot succeed; both callers supply normalized `URL.href`, which includes `/`.
- [tool-registrations.ts:233](/Users/la/Programming/Tovu/apps/website/src/features/media-import/tool-registrations.ts:233): `createdBy ?? null` fallback cannot occur under valid contracts; upload always stamps the required principal ID.

Both remain unchanged for owner disposition.

NOT DONE:

Tests, typecheck, builds, package scripts and coverage were not run, as instructed. **100% coverage remains unverified.** Static diff whitespace checks passed. No commits or git-state mutations were made.
