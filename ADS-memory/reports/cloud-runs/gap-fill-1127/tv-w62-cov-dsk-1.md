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

REPO: Tovu only. HEAD = codex/tv-w62-cov-dsk-1 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- apps/desktop/src/app-version-ipc.ts | lines 90.38 br 85.71 fn 66.67 | uncovered lines: 13-17
- apps/desktop/src/contracts/site-name.ts | lines 96.15 br 100.0 fn 100.0 | uncovered lines: 15
- apps/desktop/src/coverage-floors.ts | lines 100.0 br 92.98 fn 100.0 | uncovered lines: 
- apps/desktop/src/desktop-agent-service.ts | lines 100.0 br 80.49 fn 90.0 | uncovered lines: 
- apps/desktop/src/desktop-agent.ts | lines 100.0 br 98.63 fn 98.39 | uncovered lines: 
- apps/desktop/src/desktop-capture.ts | lines 100.0 br 100.0 fn 97.5 | uncovered lines: 
- apps/desktop/src/desktop-chat-main.ts | lines 100.0 br 100.0 fn 88.89 | uncovered lines: 
- apps/desktop/src/desktop-i18n.ts | lines 100.0 br 70.0 fn 100.0 | uncovered lines: 
- apps/desktop/src/desktop-mcp-http.ts | lines 100.0 br 78.95 fn 80.0 | uncovered lines: 
- apps/desktop/src/desktop-partition-lock.ts | lines 100.0 br 88.75 fn 98.18 | uncovered lines: 
- apps/desktop/src/desktop-resources.ts | lines 100.0 br 96.04 fn 97.44 | uncovered lines: 
- apps/desktop/src/external-site-stop.ts | lines 100.0 br 96.67 fn 100.0 | uncovered lines: 
- apps/desktop/src/main/boot/desktop-cache-policy.ts | lines 97.82 br 81.82 fn 96.55 | uncovered lines: 95-98,185
- apps/desktop/src/main/boot/desktop-partition-pass.ts | lines 98.39 br 92.0 fn 86.67 | uncovered lines: 107-108
- apps/desktop/src/main/boot/routine-desktop.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- apps/desktop/src/main/boot/site-preview-guests.ts | lines 100.0 br 97.22 fn 83.33 | uncovered lines: 
- apps/desktop/src/main/boot/site-preview.ts | lines 100.0 br 92.5 fn 100.0 | uncovered lines: 
- apps/desktop/src/main/boot/storage-idle-compaction.ts | lines 100.0 br 96.67 fn 80.0 | uncovered lines: 
- apps/desktop/src/main/boot/storage-sheet-sources.ts | lines 100.0 br 91.49 fn 96.43 | uncovered lines: 
- apps/desktop/src/main/index.ts | lines 46.4 br 12.5 fn 0.0 | uncovered lines: 230-340,356-428,443-445,448-451,454-457,464-467,487-499,515-520,525-527,530-531,577,596-598,604-606,620-623,626,629-635,638-651,695-703,722-741,752-754,764-769,775-790,793-803,812-…
- apps/desktop/src/main/updates/settings-menu.ts | lines 100.0 br 95.0 fn 84.62 | uncovered lines: 
- apps/desktop/src/main/windows/dock-icon.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- apps/desktop/src/main/windows/sites-home-window.ts | lines 100.0 br 96.0 fn 100.0 | uncovered lines: 
- apps/desktop/src/owner-store-cli.ts | lines 100.0 br 91.67 fn 80.0 | uncovered lines: 
- apps/desktop/src/owner-store-ipc.ts | lines 100.0 br 96.15 fn 100.0 | uncovered lines: 
- apps/desktop/src/preload/preload.mts | lines 99.12 br 98.7 fn 98.68 | uncovered lines: 94-95
- apps/desktop/src/product-memory-telemetry.ts | lines 100.0 br 97.92 fn 100.0 | uncovered lines: 
- apps/desktop/src/product-telemetry-ipc.ts | lines 100.0 br 98.11 fn 100.0 | uncovered lines: 
- apps/desktop/src/product-telemetry.ts | lines 100.0 br 95.0 fn 100.0 | uncovered lines: 
- apps/desktop/src/project-ipc.catalog.ts | lines 100.0 br 98.81 fn 100.0 | uncovered lines: 
- apps/desktop/src/project-ipc.delete.ts | lines 100.0 br 96.72 fn 100.0 | uncovered lines: 
- apps/desktop/src/project-ipc.import.ts | lines 100.0 br 95.56 fn 100.0 | uncovered lines: 
- apps/desktop/src/project-ipc.rename.ts | lines 100.0 br 92.0 fn 100.0 | uncovered lines: 
- apps/desktop/src/project-ipc.server.ts | lines 100.0 br 98.59 fn 100.0 | uncovered lines: 
- apps/desktop/src/project-ipc.site-lifecycle.ts | lines 99.73 br 88.18 fn 86.84 | uncovered lines: 255
- apps/desktop/src/project-ipc.ts | lines 100.0 br 97.37 fn 87.8 | uncovered lines: 
- apps/desktop/src/renderer/App.hooks.ts | lines 33.33 br 100.0 fn 100.0 | uncovered lines: 1-30
- apps/desktop/src/renderer/App.tsx | lines 100.0 br 100.0 fn 92.31 | uncovered lines: 
- apps/desktop/src/renderer/ImportWebsite.tsx | lines 94.94 br 92.86 fn 66.67 | uncovered lines: 1-8
- apps/desktop/src/renderer/ResourcesPanel.tsx | lines 99.4 br 97.47 fn 100.0 | uncovered lines: 140
- apps/desktop/src/renderer/SharedKeys.hooks.ts | lines 98.71 br 89.29 fn 100.0 | uncovered lines: 1,147
- apps/desktop/src/renderer/SharedKeys.tsx | lines 99.35 br 86.27 fn 85.71 | uncovered lines: 1
- apps/desktop/src/renderer/SiteGrid.hooks.ts | lines 86.75 br 96.0 fn 100.0 | uncovered lines: 1-10,14-23
- apps/desktop/src/renderer/SitesFolders.tsx | lines 99.22 br 100.0 fn 100.0 | uncovered lines: 1
- apps/desktop/src/renderer/app-hooks.test-support.ts | lines 90.79 br 100.0 fn 100.0 | uncovered lines: 1-6,59
- apps/desktop/src/renderer/app-render-harness.ts | lines 100.0 br 96.49 fn 58.89 | uncovered lines: 
- apps/desktop/src/renderer/app-shell-source.ts | lines 68.18 br 100.0 fn 100.0 | uncovered lines: 1-7
- apps/desktop/src/renderer/app/CreateWebsiteHost.tsx | lines 97.56 br 100.0 fn 100.0 | uncovered lines: 27
- apps/desktop/src/renderer/app/LoadedSitesStepper.tsx | lines 80.77 br 100.0 fn 100.0 | uncovered lines: 1-4,16
- apps/desktop/src/renderer/app/MainArea.tsx | lines 97.3 br 100.0 fn 100.0 | uncovered lines: 1-3
- apps/desktop/src/renderer/app/MainContent.tsx | lines 98.74 br 100.0 fn 100.0 | uncovered lines: 1-2
- apps/desktop/src/renderer/app/MainHeader.tsx | lines 98.61 br 100.0 fn 100.0 | uncovered lines: 15
- apps/desktop/src/renderer/app/SettingsControl.tsx | lines 100.0 br 97.92 fn 95.24 | uncovered lines: 
- apps/desktop/src/renderer/app/StorageSheet.tsx | lines 90.74 br 88.46 fn 75.0 | uncovered lines: 1-9,101
- apps/desktop/src/renderer/app/TabCloseAsk.tsx | lines 82.86 br 87.5 fn 50.0 | uncovered lines: 1-5,11
- apps/desktop/src/renderer/app/TabStrip.tsx | lines 99.1 br 100.0 fn 100.0 | uncovered lines: 49
- apps/desktop/src/renderer/app/component-harness.ts | lines 90.22 br 92.59 fn 82.76 | uncovered lines: 1-8,102
- apps/desktop/src/renderer/app/find-bar-labels.ts | lines 90.91 br 100.0 fn 100.0 | uncovered lines: 3
- apps/desktop/src/renderer/create-website-onboarding-policy.ts | lines 92.86 br 100.0 fn 100.0 | uncovered lines: 1
- apps/desktop/src/renderer/dom-hook-harness.ts | lines 82.35 br 100.0 fn 100.0 | uncovered lines: 1-9
- apps/desktop/src/renderer/find-bar-state.ts | lines 92.86 br 100.0 fn 100.0 | uncovered lines: 13
- apps/desktop/src/renderer/icons.tsx | lines 96.35 br 100.0 fn 100.0 | uncovered lines: 1-7,213
- apps/desktop/src/renderer/import-drop.ts | lines 88.1 br 94.12 fn 100.0 | uncovered lines: 1-4,37
- apps/desktop/src/renderer/import-site-entry.ts | lines 79.1 br 100.0 fn 100.0 | uncovered lines: 1-9,11-14,67
- apps/desktop/src/renderer/main.tsx | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/desktop/src/renderer/nav-availability.ts | lines 90.91 br 100.0 fn 100.0 | uncovered lines: 7
- apps/desktop/src/renderer/product-telemetry.ts | lines 88.89 br 100.0 fn 100.0 | uncovered lines: 1,16
- apps/desktop/src/renderer/runner-api.ts | lines 92.0 br 100.0 fn 100.0 | uncovered lines: 172,192
- apps/desktop/src/renderer/site-port.rules.ts | lines 96.67 br 96.15 fn 100.0 | uncovered lines: 51-52
- apps/desktop/src/renderer/sites-home-view.ts | lines 78.87 br 100.0 fn 100.0 | uncovered lines: 1-4,25-34,86
- apps/desktop/src/renderer/source-test-harness.ts | lines 89.47 br 91.67 fn 72.73 | uncovered lines: 52-59
- apps/desktop/src/renderer/storage-sheet-slot.tsx | lines 65.28 br 92.86 fn 57.14 | uncovered lines: 1-5,44-63
- apps/desktop/src/renderer/theme.ts | lines 86.21 br 100.0 fn 100.0 | uncovered lines: 1-4
- apps/desktop/src/renderer/tool-icons.tsx | lines 91.25 br 100.0 fn 100.0 | uncovered lines: 1-7
- apps/desktop/src/renderer/use-add-site.hooks.ts | lines 90.3 br 93.1 fn 100.0 | uncovered lines: 1-12,156
- apps/desktop/src/renderer/use-app-version.hooks.ts | lines 88.89 br 100.0 fn 100.0 | uncovered lines: 1,13
- apps/desktop/src/renderer/use-create-website-form.hooks.ts | lines 96.91 br 100.0 fn 100.0 | uncovered lines: 1-5
- apps/desktop/src/renderer/use-delete-confirmation.hooks.ts | lines 68.42 br 100.0 fn 100.0 | uncovered lines: 1-5,15
- apps/desktop/src/renderer/use-find-in-page.hooks.ts | lines 55.63 br 100.0 fn 100.0 | uncovered lines: 1-62,158
- apps/desktop/src/renderer/use-import-handoff.hooks.ts | lines 72.0 br 100.0 fn 100.0 | uncovered lines: 1-6,20
- apps/desktop/src/renderer/use-import-website.hooks.ts | lines 91.89 br 93.62 fn 93.75 | uncovered lines: 1-11,168
- apps/desktop/src/renderer/use-live-views.hooks.ts | lines 63.77 br 66.67 fn 100.0 | uncovered lines: 1-24,61
- apps/desktop/src/renderer/use-loaded-sites.hooks.ts | lines 78.38 br 83.33 fn 100.0 | uncovered lines: 1-7,27
- apps/desktop/src/renderer/use-new-site-dir.hooks.ts | lines 96.77 br 100.0 fn 100.0 | uncovered lines: 1
- apps/desktop/src/renderer/use-product-screen.hooks.ts | lines 83.33 br 100.0 fn 100.0 | uncovered lines: 1,6
- apps/desktop/src/renderer/use-project-mutations.hooks.ts | lines 95.24 br 100.0 fn 100.0 | uncovered lines: 1-4,55
- apps/desktop/src/renderer/use-project-tabs.hooks.ts | lines 89.66 br 100.0 fn 90.91 | uncovered lines: 1-4,34,47
- apps/desktop/src/renderer/use-resources.hooks.ts | lines 90.0 br 100.0 fn 100.0 | uncovered lines: 1,20
- apps/desktop/src/renderer/use-runner-conversations.hooks.ts | lines 57.69 br 100.0 fn 50.0 | uncovered lines: 1-7,17-19,22
- apps/desktop/src/renderer/use-section-nav.hooks.ts | lines 96.18 br 100.0 fn 100.0 | uncovered lines: 1-5
