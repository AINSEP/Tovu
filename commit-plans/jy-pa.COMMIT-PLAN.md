# jy-pa commit plan

Base: merge-6 (`d3e78b387`); intended branch: `codex/jy-pa`. Worktree edits only; no staging, commits, pushes, package metadata changes, changesets, or baseline/catalog regeneration.

The CULL overrides the designs. No review mutations for the prose sheets. No BREAKS or public signature changes. Test literals neutralized, pads removed, classes renamed, and functions converted: 0 for every sheet. No named anchors were stopped.

Static diff review only: all 77 production TypeScript files have identical text after removing full-line comments; comment delimiters and executable lines are unchanged. All prose edits are confined to audited anchors and their immediate wrapped continuation. The test file matches the exact CULL replacement. No tests, builds, installs, typechecks, linters, audits, or mutations were run. Runtime verification and owner-rules-audit belong to combine/cloud.

## J01 — done

CMS comments: anonymous ingress policy and check order, atomic moderation writes, and permission checks before write-service calls retained.

Counts: 74 audited anchors edited, 3 immediate wrapped lines edited, 0 anchors stopped; 14 files. Behaviour identical; comments/documentation only.

Files:

- `packages/cms/src/comments/agent-tools.ts`
- `packages/cms/src/comments/errors.ts`
- `packages/cms/src/comments/express/submit-handler.ts`
- `packages/cms/src/comments/hooks.ts`
- `packages/cms/src/comments/ingress.ts`
- `packages/cms/src/comments/module.ts`
- `packages/cms/src/comments/ports.ts`
- `packages/cms/src/comments/repo.memory.ts`
- `packages/cms/src/comments/sanitize.ts`
- `packages/cms/src/comments/spam.heuristic.ts`
- `packages/cms/src/comments/sql/repo.ts`
- `packages/cms/src/comments/tool-registrations.ts`
- `packages/cms/src/comments/types.ts`
- `packages/cms/src/comments/write-service.ts`

BREAKS: none. Changesets: none. Public signatures: unchanged.

Diff re-read deletions: Removed dangling header-citation asides and the inferred “origin-isolated” host qualifier in module.ts; discarded generic draft wording to retain Phase 3 and round-2 context. No executable content deleted.

## J02 — done

CMS forms and command gateway: sole submission owner and one permission evaluator retained. Both forms docs name the host’s existing committed-event visitor integration and preserve event/counting rules.

Counts: 19 audited anchors edited, 2 immediate wrapped lines edited, 0 anchors stopped; 14 files. Behaviour identical; comments/documentation only.

Files:

- `packages/cms/src/forms/agent-tools.ts`
- `packages/cms/src/forms/duplicate-form.ts`
- `packages/cms/src/forms/express/handler.ts`
- `packages/cms/src/forms/html-render.ts`
- `packages/cms/src/forms/notify-subscriber.ts`
- `packages/cms/src/forms/repo.memory.ts`
- `packages/cms/src/forms/submit-service.ts`
- `packages/cms/src/forms/tool-registrations.ts`
- `packages/cms/src/forms/write-service.ts`
- `packages/cms/src/core/commands/appliers.ts`
- `packages/cms/src/core/commands/index.ts`
- `packages/cms/src/core/commands/revert.ts`
- `packages/cms/docs/forms/decisions/DR-004-basic-live-submission-timing.md`
- `packages/cms/docs/forms/spec/behavior.spec.md`

BREAKS: none. Changesets: none. Public signatures: unchanged.

Diff re-read deletions: None beyond the sheet’s required citation/product-prose removal.

## J03 — done

CMS redirects/routing: port boundaries, transaction placement, phase order, and deferred origin/taxonomy notes retained. Original-host single-instance wiring described; README heading changed to `## Original routing rationale`.

Counts: 109 audited anchors edited, 4 immediate wrapped lines edited, 0 anchors stopped; 12 files. Behaviour identical; comments/documentation only.

Files:

- `packages/cms/src/redirects/capture.ts`
- `packages/cms/src/redirects/hit-sink.ts`
- `packages/cms/src/redirects/matcher.ts`
- `packages/cms/src/redirects/ports.ts`
- `packages/cms/src/redirects/redirects.ts`
- `packages/cms/src/redirects/repo.memory.ts`
- `packages/cms/src/redirects/resolver.ts`
- `packages/cms/src/redirects/types.ts`
- `packages/cms/src/routing/README.md`
- `packages/cms/src/routing/ports.ts`
- `packages/cms/src/routing/routing.ts`
- `packages/cms/src/routing/types.ts`

Existing files above 500 lines (continue under owner rule; no file newly crosses 500):

- `packages/cms/src/redirects/redirects.ts`: 845 → 845 lines.
- `packages/cms/src/routing/routing.ts`: 670 → 670 lines.

BREAKS: none. Changesets: none. Public signatures: unchanged.

Diff re-read deletions: Discarded unnecessary draft descriptions at redirects/capture.ts:5 and hit-sink.ts:3 and the expanded matching description at matcher.ts:3; no executable content deleted.

## J04 — done

