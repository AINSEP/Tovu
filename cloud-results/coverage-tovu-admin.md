# Coverage run — apps/admin (branch `test/coverage-tovu-admin`)

Status: **PARTIAL.** Run started from `origin/integ/wave-b` (Tovu) paired with `origin/integ/wave-b` (Jini).
The owner goal (113 files below 99% -> 100%) was NOT reached; 20 files were taken to 100% (one file, `use-skill-files.hooks.ts`, to all but one guard line).
A continuation run should start from this branch.

## Baseline was red, for two setup reasons (not mine)

1. **Jini build is red on `integ/wave-b`.** `pnpm --no-bail -r build` fails type-checking (`tsc`) in
   desktop-host, capability-providers, http-kit, cms, plugins, ui, chat, provider-plugins, admin, daemon
   (e.g. `exactOptionalPropertyTypes` errors in `desktop-host/src/logging.ts`, test files in `http-kit`
   importing symbols that are no longer exported). Because those scripts chain `tsc && cp ...`, the
   post-tsc copy steps (CSS for `@jini-ai/chat`/`ui`) never ran and **every admin suite importing
   `AssistantDock` failed with "Failed to resolve import @jini-ai/chat/react/styles/chat-settings.css"**.
   Workaround used (no repo change): re-ran each failing package's build script with `tsc ... ;`
   instead of `&&`. `tsc` still emits, so dist is usable.
2. **Tovu admin tests are mid-migration to the injected kits.** `render-with-jini-kits.tsx` is used by zero
   test files; `fetch-query-render.tsx` did not mount `KitProvider`/`UiKitProvider`/`AdminKitProvider`, so
   ~160 files failed with "@jini-ai/admin screens need <AdminKitProvider>". Fixed by mounting the same
   provider tree as `main.tsx` in `fetch-query-render.tsx` (commit `test(admin): mount the injected jini
   kits...`) and re-pointing 66 test files from `@testing-library/react` to that helper.

Baseline numbers (admin, `vitest run --coverage`):

| run | failed files | failed tests | lines | funcs | stmts | branches |
|---|---|---|---|---|---|---|
| untouched wave-b + Jini build (before any fix) | 163 / 892 | 1339 | 94.07% | 90.2% | 93.42% | 91.86% |
| after kit-mounting helper + import re-point | 41 / 894 | 196 | (see below) | | | |

**Still red after my fixes (41 files, 196 tests):** mostly App-level suites (`app-*.unit.test.tsx`,
`app-chat-dock-seam`, `AssistantDock.chat-settings`, `*-swap` integration suites, voice-input, RecoveryCodesCard,
`posts-i18n`...). They still lack a kit provider because they render `<App/>` or mount their own tree. Fixing
them is the first job of the continuation, since coverage for App/panels/AssistantDock is understated until then.
Coverage percentages for files touched by those suites are NOT trustworthy.

## Files brought to 100% (statements/branches/functions/lines, verified with targeted `--coverage.include`)

Uncovered items = statements + branches + functions uncovered in the post-fix full run, before -> after 0.

| file | before (uncovered items) | after |
|---|---|---|
| `src/components/AssistantDock/agent-failure-scanners.ts` | 31 | 0 |
| `src/features/observability/recent-errors-rules.ts` | 10 | 0 |
| `src/lib/assistant-transport.ts` | 10 | 0 |
| `src/lib/unique-id.ts` | 10 | 0 |
| `src/lib/owner-recovery-api.ts` | 12 | 0 |
| `src/lib/owner-passkey-api.ts` | 13 | 0 |
| `src/lib/owner-mfa-api.ts` | 9 | 0 |
| `src/lib/browser-telemetry.ts` | 8 | 0 |
| `src/lib/agent-navigation-entities.ts` | 8 (stmts) | 0 (see seam note) |
| `src/components/AssistantDock/assistant-runtime-preferences.adapter.ts` | 10 | 0 |
| `src/features/email/email-api.ts` | 27 (stmts) | 0 |
| `src/lib/api.ts` | 27 | 0 (verified with all `api-*` and `admin-failure-channel` suites) |
| `src/features/plugins/hooks/use-agent-plugin-memory.hooks.ts` | 6 | 0 |
| `src/features/integrations/hooks/use-integration-deliveries.hooks.ts` | 8 | 0 |
| `src/features/security/hooks/use-copy-keys.hooks.ts` | 7 | 0 |
| `src/features/settings/ExternalMcpSharedChoice.hooks.ts` | 6 | 0 |
| `src/hooks/assistant-chats-dependencies.hooks.ts` | 8 | 0 |
| `src/features/skills/use-skill-files.hooks.ts` | 7 | 1 left: line 28, the `toolId === null` throw inside the query fetch, unreachable because the query is `enabled: toolId !== null`; needs a refactor decision (not faked) |

