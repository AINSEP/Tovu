# COMMIT-PLAN

Base: merge-6 (`776ce6d0f`); branch `codex/tv-y1`. Coordinator stages and commits. No Git writes performed.

No tests, builds, installs, type-checks, linters, or gates run, per dispatch. T1/T4/T5 pair with the parallel Jini release; integration verification remains with the coordinator.

## T1 — refactor(plugins): repoint Jini plugin ids

DONE. Eight plugin-id literals renamed; two Recharts extension keys renamed. Tovu-owned ids and files retained. Installed-plugin rows and saved embeds using the old ids still require the later data migration.

Files:

- `apps/admin/src/features/pages/__tests__/embed-placeholder.unit.test.ts`
- `apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts`
- `apps/website/src/server/runtime/composition/charts-recharts-source.ts`
- `apps/website/src/server/runtime/composition/__tests__/recharts-package-pin.unit.test.ts`
- `content/agent-plugin-overlays/calendly/GUIDANCE.md`
- `content/agent-plugin-overlays/google-login/GUIDANCE.md`

Existing files over 500 lines (not a stop under the owner override): `apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts` (2857 lines).

## T4 — refactor(forms): repoint success markup to Jini

DONE. Eleven success-class/attribute occurrences renamed. Both existing widget success hooks (lines 61 and 66 on the base) repointed. Other class/attribute names and CSS fallback variables retained.

Files:

- `apps/website/src/server/inbound/public-http/http/site/form-render.ts`
- `apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts`
- `content/themes/static/tovu-theme/css/theme.css`
- `content/themes/__original-themes__/static/tovu-theme/css/theme.css`

Existing files over 500 lines (not a stop under the owner override): `apps/website/src/server/inbound/public-http/http/site/form-render.ts` (781 lines); `content/themes/static/tovu-theme/css/theme.css` (1595 lines); `content/themes/__original-themes__/static/tovu-theme/css/theme.css` (1595 lines).

## T5 — refactor(plugins): repoint environment names and credential labels to Jini

DONE. Sixty environment-name occurrences renamed (Picker 4, Workspace OAuth 2, S3 42, Supabase access token 12). Thirty-two complete label occurrences renamed (Mail 23, Search 9), plus three Search-prefix occurrences (runtime constant, its existing assertion, and label documentation): 95 replacements total. One grep per environment-name family, scoped to apps/, content/, docs/, .env.example; no matches in docs/ or .env.example. No history records edited.

Files:

- `apps/website/src/features/agent-plugins/__tests__/unit/portable-host-guidance.unit.test.ts`
- `content/agent-plugin-overlays/google-workspace/GUIDANCE.md`
- `content/agent-plugin-overlays/google-workspace/__tests__/form-delivery.e2e.test.mjs`
- `apps/website/src/features/agent-plugins/admin-surfaces/public-config.ts`
- `apps/website/src/features/api-connections/__tests__/surface-adapters.security.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts`
- `content/agent-plugin-overlays/s3-compatible/__tests__/env-declaration.test.mjs`
- `content/agent-plugin-overlays/s3-compatible/__tests__/media-store.integration.test.mjs`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-supabase-package.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/import-access-token.unit.test.ts`
- `apps/website/src/server/runtime/boot/bootstrap.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/mail-provider-contribution.unit.test.ts`
- `apps/website/src/features/custom-credentials/__tests__/credential-works-for-form.unit.test.ts`
- `apps/website/src/features/custom-credentials/__tests__/resolve-by-label.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/fixtures/mail-send.golden.json`
- `apps/website/src/server/runtime/boot/__tests__/mail-credential-cards.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/resolve-mailer.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/cost-counters.baseline.test.ts`
- `content/agent-plugin-overlays/resend/GUIDANCE.md`
- `content/agent-plugin-overlays/resend/__tests__/bundled-mail.test.mjs`
- `content/agent-plugins/how-tovu-works/skills/build-agent-plugin/SKILL.md`
- `apps/website/src/server/runtime/composition/__tests__/plugin-credential-cards.unit.test.ts`
- `apps/website/src/server/runtime/composition/modules/__tests__/site-search.unit.test.ts`
- `apps/website/src/server/runtime/composition/modules/site-search.ts`
- `content/agent-plugin-overlays/meilisearch/GUIDANCE.md`

Existing files over 500 lines (not a stop under the owner override): `apps/website/src/features/agent-plugins/__tests__/unit/import-access-token.unit.test.ts` (539 lines); `apps/website/src/server/runtime/boot/__tests__/fixtures/mail-send.golden.json` (798 lines); `apps/website/src/server/runtime/boot/__tests__/resolve-mailer.unit.test.ts` (655 lines); `apps/website/src/server/runtime/composition/modules/__tests__/site-search.unit.test.ts` (547 lines).

## D3-T — test(deployments): remove dormant GitHub deployment vocabulary

DONE. Deleted one vocabulary row and exactly two assertions. The targeted github-deployment grep returned only these three base references; deployments/github.mjs matches were comments, with no production imports. The apps/website/src/features/deployments/types.ts deployment-status comment remains out of scope, as requested. Behaviour identical, test data only. No DC ledger row assigned.

Files:

- `apps/website/src/features/deployments/deploy-targets/__tests__/vendor-exceptions.json`
- `apps/website/src/features/deployments/deploy-targets/__tests__/no-vendor-in-core.boundary.test.ts`

## TV-03 — refactor(media): delete the unreferenced attachment-tools re-export shell

DONE. Deleted the three-line shell with rm after the targeted reference grep returned no matches. No repoints. Behaviour identical.

Files:

- `apps/website/src/features/media/attachment-tools.ts`

## TV-04 — refactor(post): delete the unreferenced author re-export shell

DONE. Deleted the one-line shell with rm after targeted path-reference greps returned no matches. No repoints. Behaviour identical.

Files:

- `apps/website/src/features/post/author.ts`

## E-T1 — test: give the five message-less asserts messages (check:test-safety vs merge-base)

DONE. Added exactly the five specified assertion messages; no other changes in these two files. Behaviour identical, test-only.

Files:

- `apps/website/src/assistant/__tests__/ask-choice-custom-answer.test.ts`
- `apps/website/src/features/plugin-runtime/__tests__/unit/plugins-tool-registrations.unit.test.ts`

## Diff re-read

Reviewed all changed hunks, including the golden fixture. No unrelated edits required deletion. Required deletions are the D3-T vocabulary row and two assertions, TV-03 shell, and TV-04 shell listed above. No new functions, types, dependencies, casts, comments, or abstractions.
