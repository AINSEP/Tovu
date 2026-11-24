# `redirects`

Tovu wiring for SPEC-009 (ADR-033 and ADR-PIPE-009). The redirect domain lives in
Jini `packages/cms/src/redirects/`, consumed through `@jini-ai/cms/redirects`
and its `/sql` entry. Jini owns matching, interpolation, ordering, the write
chokepoint, required open-redirect checks, hit aggregation, capture, memory
storage, SQL query bodies and row codecs. Tovu imports these owners directly.

## Retained product wiring

- Routing-phase registration moved to `@jini-ai/cms/redirects/site/phase-handler`
  (owner-scoped replacement/disposal, `onError: "skip"`). Composition injects
  the repo, matcher, existing Phase 19 verified-origin oracle, host policy and
  the bound `registerResolvePhase` from `#src/platform/routing/adapter`;
  optional hit recording remains independent of serving. Jini's
  `target-gate.ts` checks every fully interpolated Location (INV-03).
- `repo.sqlite.ts`: binds the site's `ContentKernel`/`ContentDb` to Jini's SQL
  factory. Tovu owns the unchanged `redirects`, `redirect_revisions` and
  `redirect_hits` names. There are no schema or migration changes.
- The publishing contribution and natural-key policy moved to
  `@jini-ai/cms/redirects/site/publish-content`. Tovu binds it in
  `server/runtime/composition/publish-content-manifest.ts`, injecting
  `createRepoPublishHandler` (`features/publish-content/repo-handler.ts`) and
  `redirectsTable: REDIRECT_TABLES.redirects`.
- The agent-tool binding moved to `@jini-ai/cms/redirects/site/tool-registrations`.
  Tovu binds it in `server/runtime/composition/tool-catalog-manifest.ts`,
  injecting its tool metadata (`contracts/core/tool-metadata/redirects.ts`) and
  read vocabulary (`contracts/core/tool-metadata/content-read.ts`). The route
  deps type is Jini's `RedirectsPackageToolDeps` from `@jini-ai/cms/redirects`.
- The `index.ts` barrel was removed: it only forwarded `repo.sqlite.ts`, so
  composition imports `#src/features/redirects/repo.sqlite` directly.
- `__tests__/`: the retained product suites and the shared Trash test double.
  They run the Jini site modules with Tovu's real metadata and publish factory.
  The 14 generic suites, and the site modules' own unit tests, live in Jini.
  Package boundary rules: Jini `docs/decisions/DR-005-portable-package-boundaries.md`.

The reserved segment policy still has one owner:
`platform/routing/reserved-paths.ts` exports the existing admin/api set. Jini
receives that set explicitly, with no allow-all oracle or default host policy.

## Known scope boundary

`src/features/post/post.ts`'s `updatePost` does not call the
`SlugChangeCapture` slot — wiring that is an explicitly out-of-scope follow-up
feature owed to the content-lib owner (see ADR-PIPE-009 Migration Safety).
REQ-15/16/17 (auto-capture correctness) are certified against a direct
`onSlugChange()` call inside a manufactured transaction, not a real
rename-through-the-admin-UI.

## Dependencies

Jini redirects domain and SQL entries, CMS core ports, Tovu routing registry
and capture slot, verified-origin oracle, identity authorization, Trash and
publish-content product contracts. Dependency ports flow into Jini; Jini never
imports Tovu. Domain-only package peers remain optional.
