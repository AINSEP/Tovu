# Dispatched sheets

All six sheets use base `06cd7ae7e`. Tests, builds, installs, type-checks, linters, gate scripts, catalog generation, and API generation were not run. Test assertions were written and read before the corresponding production changes. No commits or staging were performed.

## I2-J — done

- Base: `06cd7ae7e`.
- Files touched: `packages/cms/src/media/ports.ts`, `packages/cms/src/media/repo.memory.ts`, `packages/cms/src/media/__tests__/repo.memory.test.ts`, `.changeset/jm7-i2-blob-list-filter.md`.
- Tests added first: `InMemoryAssetBlobRepo.list returns existing requested hashes only in the named workspace`; `InMemoryAssetBlobRepo.list returns no rows for an empty hash filter`. Test count in this file: 2 before, 4 after; no tests deleted. Red reason, established by reading only: the base ignores the second argument, so it includes the unrequested same-workspace hash and returns a seeded row for an empty filter. A same-hash row in another workspace witnesses the workspace boundary; a missing requested hash produces no row.
- Mutation owed to combine: ignore the hash filter, then ignore the workspace filter; the filtered-list test must reject either mutation. The empty-filter test must reject ignoring an empty filter.
- Changeset: patch `@jini-ai/cms`, exact dispatched text.
- API delta: `AssetBlobRepoPort.list` and `InMemoryAssetBlobRepo.list` gain an optional second argument `{ sha256s?: readonly string[] }`; implementation default is `{}`. Omitted filter retains all workspace rows; `sha256s: []` retains none. Existing one-argument callers are untouched. The targeted `AssetBlobRepoPort` lookup found no other production implementer.
- Cloud checks: CMS package tests, the named mutations, typecheck/guard, and `pnpm api:update` for both list signatures. No API baseline files edited here.
- Diff re-read deletions: none. No touched source/test file exceeds 500 lines.

## K-04b-J — done

- Base: `06cd7ae7e`.
- Files touched: `packages/cms/src/media/cover-image.ts` (only the named property), new `packages/cms/src/seo/cover-image.ts` (verbatim supplied leaf with the four local imports).
- Tests added/changed: none, per cull. Red reason: not applicable. The three host suites remain the pins through the host sheet; their mutations are owed to cloud. No new cast was added; the supplied `value as Record<string, unknown>` narrowing is copied unchanged.
- Changeset written here: none. Cloud owes `.changeset/cms-seo-cover-image.md`.
- API delta: `CoverImagePost.featuredMediaId` widens from `string | null` to `string | null | undefined`; new leaf has four exports: `resolveSeoCoverImage`, `withCoverSeoDefaults`, `withCoverReadDeps`, `withContentImageSource`.
- Cloud owes manifest entry `./seo/cover-image` (node) targeting `./dist/seo/cover-image.{d.ts,js}`, API row via `pnpm api:update`, and the changeset above. Cloud runs the host suites and their mutations plus typecheck/guard. No package manifest, universal SEO entry, or API baseline edited here.
- Diff re-read deletions: none. No touched source/test file exceeds 500 lines.

## C7-CX1 — done

- Base: `06cd7ae7e`.
- File touched: `packages/agent-plugins/src/lifecycle/automatic-use.ts` only.
- The `prepare` anchor matched at base line 222. Its notes comment, `off`, `catalog`, and return moved verbatim into the named file-private `withPluginNotes`, directly after `prepare`. Delivery is remembered and usage published before the helper runs.
- Tests added/changed: none, per sheet; existing `automatic-use.unit.test.ts` covers both paths. Red reason and mutation owed: not applicable to this verbatim move.
- Changeset: none. API delta: none.
- Cloud re-runs `COMPLEXITY_BASE_REF=d3e78b387 node scripts/check-complexity.mjs`; expect the `prepare` line gone. Existing automatic-use tests remain the behavior check.
- Diff re-read deletions: none. Touched file is 353 lines.