CMS presentation/SEO/taxonomy: HEAD contributor ownership, static-render context, and authorization rationale retained.

Counts: 36 audited anchors edited, 2 immediate wrapped lines edited, 0 anchors stopped; 13 files. Behaviour identical; comments/documentation only.

Files:

- `packages/cms/src/presentation/html.ts`
- `packages/cms/src/presentation/page-head.ts`
- `packages/cms/src/seo/absolute-url.ts`
- `packages/cms/src/seo/agent-tools.ts`
- `packages/cms/src/seo/errors.ts`
- `packages/cms/src/seo/media.ts`
- `packages/cms/src/seo/ports.ts`
- `packages/cms/src/seo/seo.ts`
- `packages/cms/src/seo/sitemap.ts`
- `packages/cms/src/seo/tool-registrations.ts`
- `packages/cms/src/seo/types.ts`
- `packages/cms/src/taxonomy/gated-hooks.ts`
- `packages/cms/src/taxonomy/tool-handlers.ts`

BREAKS: none. Changesets: none. Public signatures: unchanged.

Diff re-read deletions: Discarded the unnecessary draft “static-render” qualifier at presentation/html.ts:166; no executable content deleted.

## J06 — done

DB data modules/events/settings/verified origin: snapshot lock scope, durability, and transaction participation retained.

Counts: 42 audited anchors edited, 2 immediate wrapped lines edited, 0 anchors stopped; 14 files. Behaviour identical; comments/documentation only.

Files:

- `packages/db/src/data-modules/data-module.ts`
- `packages/db/src/data-modules/disk-headroom.ts`
- `packages/db/src/data-modules/index.ts`
- `packages/db/src/data-modules/migration-journal.ts`
- `packages/db/src/data-modules/migration-recovery.ts`
- `packages/db/src/data-modules/plugin-identity.ts`
- `packages/db/src/data-modules/plugin-store.ts`
- `packages/db/src/data-modules/restore.ts`
- `packages/db/src/data-modules/snapshot.ts`
- `packages/db/src/events/change-set-repo.sql.ts`
- `packages/db/src/events/outbox-repo.sql.ts`
- `packages/db/src/settings/repo.sql.ts`
- `packages/db/src/verified-origin/register.ts`
- `packages/db/src/verified-origin/repo.sql.ts`

Existing files above 500 lines (continue under owner rule; no file newly crosses 500):

- `packages/db/src/data-modules/data-module.ts`: 1063 → 1063 lines.

BREAKS: none. Changesets: none. Public signatures: unchanged.

Diff re-read deletions: Discarded generic replacement wording to retain the existing Phase 1 context, and removed an unnecessary “open finding” qualifier at events/change-set-repo.sql.ts:75; no executable content deleted.

## J07 — done

DB recovery/gated mutations: shared operation lock, check order, fresh capability reads, bounded disclosure, and human acknowledgment retained.

Counts: 79 audited anchors edited, 1 immediate wrapped lines edited, 0 anchors stopped; 13 files. Behaviour identical; comments/documentation only.

Files:

- `packages/db/src/gated-mutations/repo.sql.ts`
- `packages/db/src/recovery/deep-link.ts`
- `packages/db/src/recovery/degraded-banners.ts`
- `packages/db/src/recovery/disclosure.ts`
- `packages/db/src/recovery/evaluate-boot-migration-policy.ts`
- `packages/db/src/recovery/lookup-adapters.ts`
- `packages/db/src/recovery/migrate-forward-execute.ts`
- `packages/db/src/recovery/migrate-forward-hooks.ts`
- `packages/db/src/recovery/operation-lock.ts`
- `packages/db/src/recovery/reconcile-interrupted-migration.ts`
- `packages/db/src/recovery/recovery-orchestrator.ts`
- `packages/db/src/recovery/restore-hooks.ts`
- `packages/db/src/recovery/restore-point-create.ts`

BREAKS: none. Changesets: none. Public signatures: unchanged.

Diff re-read deletions: Discarded the draft forward-migration description at migrate-forward-execute.ts:5 and the redundant disclosure.ts:15 gateway comparison; no executable content deleted.

## E-J1 — done

test(cms): make the pending-copy form case order-free (combine-6 full-suite flake)

Behaviour identical, test-only. One existing case changed; test declarations remain 25 → 25. Three order-free assertions replace two array-position assertions; the enqueue mock, calls counter, imports, fixtures, and final one-row assertion are unchanged.

Cloud-only mutation, not applied or run: `packages/cms/src/forms/submission-attempts.ts:178`, `settle(false)` → `settle(true)`; the final one-row assertion must fail.

Files:

- `packages/cms/src/forms/__tests__/submit-service.host-options.test.ts`

Existing files above 500 lines (continue under owner rule; no file newly crosses 500):

- `packages/cms/src/forms/__tests__/submit-service.host-options.test.ts`: 505 → 507 lines.

BREAKS: none. Changesets: none. Public signatures: unchanged.

Diff re-read deletions: Only the two array-position-dependent assertions and their destructuring were replaced, exactly as the CULL requires; no test cases deleted.
