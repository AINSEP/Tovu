BOOTSTRAP: dispatched job. This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.

ROLE: you are the TDD agent doing a coverage GAP FILL. Read first: /Users/la/Programming/Tovu/AI-Dev-Shop/agents/tdd/skills.md, then the skills it lists for writing tests: AI-Dev-Shop/skills/test-design/SKILL.md, AI-Dev-Shop/skills/adversarial-test-design/references/testing-mistakes.md (lines 1-192: The One Question, the "What I'm about to test" index, Author Checklist; then the entries for what you test), AI-Dev-Shop/skills/coding-foundations/SKILL.md, AI-Dev-Shop/skills/testable-design-patterns/SKILL.md, and AI-Dev-Shop/harness-engineering/quality/coverage-integrity-policy.md (all under /Users/la/Programming/Tovu/). There is no spec/ADR for this work: skip spec-hash/ADR/CIC certification steps; follow the gap-fill path (step 4a).

GOAL: owner target is 100% lines/branches/functions per file. Write HIGH-QUALITY tests that cover the uncovered lines listed below. A test exists to catch a real break, not to raise a number.

HARD - NO RUNNING (owner: running tests here could take down the machine): do NOT run tests, test suites, builds, installs, typechecks of the tests tsconfig, coverage, or mutation runs. This clone has no node_modules; do not install. An Opus cloud run tests and fixes everything after you, so write code that you are confident compiles: check imports, exported names and types by reading the source.
HARD - NO REPO-WIDE SEARCH: no git grep / rg / find over the whole repo. Search only inside the target file's own package or app folder (e.g. `git grep -l <name> -- packages/cms/`), or read exact files.
DO NOT TOUCH: packages/commerce, packages/user-management, packages/integrations (other jobs own them), packages/admin/src/pages/PageEditorChrome.tsx and its tests, coverage configs, thresholds, guard baselines, ratchets.

FOR EACH FILE in the list:
1. Read the source and its existing tests (same folder / __tests__ next to it). Extend an existing test file when it fits; else add a new one that matches the neighbours' runner, location and naming (Jini = vitest; Tovu website/desktop = node:test + node:assert as the neighbours do; Tovu admin = vitest + Testing Library).
2. Cover the listed uncovered lines/branches/functions through the file's real behaviour: outputs, state changes, errors with their messages, calls to INJECTED ports with exact args. Every branch named by an `if`/`??`/`?:` gets the case that takes it.
3. For every new test, record in COMMIT-PLAN.md (repo root, not committed): file:test -> the mutation in the source that must turn it red. Do not run it.
4. Run the Author Checklist on every new test before moving on.
RULES: never vi.mock / mock.module the module under test; prefer real in-memory implementations and injected fakes over module mocks; reuse the package's existing test helpers and fixtures. No snapshot-only tests; no `toBeDefined`/`not.toThrow`/`ok(x)` as the only assertion; no test that only imports a file to bump coverage. No skips, no `.only`, no ts-ignore/expect-error, no `as any`. Never edit an existing assertion to be weaker.
PRODUCTION CODE: do not change it. If a test you write proves a real bug, keep that test (it will be red), and report BUG <file:line> + what is wrong + the fix you propose.
NOT WORTH TESTING: if a line truly cannot be meaningfully tested (type-only module, pure re-export barrel, process entry point), do not write a fake test: list it as EXCEPTION <file:lines> + one-line reason. Data tables (i18n dictionaries, catalogs) ARE testable: assert real invariants (every locale has every key of the source locale, no empty values, placeholders preserved).
Work through the whole list; if you run low on context, finish the file you are on and write the report.

REPORT (final message, <= 700 words): files done (tests added per file), files SKIPPED-ALREADY-COVERED (with the existing test that covers them), EXCEPTION list, BUG list, files left and why, new test files created.

