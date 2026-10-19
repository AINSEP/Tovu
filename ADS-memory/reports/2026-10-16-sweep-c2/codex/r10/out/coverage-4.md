TDD(Direct): Loaded the TDD persona to add behavior-focused coverage tests.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/website/src/features/publish-trust/__tests__/grant.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/publish-trust/__tests__/provisioning.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/publish-trust/__tests__/handshake-client-keyless.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.display.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/entries/__tests__/unit/public-list.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/identity/__tests__/api-key-service.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/settings/__tests__/site-title.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts

**PER FILE:**

- `grant.ts`: Added backstop classification and exclusion, invalid generations and expiries, capability deduplication, and invalid-date activity checks.
- `trash-aware-memory-repo.ts`: Added mixed-value and nullish sorting, pagination, restore, live-row limits, missing lookups, and scoped purge cases.
- `use-page-editor.hooks.ts`: Added cases targeting all listed line gaps: load failures, delete failures, failed conflict/external reloads, back-link handling, Escape, and template-modal actions. Also added cancellation, stale failures, recovery variants, and source-integrity refusals.
- `public-list.ts`: Added malformed configs and fields, non-finite clamps, sort fallbacks, empty sort-field rejection, scalar filters, layout membership, and label edge cases.
- `provisioning.ts`: Added document limits, serialization, precedence, status wording, expiry boundaries/defaults, event callbacks, no-op edits, and refusal paths.
- `api-key-service.ts`: Added input validation, authorization gates, invalid/granted targets, wildcard restrictions, empty snapshots, optional expiry, exact-permission delegation, and legacy revocation.
- `handshake-client.ts`: Added malformed responses, transport fallback, unrelated 503 bodies, origin/session defaults, backstop signatures, and capability filtering.
- `site-title.ts`: Added normalization boundaries, marker defaults/idempotency, and trimmed display-name fallbacks.

**UNREACHABLE:**

- `/Users/la/Programming/Tovu/apps/website/src/features/entries/trash-aware-memory-repo.ts:200`: Equal-id sorting fallback. The inner repository’s id-keyed map prevents two stored rows from sharing an id. Left unchanged for owner disposition.

**NOT DONE:**

Tests, typecheck, builds, coverage, package scripts, and git mutations were not run. Achieved coverage remains unverified; the verifying agent must confirm 100% and report residual gaps. Existing suites and fakes were extended; production source and Jini were unchanged.
