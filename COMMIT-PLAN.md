# Y5M content — Tovu handoff

Scope: C1, C2, C3 only; working-tree changes only. No Git mutations.
The supplied sheets govern; no redesign, new host TypeScript files, dependency
updates, installs, tests, builds, typechecks or linters.

## Tests first and named mutations

The Jini tests were prepared upstream and inspected on
`origin/codex/y5m-contentj` before host production edits. Existing host tests
are retained, with imports/call signatures updated before production bindings.
No test or mutation execution is claimed.

- C1: `packages/desktop-host/src/electron/__tests__/memory-sampler.test.ts`
  and `desktop-resources.test.ts`; mutation `drop-missing-native-pid`
  removes missing-native-result PIDs, breaking partial-read/mixed-RSS assertions.
- C2: `packages/cms/src/media/site-import/__tests__/bindings.test.ts`;
  mutation `drop-injected-video-options` supplies undefined for configured video,
  breaking forwarding and host conversion-link assertions. Retain
  `apps/website/src/features/media-import/__tests__/import-video-conversion-wiring.test.ts`.
- C3: `packages/cms/src/posts/sql/__tests__/y5-post-repo.test.ts`;
  mutation `search-on-detached-kernel` separates search from row-write kernel,
  breaking same-transaction/rollback assertions.

## Ordered logical commits (coordinator commits)

### 1. C1 — completed: desktop sampler handoff

- `apps/desktop/src/contracts/README.md`
- `apps/desktop/src/desktop-memory-sampler.ts`
- `apps/desktop/src/desktop-resources.test.ts`
- `apps/desktop/src/desktop-resources.ts`

### 2. C2 — completed: media-import binding

- `apps/website/src/assistant/__tests__/tool-registrations.media-import-egress-refusal.integration.test.ts`
- `apps/website/src/assistant/tool-registrations.ts`
- `apps/website/src/features/asset-transfer/asset-sources.ts`
- `apps/website/src/features/media-generation/__tests__/tool-registrations.test.ts`
- `apps/website/src/features/media-import/__tests__/import-local-file.test.ts`
- `apps/website/src/features/media-import/__tests__/import-video-conversion-wiring.test.ts`
- `apps/website/src/features/media-import/__tests__/replace-file.test.ts`
- `apps/website/src/features/media-import/__tests__/tool-registrations.test.ts`
- `apps/website/src/features/media-import/tool-registrations.ts`
- `apps/website/src/features/media/__tests__/media-producing-previews.test.ts`
- `apps/website/src/features/theme/import-theme-file-tool.ts`
- `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`
- `plans/count-1125/y5-content-keeps.md`

### 3. C3 — completed: post repository binding

- `apps/website/src/features/email-templates/__tests__/operations.sql.test.ts`
- `apps/website/src/features/pages/__tests__/external-embed-authoring.integration.test.ts`
- `apps/website/src/features/pages/__tests__/html-document-store.go-live.test.ts`
- `apps/website/src/features/pages/__tests__/html-document-store.noop-save.test.ts`
- `apps/website/src/features/pages/__tests__/html-document-store.revisions.test.ts`
- `apps/website/src/features/pages/__tests__/html-document-store.sqlite.test.ts`
- `apps/website/src/features/pages/__tests__/media-token-authoring.integration.test.ts`
- `apps/website/src/features/pages/__tests__/metadata-edit-preserves-html.test.ts`
- `apps/website/src/features/post/__tests__/go-live.agent-hold.repo.test.ts`
- `apps/website/src/features/post/__tests__/go-live.repo.test.ts`
- `apps/website/src/features/post/__tests__/pglite-repo.fixture.ts`
- `apps/website/src/features/post/__tests__/post.noop-save.test.ts`
- `apps/website/src/features/post/__tests__/post.schedule-featured.test.ts`
- `apps/website/src/features/post/__tests__/repo.author.test.ts`
- `apps/website/src/features/post/__tests__/repo.dialects.test.ts`
- `apps/website/src/features/post/__tests__/repo.postgres.test.ts`
- `apps/website/src/features/post/__tests__/revision-refs.test.ts`
- `apps/website/src/features/post/__tests__/revision-thinning.postgres.test.ts`
- `apps/website/src/features/post/__tests__/revision-thinning.test.ts`
- `apps/website/src/features/post/__tests__/search-index.pb1.test.ts`
- `apps/website/src/features/post/__tests__/search-index.postgres.test.ts`
- `apps/website/src/features/post/__tests__/search-index.reindex.test.ts`
- `apps/website/src/features/post/__tests__/search.dialects.test.ts`
- `apps/website/src/features/post/__tests__/search.pglite-socket.integration.test.ts`
- `apps/website/src/features/site-search/__tests__/cms-search.test.ts`
- `apps/website/src/features/trash/__tests__/email-template-trash-flow.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/assistant-off-artifacts.test.ts`
- `apps/website/src/server/runtime/composition/modules/__tests__/revision-thinning-composition.unit.test.ts`
- `apps/website/src/features/navigation/__tests__/footer-page-links.test.ts`
- `apps/website/src/features/post/repo.ts`
- `plans/count-1125/y5-content-keeps.md`

## Left

- LEFT-DESKTOP: `apps/desktop/package.json` and root `package-lock.json`
  dependency/resolution handoff explicitly dropped by coordinator FIX.
- P1–P3 excluded by scope.

## Final diff review

- All three target anchors matched; no sheet stopped. Final target states:
  desktop sampler deleted; media-import and post repositories are pure bindings.
- Both new anchored keep rules are in the existing single text fence; prior
  keep rules remain. The deleted sampler has no keep rule.
- Removed only the named duplicate sampler and host implementations superseded
  by the named Jini bindings, their obsolete imports/types/risk export, and the
  navigation fixture's unused search imports. No unrelated additions required
  deletion during final review.
- No new Tovu tests or fixtures. Existing test assertions retained; host test
  imports/calls were edited before each corresponding production handoff.
- Source review covered every changed diff and the named unchanged consumers.
  Scoped residual searches found no old sampler imports, host deps-type imports,
  positional post factory calls or old class imports in the named areas.
- `git diff --check` completed without output. No tests, mutation runs, builds,
  installs, typechecks or linters ran, as directed. Runtime behavior and actual
  package-resolution/type compatibility remain for the coordinator/Opus run.
- Architecture review: PASS for source scope — Jini owns execution; host files
  inject the listed data/ports with no casts, SQL, new helpers, or forwarders.
  The existing video linker wrapper, schema eraser and SQLite subclass remain
  unchanged. Theme edits are solely the sheet's deps-type import relocation.
- Bootstrap architecture chapter files are absent from this clone. The supplied
  complete design governed; no architecture changes were invented.
- Totals: 3 sheets built, 0 stopped; 1 target deleted, 2 G3 bindings; 47 tracked
  paths changed (including deletion), plus this new uncommitted plan. No new
  host TypeScript files; no dependency or lockfile edits; no Git mutations.
