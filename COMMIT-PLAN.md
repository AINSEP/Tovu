# M26SI-A — Tovu host wiring

Working tree only; coordinator commits. No installs, builds, tests, typechecks, linters, or guards.
Approved sheets and existing bindings govern the implementation; no new host logic or abstractions.
Regression tests are written before production wiring. RED/GREEN and mutations are not executed here.

## Ordered commit units

1. Sheet 1 — skipped: five manifest classifications are Jini-owned and already implemented on origin/codex/m26si-aj. No Tovu files.
2. Sheet 2 — skipped: generic CMS selector is Jini-owned and already implemented. Existing apps/admin/src/features/pages/PageEditor.tsx supplies pageEditorSurface unchanged.
3. Sheet 3 — implemented, unverified: supplied mediaFileName and parseMediaHtmlAttributes from @jini-ai/admin/media.
   - apps/admin/src/features/media/__tests__/media-card-metadata.unit.test.tsx
   - apps/admin/src/features/media/__tests__/use-edit-media-panel.hooks.unit.test.tsx
   - apps/admin/src/media-panel.ts
   - apps/admin/src/features/media/hooks/use-edit-media-panel.hooks.ts
   - Mutation: remove MEDIA_PROPS.deps.mediaFileName; host identity assertion fails and the existing card filename render fails.
   - Mutation: remove parseMediaHtmlAttributes from bindEditMediaPanel deps; the new bound-hook invalid-attribute case fails.
4. Sheet 4 — implemented, unverified: supplied all seven original sorting values to bindPosts and both existing binder fixtures.
   - apps/admin/src/features/posts/__tests__/Posts.unit.test.tsx
   - apps/admin/src/features/posts/__tests__/posts-agent-drive.unit.test.tsx
   - apps/admin/src/features/posts/Posts.tsx
   - Mutation: remove sorting or replace any of its seven members; the host binding identity case fails. Existing sort cases retain Updated descending and labels.
5. Sheet 5 — implemented, unverified: supplied the original browser panel and translator factory.
   - apps/admin/src/features/settings/__tests__/SettingsUi.bound-tabs-and-legacy-links.unit.test.tsx
   - apps/admin/src/features/settings/SettingsUi.tsx
   - Mutation: omit kit.BrowserAgentSettingsPanel or deps.createAdminByokKeyPanelTranslator; the corresponding host identity assertion fails.
6. Sheet 8 — implemented, unverified: supplied the original SecretInput and asciiSlug.
   - apps/admin/src/features/security/__tests__/AccessTokensTab.unit.test.tsx
   - apps/admin/src/features/security/AccessTokensTab.tsx
   - Mutation: omit kit.SecretInput or deps.asciiSlug; the corresponding host binding identity assertion fails. Existing credential flow cases cover secret fields and custom dialogs.
   - Neutral ordering comment is Jini-owned and already implemented.
7. Sheet 12 — implemented, unverified: supplied both original passkey helpers at server composition.
   - apps/website/src/server/inbound/admin-http/__tests__/owner-passkey-routes.unit.test.ts
   - apps/website/src/server/inbound/admin-http/owner-passkey-routes.ts
   - Mutation: omit resolveOwnerPasskeyRouteDeps or answerOwnerPasskeyFailure; the new exact origin/admission refusal regression fails.
   - Jini's y5 binder fixture is already updated by the Jini half.
   - Repointed the existing Tovu test's ownerPasskeySite import to passkey-route-deps: passkey-routes does not export it on the supplied Jini branch.

## Excluded

- Sheets 6, 7, 9, 10: excluded by BUILD ONLY directive.
- Sheet 11: coordinator-owned build output; build prohibited here.
- Jini report notes an existing test import mismatch (ownerPasskeyActionRoute imported from passkey-route-deps); no Tovu implementation of that mismatch.

## Review

- Re-read the full production and test diff against the selected sheets. Six production binding files and seven existing test files changed; COMMIT-PLAN.md is the only created file.
- Six regression cases added before production wiring; existing Posts and media-hook fixtures now supply the new required fields. All other Media fixtures spread MEDIA_PROPS; Settings fixtures reuse the host kit/deps; Access Tokens tests reuse the bound host component.
- Static architecture review: original implementations imported from existing public subpaths; every new field is supplied at the existing binding/mount; no host logic, helpers, interfaces, theme changes, re-export shells, guard changes, or new exports.
- Function-quality review: no new or materially changed production logic-bearing functions; changes are static composition fields only. Existing comments and statement/effect order retained.
- Fresh evidence: git diff --stat, full git diff of the 13 tracked files, and git status --short. These establish scope only, not runtime correctness. No tests or mutations executed by dispatch instruction; Opus must verify against the integrated Jini branch.
- Deletions of out-of-scope additions: none.
