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

REPO: Jini only. HEAD = codex/w62-cov-misc-1 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/agent-runtime/src/agent-protocol/acp/models.ts | lines 100.0 br 97.69 fn 97.14 | uncovered lines: 
- packages/agent-runtime/src/agent-protocol/acp/session-permission.ts | lines 100.0 br 98.15 fn 100.0 | uncovered lines: 
- packages/agent-runtime/src/agent-protocol/acp/session-run.ts | lines 98.42 br 100.0 fn 96.15 | uncovered lines: 461-467
- packages/agent-runtime/src/agent-protocol/acp/session.ts | lines 100.0 br 98.46 fn 100.0 | uncovered lines: 
- packages/agent-runtime/src/agent-protocol/core/json-line-stream.ts | lines 98.91 br 99.44 fn 100.0 | uncovered lines: 82-84
- packages/agent-runtime/src/claude-code-models.ts | lines 100.0 br 98.39 fn 100.0 | uncovered lines: 
- packages/agent-runtime/src/claude-filesystem-policy.ts | lines 100.0 br 99.11 fn 100.0 | uncovered lines: 
- packages/agent-runtime/src/claude-stream-frames.ts | lines 100.0 br 98.8 fn 100.0 | uncovered lines: 
- packages/agent-runtime/src/claude-stream-handler.ts | lines 100.0 br 99.45 fn 100.0 | uncovered lines: 
- packages/agent-runtime/src/defs/antigravity/event-stream.ts | lines 86.36 br 80.43 fn 100.0 | uncovered lines: 23-24,66-69,80-82
- packages/agent-runtime/src/defs/antigravity/index.ts | lines 99.15 br 94.87 fn 100.0 | uncovered lines: 105
- packages/agent-runtime/src/defs/claude/config-dir.ts | lines 16.95 br 100.0 fn 16.67 | uncovered lines: 24-26,28-30,32-39,105-117,120-126,128-137,156-160
- packages/agent-runtime/src/defs/claude/filesystem.ts | lines 28.57 br 100.0 fn 0.0 | uncovered lines: 13,18-22,26-28,31-32,34,36,38-39
- packages/agent-runtime/src/defs/claude/mcp-config.ts | lines 86.96 br 80.0 fn 100.0 | uncovered lines: 28-30
- packages/agent-runtime/src/defs/claude/mcp-delivery.ts | lines 12.0 br 100.0 fn 0.0 | uncovered lines: 5-6,30-33,61-71,74-78
- packages/agent-runtime/src/defs/claude/mcp-json.ts | lines 91.67 br 100.0 fn 75.0 | uncovered lines: 45-46
- packages/agent-runtime/src/defs/codex/home-staging.ts | lines 11.61 br 100.0 fn 9.09 | uncovered lines: 41-42,44-46,48-50,65-78,80-88,100,103-111,143-151,157,160-163,166-174,176-185,189-190,193-196,211,215-232
- packages/agent-runtime/src/defs/codex/isolation.ts | lines 75.0 br 72.73 fn 60.0 | uncovered lines: 10-11,25-26,46-47,62-63
- packages/agent-runtime/src/defs/codex/mcp-delivery.ts | lines 33.33 br 100.0 fn 0.0 | uncovered lines: 3-4
- packages/agent-runtime/src/defs/opencode-acp/index.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/agent-runtime/src/diagnostics.ts | lines 100.0 br 95.92 fn 100.0 | uncovered lines: 
- packages/agent-runtime/src/model-catalog-live-discovery.ts | lines 100.0 br 90.48 fn 85.71 | uncovered lines: 
- packages/agent-runtime/src/model-discovery-yaml.ts | lines 78.12 br 78.38 fn 90.91 | uncovered lines: 37-39,75-78,81-87
- packages/agent-runtime/src/model-discovery.ts | lines 100.0 br 99.56 fn 100.0 | uncovered lines: 
- packages/agent-runtime/src/native-permissions.ts | lines 100.0 br 94.92 fn 100.0 | uncovered lines: 
- packages/agent-runtime/src/native-tool-policy.ts | lines 100.0 br 98.61 fn 100.0 | uncovered lines: 
- packages/agent-runtime/src/providers/connection-test.ts | lines 99.08 br 99.41 fn 100.0 | uncovered lines: 326-328
- packages/agent-runtime/src/providers/credentials.ts | lines 100.0 br 95.24 fn 100.0 | uncovered lines: 
- packages/agent-runtime/src/providers/tool-turn.ts | lines 98.93 br 99.52 fn 100.0 | uncovered lines: 381-383
- packages/agent-runtime/src/runtime-port-bindings.ts | lines 94.68 br 93.75 fn 42.86 | uncovered lines: 74-76,79,112
- packages/agent-runtime/src/runtime-strategies.ts | lines 100.0 br 97.78 fn 85.71 | uncovered lines: 
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/remotion.config.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3-6
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/Root.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-3,5-15,17
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/chatSpec.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-17
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/ChatMotionOverlay.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-4,7-16,18-19,21
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/DeviceFrame.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3-14,16-36,38-40,42
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,4
- packages/agent-runtime/src/skills/web-clone/scripts/lib/css-url.mjs | lines 100.0 br 79.17 fn 100.0 | uncovered lines: 
- packages/agent-runtime/src/skills/web-clone/scripts/lib/diagnostic-labels.mjs | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/agent-runtime/src/skills/web-clone/scripts/recon-site.mjs | lines 99.56 br 94.8 fn 100.0 | uncovered lines: 204-205
- packages/agentic/src/core/dom/dom-page-driver.ts | lines 99.77 br 97.74 fn 100.0 | uncovered lines: 703
- packages/agentic/src/core/dom/page-port.ts | lines 37.5 br 100.0 fn 0.0 | uncovered lines: 24-28
- packages/agentic/src/core/dom/publication-filter.ts | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- packages/agentic/src/core/page-executor.ts | lines 99.31 br 99.48 fn 100.0 | uncovered lines: 513-514
- packages/agentic/src/core/page-navigation.ts | lines 100.0 br 88.24 fn 100.0 | uncovered lines: 
- packages/agentic/src/core/render-surface.ts | lines 100.0 br 95.56 fn 100.0 | uncovered lines: 
- packages/agentic/src/react/skills/api.ts | lines 61.11 br 83.33 fn 62.5 | uncovered lines: 21-22,28-32
- packages/agentic/src/react/skills/use-skill-files.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,7,23,26-28,31-55,58,63-74
- packages/agentic/src/react/skills/use-skill-install.hooks.ts | lines 94.12 br 66.67 fn 33.33 | uncovered lines: 24,37
- packages/agentic/src/react/skills/use-skills.hooks.ts | lines 82.88 br 65.52 fn 54.17 | uncovered lines: 41-42,93-96,105-109,156-157,162-164,167-169,171-176
- packages/agentic/src/skills/install/tool-registry-live-registration.ts | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- packages/agentic/src/skills/site/install-service.ts | lines 62.79 br 80.0 fn 44.44 | uncovered lines: 11-14,16-27
- packages/agentic/src/skills/site/install-tool.ts | lines 76.67 br 50.0 fn 33.33 | uncovered lines: 72-75,94-101,109-110
- packages/agentic/src/skills/site/tool-registrations.ts | lines 37.5 br 100.0 fn 60.0 | uncovered lines: 114-119,129-130,134-143,145-156
- packages/agentic/src/skills/tools/installed-skill-tools.ts | lines 89.81 br 71.67 fn 92.31 | uncovered lines: 131-132,137,139,166-169,205-207,217-219,254-255
- packages/analytics/src/privacy.ts | lines 100.0 br 95.35 fn 100.0 | uncovered lines: 
- packages/analytics/src/product/index.ts | lines 100.0 br 98.78 fn 100.0 | uncovered lines: 
- packages/analytics/src/product/projection.ts | lines 100.0 br 96.55 fn 100.0 | uncovered lines: 
- packages/analytics/src/public-http/routes/analytics-ingest.ts | lines 100.0 br 90.7 fn 100.0 | uncovered lines: 
- packages/analytics/src/site/config.settings.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,9,65,82-90,110-119,134-142,148-150,156-159,162-164,180-185,187-195,199-201,208-209,211-224
- packages/analytics/src/site/tool-registrations.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-4,6-7,11,14,16-17,20-22,25-29,31-40,47-66,69-71
- packages/analytics/src/site/visitor-analytics.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/chat/src/core/accepted-input.ts | lines 100.0 br 98.43 fn 100.0 | uncovered lines: 
- packages/chat/src/core/ag-ui/event-projection.ts | lines 100.0 br 97.39 fn 96.0 | uncovered lines: 
- packages/chat/src/core/ag-ui/event-reduction.ts | lines 100.0 br 97.06 fn 100.0 | uncovered lines: 
- packages/chat/src/core/assistant-client/ag-ui-approval-relay.ts | lines 81.25 br 66.67 fn 64.0 | uncovered lines: 79-85,115-117,165-170,201-207,224
- packages/chat/src/core/assistant-client/ag-ui-fetch-agent.ts | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- packages/chat/src/core/assistant-client/ag-ui-transport.ts | lines 99.58 br 95.05 fn 100.0 | uncovered lines: 257
- packages/chat/src/core/assistant-client/browser-durable-subscription.ts | lines 100.0 br 86.21 fn 85.71 | uncovered lines: 
- packages/chat/src/core/assistant-client/durable-run-subscription.ts | lines 100.0 br 95.16 fn 93.75 | uncovered lines: 
- packages/chat/src/core/assistant-client/messages.ts | lines 100.0 br 92.86 fn 100.0 | uncovered lines: 
- packages/chat/src/core/assistant-client/transport.ts | lines 100.0 br 97.92 fn 100.0 | uncovered lines: 
- packages/chat/src/core/checkpoint-interval.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/chat/src/core/durable-runs/run-finalizer.ts | lines 100.0 br 96.3 fn 100.0 | uncovered lines: 
- packages/chat/src/core/persistence/title.ts | lines 100.0 br 97.67 fn 100.0 | uncovered lines: 
- packages/chat/src/core/util/markdown-context.ts | lines 100.0 br 94.23 fn 100.0 | uncovered lines: 
- packages/chat/src/core/util/pointer.ts | lines 100.0 br 97.73 fn 100.0 | uncovered lines: 
- packages/chat/src/core/util/validate.ts | lines 97.95 br 98.48 fn 100.0 | uncovered lines: 165-167
- packages/chat/src/embed-widget/browser/embed-send-bridge.ts | lines 100.0 br 97.22 fn 100.0 | uncovered lines: 
- packages/chat/src/embed-widget/browser/frontend-invocation-handler.ts | lines 97.56 br 94.94 fn 100.0 | uncovered lines: 168-170
- packages/chat/src/embed-widget/browser/frontend-session-bridge.ts | lines 100.0 br 98.72 fn 100.0 | uncovered lines: 
- packages/chat/src/react/admin-execution/ai-agent-presentation.ts | lines 100.0 br 84.21 fn 100.0 | uncovered lines: 
- packages/chat/src/react/admin-execution/hooks/use-ai-agent-presentation.hooks.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/chat/src/react/chat-cleanup/ChatCleanupPanel.tsx | lines 100.0 br 40.0 fn 40.0 | uncovered lines: 
- packages/chat/src/react/chat-cleanup/chat-cleanup.hooks.ts | lines 35.29 br 66.67 fn 33.33 | uncovered lines: 74-78,84-97,103-110,112-128
- packages/chat/src/react/components/A2uiSurfaceCard.rules.ts | lines 100.0 br 90.91 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/ChatCleanupDialog.tsx | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/ChatSettingsSegmented.tsx | lines 100.0 br 71.43 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/ConversationList.hooks.ts | lines 100.0 br 97.44 fn 100.0 | uncovered lines: 
- packages/chat/src/react/components/ConversationList.tsx | lines 100.0 br 95.95 fn 100.0 | uncovered lines: 