REPO: Jini only. HEAD = codex/w62-cov-misc-2 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/chat/src/react/components/FolderChips.tsx | lines 100.0 br 95.0 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/Markdown.tsx | lines 98.94 br 98.33 fn 100.0 | uncovered lines: 350-351,608-609
- packages/chat/src/react/components/McpUiSurfaceCard.tsx | lines 100.0 br 93.4 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/MessageList.hooks.ts | lines 100.0 br 95.12 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/MessageRow.hooks.tsx | lines 100.0 br 98.82 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/MessageRow.tsx | lines 100.0 br 99.21 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/MessageRow.usage.ts | lines 100.0 br 98.44 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/MidRunUserMessage.tsx | lines 100.0 br 94.29 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/RoutedA2uiSurfaceCard.tsx | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/ToolCard.rules.ts | lines 96.67 br 92.86 fn 100.0 | uncovered lines: 49-50
- packages/chat/src/react/components/ToolCard.tsx | lines 100.0 br 99.12 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/mcp-ui-question-input.ts | lines 100.0 br 92.73 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/mcp-ui-surface-state.ts | lines 100.0 br 97.06 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/own-link.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/chat/src/react/features/bridged-chat/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 5-6
- packages/chat/src/react/features/chat-pane/components/ChatPaneComposerArea.tsx | lines 100.0 br 97.83 fn 100.0 | uncovered lines: 
- packages/chat/src/react/features/chat-pane/components/ChatPaneStatus.tsx | lines 100.0 br 97.3 fn 100.0 | uncovered lines: 
- packages/chat/src/react/features/chat-pane/components/RuntimePickerSections.tsx | lines 100.0 br 99.07 fn 100.0 | uncovered lines: 
- packages/chat/src/react/features/chat-pane/create-daemon-attachment-uploader.ts | lines 100.0 br 98.77 fn 100.0 | uncovered lines: 
- packages/chat/src/react/features/chat-pane/create-frontend-request-caller.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts | lines 100.0 br 96.84 fn 100.0 | uncovered lines: 
- packages/chat/src/react/features/chat-pane/hooks/useRuntimeDropUp.hooks.ts | lines 100.0 br 98.18 fn 100.0 | uncovered lines: 
- packages/chat/src/react/features/chat-pane/surface-recovery-stream.ts | lines 100.0 br 78.26 fn 100.0 | uncovered lines: 
- packages/chat/src/react/features/conversation-chat-pane/components/ConversationChatPane.tsx | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- packages/chat/src/react/features/conversation-chat-pane/hooks/useConversationChatPane.hooks.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/chat/src/react/features/conversation-chat-pane/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 5-7
- packages/chat/src/react/features/conversations/hooks/useStoredConversations.hooks.ts | lines 100.0 br 90.91 fn 100.0 | uncovered lines: 
- packages/chat/src/react/features/conversations/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 5-7
- packages/chat/src/react/hooks/composer-draft-cache.ts | lines 100.0 br 99.38 fn 100.0 | uncovered lines: 
- packages/chat/src/react/hooks/useComposer.ts | lines 99.28 br 98.76 fn 100.0 | uncovered lines: 222-223
- packages/chat/src/react/hooks/useConversation.ts | lines 100.0 br 99.32 fn 100.0 | uncovered lines: 
- packages/chat/src/react/hooks/useQuestionForms.ts | lines 100.0 br 94.0 fn 100.0 | uncovered lines: 
- packages/chat/src/react/hooks/useSurfaceRecovery.ts | lines 91.53 br 82.5 fn 85.71 | uncovered lines: 68-72
- packages/chat/src/react/tool-call-display.ts | lines 100.0 br 96.39 fn 100.0 | uncovered lines: 
- packages/chat/src/server/chat-cleanup-routes.ts | lines 56.0 br 42.86 fn 33.33 | uncovered lines: 28-31,36-41,46-56,63
- packages/chat/src/server/durable-runs/accept.ts | lines 95.0 br 92.86 fn 100.0 | uncovered lines: 24
- packages/chat/src/server/durable-runs/recover.ts | lines 100.0 br 98.15 fn 100.0 | uncovered lines: 
- packages/chat/src/store/runtime/attempt-base-retention.ts | lines 100.0 br 91.43 fn 100.0 | uncovered lines: 
- packages/chat/src/store/runtime/checkpoint-delta.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/chat/src/store/runtime/durable-run-queries.ts | lines 100.0 br 97.92 fn 100.0 | uncovered lines: 
- packages/chat/src/store/runtime/durable-run-store.ts | lines 100.0 br 97.27 fn 100.0 | uncovered lines: 
- packages/chat/src/store/runtime/history-tools.ts | lines 100.0 br 99.17 fn 100.0 | uncovered lines: 
- packages/chat/src/store/runtime/run-guarded-chat-store.ts | lines 96.15 br 94.12 fn 100.0 | uncovered lines: 10
- packages/chat/src/store/runtime/run-ledger.ts | lines 100.0 br 99.34 fn 97.22 | uncovered lines: 
- packages/chat/src/store/sql/bulk-deletion.ts | lines 98.77 br 75.0 fn 100.0 | uncovered lines: 87
- packages/chat/src/store/sql/store.ts | lines 100.0 br 97.27 fn 100.0 | uncovered lines: 
- packages/cli/src/run-command.ts | lines 98.86 br 99.06 fn 100.0 | uncovered lines: 192-193
- packages/cli/src/stdin-line.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/cookie-consent/src/client.min.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-3
- packages/cookie-consent/src/client/bridges.ts | lines 100.0 br 90.91 fn 100.0 | uncovered lines: 
- packages/cookie-consent/src/client/entry.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 4-5,7
- packages/cookie-consent/src/client/runtime.ts | lines 100.0 br 96.51 fn 100.0 | uncovered lines: 
- packages/cookie-consent/src/contracts/consent-file.ts | lines 100.0 br 86.49 fn 100.0 | uncovered lines: 
- packages/cookie-consent/src/contracts/scripts.ts | lines 100.0 br 86.96 fn 100.0 | uncovered lines: 
- packages/cookie-consent/src/extensions.min.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-14
- packages/cookie-consent/src/render/banner.ts | lines 100.0 br 98.73 fn 100.0 | uncovered lines: 
- packages/cookie-consent/src/site/cookie-consent.ts | lines 100.0 br 91.3 fn 100.0 | uncovered lines: 
- packages/cookie-consent/src/site/document-assets.ts | lines 22.22 br 57.14 fn 16.67 | uncovered lines: 27-28,32,34-41,44,46-55,58,64-72,75,77-78,84,94,96,102-105
- packages/cookie-consent/src/site/document-state.ts | lines 96.77 br 82.86 fn 83.33 | uncovered lines: 24-25
- packages/cookie-consent/src/site/ensure-privacy-defaults.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,24-30,36,38-49,51-55,57,59-61
- packages/cookie-consent/src/site/http.ts | lines 61.31 br 54.84 fn 50.0 | uncovered lines: 57-58,63-64,104-115,145-146,148,150,158,162-179,181,187-198,242,246-249,254,256-263,266,270-275,278,281-283
- packages/cookie-consent/src/site/pre-consent-cache.ts | lines 100.0 br 72.73 fn 100.0 | uncovered lines: 
- packages/cookie-consent/src/site/privacy-page-template.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,7-9,11,14,17
- packages/cookie-consent/src/site/readiness.ts | lines 100.0 br 93.85 fn 100.0 | uncovered lines: 
- packages/cookie-consent/src/site/region-plugins.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 9-10,34,38-40,43-49,54-61,65-77,81-95,101-107
- packages/cookie-consent/src/site/request.ts | lines 50.0 br 75.0 fn 33.33 | uncovered lines: 7-11,24-26
- packages/cookie-consent/src/site/revisions.repo.ts | lines 77.5 br 53.33 fn 83.33 | uncovered lines: 38-46
- packages/cookie-consent/src/site/service.ts | lines 44.52 br 71.43 fn 47.06 | uncovered lines: 59-67,71-73,76-78,125-132,135-148,154,156-157,162-166,169-170,172-179,192-195,199-206,212-214,218-228
- packages/cookie-consent/src/site/settings.ts | lines 65.0 br 84.21 fn 75.0 | uncovered lines: 68-70,75-84,94-96,98,106-109
- packages/cookie-consent/src/site/tool-registrations.ts | lines 89.29 br 55.56 fn 30.77 | uncovered lines: 63-66,96-97
- packages/cookie-consent/src/site/validation.ts | lines 100.0 br 89.47 fn 100.0 | uncovered lines: 
- packages/core/src/approval-batch-chain.ts | lines 100.0 br 96.15 fn 77.78 | uncovered lines: 
- packages/core/src/approval.ts | lines 100.0 br 98.3 fn 95.83 | uncovered lines: 
- packages/core/src/batch-tool-inputs.ts | lines 100.0 br 98.31 fn 100.0 | uncovered lines: 
- packages/core/src/config/env-schema.ts | lines 92.31 br 71.43 fn 100.0 | uncovered lines: 41-42
- packages/core/src/contracts/agents/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 7
- packages/core/src/contracts/agents/model-catalog.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 180
- packages/core/src/contracts/agents/proxy-provider-kit.ts | lines 53.52 br 100.0 fn 61.54 | uncovered lines: 77-83,107-118,122-129,147-150,154-155
- packages/core/src/contracts/ai-trace/recorder.ts | lines 91.77 br 89.26 fn 91.18 | uncovered lines: 166-167,231-232,236-237,251-256,290-292,294-297
- packages/core/src/contracts/ai-trace/sinks.ts | lines 94.68 br 85.48 fn 100.0 | uncovered lines: 21-23,34-35
- packages/core/src/contracts/blob.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 29-36
- packages/core/src/contracts/capabilities.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 67-70,86-88,90-92,94-99,101-104,112-116,118-119,122-129,131-140,142-143,146-149,151-161,170-173
- packages/core/src/contracts/events.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 5
- packages/core/src/contracts/events/ports.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 35
- packages/core/src/contracts/forms.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 4
- packages/core/src/contracts/mail.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 139,145
- packages/core/src/contracts/mail/email-sender.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 65-72,76-84
- packages/core/src/contracts/observability.ts | lines 100.0 br 100.0 fn 28.57 | uncovered lines: 
- packages/core/src/contracts/runtime.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-9
- packages/core/src/contracts/runtime/environment.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 10-27