## New / changed tests

- `lib/__tests__/agent-navigation-entities.lookups.unit.test.ts`
- `components/AssistantDock/__tests__/assistant-runtime-preferences.adapter.unit.test.ts`
- `features/email/__tests__/email-api.unit.test.ts` (extended)
- `lib/__tests__/api-mcp-plugin-keys-observability-endpoints.unit.test.ts`
- `components/AssistantDock/__tests__/agent-failure-scanners.unit.test.ts` (differential against the documented regexes)
- `lib/__tests__/unique-id.unit.test.ts`, `owner-auth-ports.unit.test.ts`, `assistant-transport-host-options.unit.test.ts`,
  `browser-telemetry.send.unit.test.ts`, `features/observability/__tests__/recent-errors-rules.whitespace.unit.test.ts`
- `plugins/__tests__/use-agent-plugin-memory.unit.test.tsx`, `integrations/__tests__/use-integration-deliveries.wired.unit.test.tsx`,
  `skills/__tests__/use-skill-files-modal.unit.test.tsx`, `security/__tests__/use-copy-keys.states.unit.test.tsx`,
  `settings/__tests__/ExternalMcpSharedChoice.hooks.unit.test.tsx`, `hooks/__tests__/assistant-chats-dependencies.rename-delete.unit.test.ts`,
  `lib/__tests__/api-external-mcp-oauth-and-page-save-failure.unit.test.ts`, `AssistantDock/__tests__/assistant-runtime-preferences.composition.unit.test.tsx`
- helper change: `__tests__/fetch-query-render.tsx` mounts the kits (see above); 66 test files re-pointed to it.

## Seams / refactors (no behaviour change)

- `lib/agent-navigation-entities.ts`: removed an unreachable `throw` (own-property of `lookups` is always a function);
  a missing lookup still returns `null`.

## Bugs found

- None confirmed as production bugs. Notes: `lib/api.ts` still contains `clearFsFilesCustomRoot`, which
  `api-fs-files-custom-root.unit.test.ts` says was deleted 2026-10-03 as unused — dead code (now covered, not removed).

## Skipped on instruction (other branches are moving these)

`features/database/**`, `features/sites/**` (AllSitesTab, Sites.tsx, ...), `features/media-generation/**`,
`features/media/**` and `features/menus/**` — not touched.

## Remaining (numbered, worst-first from the post-fix run; per-file items = uncovered stmts+branches+funcs)

1. Make the 41 red suites green (kit providers for App-level renders) — prerequisite to trust numbers.
2. `features/security/RecoveryCodesCard.hooks.ts` (49), `RecoveryCodesCard.tsx` (27)
3. `features/email/*`: EmailActivityTab (48), EmailOverviewTab (29), EmailTemplateEditor (29), EmailProviderTab (28),
   use-email-template-editor.hooks (24), EmailTemplatesTab (21), use-email-templates.hooks (17), use-email-activity.hooks (16),
   EmailSenderTab (13), EmailParts (12), Email.tsx (10), use-email-provider.hooks (8), use-email.hooks (7)
4. `features/settings/ExternalMcpSettingsPanel.tsx` (22), `use-external-mcp-oauth-connect.hooks.ts` (21)
5. `features/plugins`: use-plugin-provider-settings.hooks (21), plugins-dependencies.hooks (19), Plugins.tsx (18)
6. `panel-pages.ts` (20: lazy loaders), `App.tsx` (20), `App.chrome.tsx` (20), `App.hooks.ts` (13)
7. `features/auth/OwnerRecoverySignIn.hooks.ts` (18), `Login.tsx` (9), `OwnerRecoverySignIn.tsx` (9)
8. `features/consent/use-consent-page.hooks.ts` (12)
9. `features/ai-assistant/hooks/use-visitor-tools.hooks.ts` (10), `lib/widget-embed-extension.tsx` (1 left: line 114, the `setContent` forwarder; needs the media-items editor driven inside the Style dialog), `components/EmbedInsertControl/EmbedInsertControl.tsx` (8), `components/AssistantDock/DockHeader.tsx` (6)
10. Remaining `lib/api.ts` items, then the long tail (~100 files with < 6 uncovered items each).

Note: the full-suite per-file percentages were not re-measured at the end (a full run takes ~25 min); each file above
was verified with a targeted `vitest --coverage --coverage.include=<file>` over its own and neighbouring suites.
