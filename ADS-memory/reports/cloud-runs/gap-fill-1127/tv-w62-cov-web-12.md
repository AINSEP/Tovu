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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-12 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/website/src/server/runtime/composition/modules/agent-plugins-routes.ts | lines 100.0 br 98.0 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/assistant-ag-ui-approval-segment.ts | lines 48.19 br 100.0 fn 0.0 | uncovered lines: 18-23,32-38,42-45,49-52,64-85
- apps/website/src/server/runtime/composition/modules/assistant-ag-ui-launch.ts | lines 78.95 br 76.19 fn 100.0 | uncovered lines: 1-7,37
- apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts | lines 78.29 br 50.65 fn 75.0 | uncovered lines: 3-46,266-273,286-290,297-303,307-315,324-339,378-380,389-396,402-412,426-428,440-441,516-517,553-556,560-562,604-605
- apps/website/src/server/runtime/composition/modules/assistant-agent-plugin-guidance-rpc.ts | lines 93.26 br 70.59 fn 81.82 | uncovered lines: 1-6
- apps/website/src/server/runtime/composition/modules/assistant-attachment-read.ts | lines 89.19 br 92.59 fn 88.89 | uncovered lines: 35-46
- apps/website/src/server/runtime/composition/modules/assistant-byok-history.ts | lines 98.41 br 100.0 fn 100.0 | uncovered lines: 53
- apps/website/src/server/runtime/composition/modules/assistant-byok-preflight.ts | lines 99.52 br 84.91 fn 100.0 | uncovered lines: 126
- apps/website/src/server/runtime/composition/modules/assistant-byok-run-usage.ts | lines 98.36 br 97.06 fn 100.0 | uncovered lines: 42
- apps/website/src/server/runtime/composition/modules/assistant-byok-turn.ts | lines 99.48 br 75.0 fn 97.06 | uncovered lines: 293-294
- apps/website/src/server/runtime/composition/modules/assistant-byok.ts | lines 95.83 br 67.5 fn 78.12 | uncovered lines: 191,210-212,231-237
- apps/website/src/server/runtime/composition/modules/assistant-chats.ts | lines 85.87 br 68.83 fn 59.65 | uncovered lines: 97-98,168-171,211-216,224-235,248-250,265-274,332-335,343-350,354-360,399,432-434,441-443
- apps/website/src/server/runtime/composition/modules/assistant-daemon-client.ts | lines 99.75 br 96.7 fn 100.0 | uncovered lines: 393
- apps/website/src/server/runtime/composition/modules/assistant-routines.ts | lines 91.8 br 75.0 fn 62.71 | uncovered lines: 113-115,135-136,140-141,284-296
- apps/website/src/server/runtime/composition/modules/assistant-run-acceptance.ts | lines 71.59 br 65.0 fn 47.62 | uncovered lines: 65-74,78-87,95-100,104-120,144-145,150-151,163-164,198
- apps/website/src/server/runtime/composition/modules/assistant-server-federation.ts | lines 100.0 br 81.82 fn 88.89 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/assistant-settings.ts | lines 100.0 br 97.56 fn 97.3 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/assistant-tool-access-lowering.ts | lines 100.0 br 72.22 fn 66.67 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/assistant-tool-exec.ts | lines 98.14 br 77.27 fn 73.68 | uncovered lines: 203-204,303-306
- apps/website/src/server/runtime/composition/modules/assistant.ts | lines 95.12 br 75.29 fn 89.66 | uncovered lines: 119-121,156-158,161-162,184,187,238-239,424-441,585-588,609-610,750
- apps/website/src/server/runtime/composition/modules/capped-route-app.ts | lines 33.33 br 100.0 fn 100.0 | uncovered lines: 3-6,8-15
- apps/website/src/server/runtime/composition/modules/change-sets.ts | lines 100.0 br 100.0 fn 90.91 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/commerce.ts | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/consent.ts | lines 100.0 br 100.0 fn 20.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/content-write-bindings.ts | lines 100.0 br 95.65 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/content.ts | lines 99.63 br 90.0 fn 100.0 | uncovered lines: 262
- apps/website/src/server/runtime/composition/modules/database-migrate-forward.ts | lines 100.0 br 100.0 fn 85.71 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/desktop-mcp-handoff.ts | lines 92.31 br 91.67 fn 100.0 | uncovered lines: 1,11
- apps/website/src/server/runtime/composition/modules/external-mcp.ts | lines 100.0 br 94.87 fn 88.24 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/forms-admin.ts | lines 100.0 br 100.0 fn 95.83 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/forms.ts | lines 75.0 br 84.21 fn 100.0 | uncovered lines: 2-19
- apps/website/src/server/runtime/composition/modules/media.ts | lines 96.17 br 96.97 fn 79.1 | uncovered lines: 327-329,383-388,392-400
- apps/website/src/server/runtime/composition/modules/members.ts | lines 97.48 br 96.88 fn 62.5 | uncovered lines: 175-177,181-183
- apps/website/src/server/runtime/composition/modules/newsletter.ts | lines 100.0 br 100.0 fn 97.78 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/owner-auth.ts | lines 100.0 br 87.5 fn 60.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/plugins.ts | lines 100.0 br 97.73 fn 95.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/posts.ts | lines 100.0 br 100.0 fn 47.06 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/public-members.ts | lines 98.04 br 89.8 fn 63.08 | uncovered lines: 182,225-228,299
- apps/website/src/server/runtime/composition/modules/publish-content-backstop.ts | lines 100.0 br 95.29 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/publish-content-import.ts | lines 100.0 br 97.22 fn 96.55 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/publish-content-ingest.ts | lines 100.0 br 100.0 fn 88.89 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/publish-trust.ts | lines 97.89 br 91.67 fn 90.91 | uncovered lines: 68,75
- apps/website/src/server/runtime/composition/modules/recovery-restore.ts | lines 100.0 br 100.0 fn 90.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/revision-thinning-routes.ts | lines 65.42 br 100.0 fn 50.0 | uncovered lines: 47-53,55-65,67-82,90-92
- apps/website/src/server/runtime/composition/modules/routine-recovery-admission.ts | lines 54.55 br 100.0 fn 25.0 | uncovered lines: 37-39,42-46,48,50-65
- apps/website/src/server/runtime/composition/modules/run-daemon-http-client.ts | lines 98.39 br 87.18 fn 93.33 | uncovered lines: 120-121
- apps/website/src/server/runtime/composition/modules/run-daemon-origins.ts | lines 100.0 br 92.0 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/run-finalizer/bounded-follow.ts | lines 100.0 br 96.61 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/run-finalizer/entry.ts | lines 100.0 br 91.36 fn 94.29 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/run-finalizer/recovery-binding.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/run-finalizer/stream.ts | lines 100.0 br 80.95 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/run-finalizer/watch-state.ts | lines 98.48 br 75.0 fn 100.0 | uncovered lines: 99
- apps/website/src/server/runtime/composition/modules/screenshot-storage.ts | lines 82.41 br 100.0 fn 29.41 | uncovered lines: 54-60,69-70,80-82,100-104,116-117
- apps/website/src/server/runtime/composition/modules/seo.ts | lines 99.27 br 100.0 fn 100.0 | uncovered lines: 2
- apps/website/src/server/runtime/composition/modules/serving-routine-tools.ts | lines 95.24 br 100.0 fn 57.89 | uncovered lines: 37-38,58
- apps/website/src/server/runtime/composition/modules/serving-routines.ts | lines 87.6 br 73.53 fn 58.62 | uncovered lines: 40-45,49-51,62-67
- apps/website/src/server/runtime/composition/modules/settings.ts | lines 100.0 br 93.33 fn 90.91 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/site-assistant-ag-ui-approval.ts | lines 69.03 br 71.43 fn 52.94 | uncovered lines: 43-44,64-74,90-93,110-116,123-133
- apps/website/src/server/runtime/composition/modules/site-assistant-ag-ui.ts | lines 97.35 br 78.46 fn 90.48 | uncovered lines: 133,157-158,172
- apps/website/src/server/runtime/composition/modules/site-assistant-preflight.ts | lines 97.93 br 98.18 fn 100.0 | uncovered lines: 262-269
- apps/website/src/server/runtime/composition/modules/site-assistant-turn.ts | lines 98.59 br 84.38 fn 90.48 | uncovered lines: 209-213
- apps/website/src/server/runtime/composition/modules/site-assistant.ts | lines 93.25 br 83.33 fn 67.86 | uncovered lines: 111-112,114-118,184-187,224-229
- apps/website/src/server/runtime/composition/modules/site-previews-route.ts | lines 100.0 br 100.0 fn 33.33 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/site-search.ts | lines 97.2 br 99.17 fn 93.22 | uncovered lines: 421-427,439-443
- apps/website/src/server/runtime/composition/modules/site.ts | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/sites.ts | lines 100.0 br 92.86 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/storage-routes.ts | lines 77.61 br 54.55 fn 34.38 | uncovered lines: 71,78-83,87-89,92-98,126-135,140-141,150-151,177,218-230
- apps/website/src/server/runtime/composition/modules/system-assistant.ts | lines 100.0 br 100.0 fn 95.24 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/system-credentials.ts | lines 100.0 br 94.12 fn 85.94 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/system-deploy.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/system-mail.ts | lines 99.18 br 90.91 fn 74.19 | uncovered lines: 249-250
- apps/website/src/server/runtime/composition/modules/system-site-backups.ts | lines 90.38 br 100.0 fn 14.29 | uncovered lines: 31-35
- apps/website/src/server/runtime/composition/modules/system-site-shares.ts | lines 100.0 br 93.02 fn 86.49 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/system-telemetry.ts | lines 100.0 br 100.0 fn 75.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/theme-explore.ts | lines 100.0 br 100.0 fn 95.24 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/theme-held-back.ts | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/themes.ts | lines 100.0 br 92.31 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/tool-execution-caller-express.ts | lines 78.12 br 83.33 fn 100.0 | uncovered lines: 1-7
- apps/website/src/server/runtime/composition/modules/trash.ts | lines 100.0 br 100.0 fn 96.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/types.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/runtime/composition/modules/users.ts | lines 100.0 br 100.0 fn 95.65 | uncovered lines: 
- apps/website/src/server/runtime/composition/modules/widgets.ts | lines 98.16 br 97.44 fn 97.14 | uncovered lines: 65-68
- apps/website/src/server/runtime/composition/move-site-storage.ts | lines 80.36 br 69.23 fn 100.0 | uncovered lines: 61-62,87,112-130
- apps/website/src/server/runtime/composition/mutation-actor.ts | lines 73.33 br 80.0 fn 100.0 | uncovered lines: 3-9,11
- apps/website/src/server/runtime/composition/observability-export.ts | lines 95.74 br 36.36 fn 100.0 | uncovered lines: 1,35
- apps/website/src/server/runtime/composition/open-site-content-db.ts | lines 78.69 br 50.0 fn 50.0 | uncovered lines: 40-42,46-51,59-62
- apps/website/src/server/runtime/composition/open-site-store.ts | lines 100.0 br 91.84 fn 91.67 | uncovered lines: 
- apps/website/src/server/runtime/composition/other-site-keys.ts | lines 46.54 br 100.0 fn 9.68 | uncovered lines: 51-53,55-57,60-64,66-73,91-92,99-103,109-114,118-128,136-153,158-161,164-169,171-178,180-185,188-204,210-223
- apps/website/src/server/runtime/composition/peer-site-reads.ts | lines 99.39 br 93.39 fn 91.07 | uncovered lines: 331-332,500
- apps/website/src/server/runtime/composition/pending-agent-plugin-tokens.ts | lines 100.0 br 97.3 fn 100.0 | uncovered lines: 
