# `redirects`

Tovu wiring for SPEC-009 (ADR-033 and ADR-PIPE-009). The redirect domain lives in
Jini `packages/cms/src/redirects/`, consumed through `@jini-ai/cms/redirects`
and its `/sql` entry. Jini owns matching, interpolation, ordering, the write
chokepoint, required open-redirect checks, hit aggregation, capture, memory
storage, SQL query bodies and row codecs. Tovu imports these owners directly.

## Retained product wiring

- `phase-handler.ts`: registers Jini resolution in Tovu's routing phases, with
  owner-scoped replacement/disposal and `onError: "skip"`. Composition injects
  the repo, matcher, existing Phase 19 verified-origin oracle and host policy;
  optional hit recording remains independent of serving. Jini's
  `target-gate.ts` checks every fully interpolated Location (INV-03).
- `repo.sqlite.ts`: binds the site's `ContentKernel`/`ContentDb` to Jini's SQL
  factory. Tovu owns the unchanged `redirects`, `redirect_revisions` and
  `redirect_hits` names. There are no schema or migration changes.
- `publish-content.ts`: Tovu publishing contribution and natural-key policy.
- `tool-registrations.ts` and `agent-tools.ts`: Tovu tool/permission integration.
- `index.ts`: product connection and phase-binding exports only.
- `__tests__/`: the eight retained product suites and the shared Trash test
  double. The 14 generic suites live in Jini.

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