## C7-CX2 — done

- Base: `06cd7ae7e`.
- File touched: `packages/integrations/src/api-connections/hosted-mcp/sign-in-configuration.ts` only.
- Quoted anchor matched at base lines 78–82. Both `toStoredEndpoints` and `readStoredEndpoints` declare `StoredOAuthEndpoints`. The expression moved verbatim into the named file-private `selfConfiguredEndpoints`, placed before `selfConfiguredGrant`; its two-line explanation moved into the requested doc comment.
- Tests added/changed: none, per sheet. Red reason and mutation owed: not applicable to this verbatim move.
- Changeset: none. API delta: none.
- Cloud re-runs `COMPLEXITY_BASE_REF=d3e78b387 node scripts/check-complexity.mjs`; expect the `selfConfigureConnection` line gone.
- Diff re-read deletions: none. Touched file is 158 lines.

## C7-ERR — done (A, B, C)

- Base: `06cd7ae7e`.
- Files touched: `scripts/error-gate-debt.json`, `packages/integrations/src/webhooks/tools/tool-handlers.ts`, `packages/integrations/src/webhooks/tools/__tests__/tool-registrations.test.ts`, `packages/cms/src/media/chat-preview.ts`, `.changeset/jm7-c7-err.md`.
- Read the three required rule introductions before editing. All quoted anchors matched.
- A: moved two `catch-reads-error` counts from `process.ts` (5 → 3) to the preceding `process-probes.ts` row (2); renamed the `indexer.ts` debt key to `indexer-write.ts` (1). Total debt unchanged; no other row edited; existing JSON formatting retained.
- B: changed test first: `delete: a write conflict after the confirmed snapshot check asks for a new confirmation` now asserts `error.cause instanceof RecordVersionConflictError`, with the named import. Red reason, established by reading only: the base constructs the replacement error without options, leaving `cause` undefined. Production now passes `{ cause: error }` through the existing constructor; message unchanged. Mutation owed to cloud: drop `{ cause: error }`.
- C: used `orFallback<EncodedImage | null>` with the local narrowed codec, null fallback, and fixed step. Both content blocks and existing comments are unchanged; no new cast. Existing test `preview skips unsanitized SVG and non-images, and preserves successful writes on codec failure` pins fallback behavior through its `an encode failure keeps the original successful result` assertion. No new chat-preview test.
- Changeset: patch `@jini-ai/integrations` and `@jini-ai/cms`, exact dispatched text. API delta: none.
- Cloud runs integrations/CMS package tests, the cause mutation, and `node scripts/check-error-gate.mjs`; expect New 29 → 25 (the four combine-7 lines gone) and no Worse line; do NOT run `--update` (base still has 25 New).
- Diff re-read deletions: none beyond the prescribed replacement of the anonymous encode catch. No touched source/test file exceeds 500 lines.

## C7-WHY — STOPPED

- Base: `06cd7ae7e`.
- Files touched by this agent: none; `scripts/why-comments-debt.json` was not edited by this agent. Rows added by this agent: 0. The final status shows a working-tree append of these 116 rows relative to base; it appeared during the session and was preserved. The original rows are unchanged, and the appended objects exactly equal the coordinator input in its order.
- STOP: all 116 coordinator row IDs already exist in the debt file, beginning with `708256d8a732` at `scripts/why-comments-debt.json:949`. All 116 existing objects match the supplied objects exactly. Each supplied ID occurs exactly once in `cloud-results/combine-7-jini-why-base.txt`. No duplicate rows appended; the coordinator row file was not copied into the repo.
- Tests added/changed, red reason, mutation, changeset, API delta: none / not applicable.
- Cloud runs `node scripts/check-why-comments.mjs --base d3e78b387`; requested expectation: 116 lost, 116 allow-listed, exit 0. This execution is still owed; no gate was run here.
- Recorded in `REFRESH.md`. Diff re-read deletions: none.
