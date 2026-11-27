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

REPO: Jini only. HEAD = codex/w62-cov-agent-plugins-2 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/agent-plugins/src/connect/new-site-agent-plugin-tokens.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,4,7,11,13,29-32,36-38,40-50,56-63,66-75,86-87,93-102,104-110,113-121,130-135
- packages/agent-plugins/src/connect/plugin-credential-card.ts | lines 15.79 br 60.0 fn 25.0 | uncovered lines: 18,20-27,30-37,40-44,47-48,51,53-55,58-61
- packages/agent-plugins/src/connect/plugin-host/index.ts | lines 50.38 br 90.62 fn 33.33 | uncovered lines: 178-197,199-202,206-214,216-219,223-243,302-304,313-314,327-328
- packages/agent-plugins/src/connect/row-update.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/agent-plugins/src/connect/switch-on-saved-token.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 47-52,54-55,57-58,60-62
- packages/agent-plugins/src/connect/token-sign-in.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,30-31,41-54
- packages/agent-plugins/src/core/export-props.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/core/identity-namespace.ts | lines 100.0 br 96.25 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/core/plugin-display-name.ts | lines 14.29 br 100.0 fn 0.0 | uncovered lines: 5-10
- packages/agent-plugins/src/core/token-sign-in-list.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3,7-8,11-12,18-19,24-33
- packages/agent-plugins/src/ffmpeg-transcode/adapter.ts | lines 100.0 br 82.0 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/folder-zip-node.ts | lines 100.0 br 98.86 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/lifecycle/automatic-use-offer.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/lifecycle/automatic-use.ts | lines 100.0 br 96.24 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/lifecycle/credential-card-metadata.ts | lines 100.0 br 93.18 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/lifecycle/exports.ts | lines 100.0 br 98.37 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/lifecycle/host-tools/identity.ts | lines 97.14 br 83.33 fn 100.0 | uncovered lines: 56
- packages/agent-plugins/src/lifecycle/host-tools/memory-tools.ts | lines 3.57 br 100.0 fn 0.0 | uncovered lines: 10-19,27-60,62-71
- packages/agent-plugins/src/lifecycle/host-tools/provider-status-tool.ts | lines 100.0 br 81.82 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/lifecycle/host-tools/search-tool.ts | lines 97.52 br 81.48 fn 100.0 | uncovered lines: 240-241,265-266
- packages/agent-plugins/src/lifecycle/host-tools/skill-tool.ts | lines 21.4 br 40.0 fn 23.08 | uncovered lines: 43-49,54-56,61-67,73-76,93-108,112,114,170-172,174-175,186-189,200-202,212-217,221-225,227-228,233-246,297-299,317-318,325-341,343-346,352-362,376-380,382-389,391-392,394-397,522,5…
- packages/agent-plugins/src/lifecycle/host-tools/write-note-tool.ts | lines 16.67 br 100.0 fn 0.0 | uncovered lines: 9-15,25-47
- packages/agent-plugins/src/lifecycle/install.ts | lines 100.0 br 98.82 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/lifecycle/layout.ts | lines 96.2 br 96.77 fn 92.31 | uncovered lines: 114-116
- packages/agent-plugins/src/lifecycle/mail/adapter-descriptors.ts | lines 88.89 br 76.67 fn 92.86 | uncovered lines: 86-87,167-169,172-175,177-179
- packages/agent-plugins/src/lifecycle/mail/catalog.ts | lines 50.0 br 63.64 fn 50.0 | uncovered lines: 45-46,71-75,85-92,96-105,107-110
- packages/agent-plugins/src/lifecycle/mail/configuration.ts | lines 2.38 br 100.0 fn 0.0 | uncovered lines: 20-22,25-27,30-36,39-43,45-57,63-70,72-73
- packages/agent-plugins/src/lifecycle/mail/contribution.ts | lines 6.78 br 100.0 fn 0.0 | uncovered lines: 49-52,55-60,67-75,77-79,86-92,105-108,116-119,127-142,144-145
- packages/agent-plugins/src/lifecycle/mail/host-mailer.ts | lines 25.0 br 100.0 fn 0.0 | uncovered lines: 7-12
- packages/agent-plugins/src/lifecycle/mail/selection.ts | lines 1.64 br 100.0 fn 0.0 | uncovered lines: 14,18-30,32-33,37-44,48,50,54-67,70,72-84,86-87,89-90,92-93
- packages/agent-plugins/src/lifecycle/metadata.ts | lines 95.24 br 96.67 fn 100.0 | uncovered lines: 78-80
- packages/agent-plugins/src/lifecycle/search-projection.ts | lines 100.0 br 86.67 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/lifecycle/search.ts | lines 100.0 br 98.51 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/lifecycle/seed-bundled.ts | lines 100.0 br 98.33 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/lifecycle/set-enabled.ts | lines 98.53 br 97.37 fn 100.0 | uncovered lines: 68
- packages/agent-plugins/src/lifecycle/tools/capabilities.ts | lines 100.0 br 98.96 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/lifecycle/update.ts | lines 99.63 br 99.33 fn 100.0 | uncovered lines: 358
- packages/agent-plugins/src/react/AgentPluginDetailsModal.tsx | lines 100.0 br 40.0 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/react/agent-plugin-install-port.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/react/installed-skills-composer-source.ts | lines 100.0 br 76.47 fn 88.89 | uncovered lines: 
- packages/agent-plugins/src/react/use-agent-plugins.hooks.ts | lines 83.75 br 68.18 fn 57.14 | uncovered lines: 152-158,189,223-225,240-241
- packages/agent-plugins/src/site/activation-effects.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 5-7,17-30,32-35
- packages/agent-plugins/src/site/admin-surfaces/delivery-bindings.ts | lines 100.0 br 98.44 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/site/automatic-agent-plugins.ts | lines 80.85 br 75.76 fn 76.47 | uncovered lines: 92-93,170-182,206-208,226-236,244,248-253
- packages/agent-plugins/src/site/bundled-id-upgrade.ts | lines 100.0 br 92.59 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/site/customize-tool.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3,5-6,29-47
- packages/agent-plugins/src/site/deploy-split-activation.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/site/exports/diagnostics.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-3,12-18,23-34,39-40,43-48,51-56
- packages/agent-plugins/src/site/exports/runtime.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,6,8,35-40,45-59,64-73,79-89,94,97-110,115,117-124,129-142,145-152,157-173,176,179-183,189-199,201-220
- packages/agent-plugins/src/site/exports/source.ts | lines 88.1 br 80.0 fn 57.14 | uncovered lines: 23-24,70,73-74
- packages/agent-plugins/src/site/host-plugin-guidance.ts | lines 98.53 br 99.07 fn 100.0 | uncovered lines: 72-73
- packages/agent-plugins/src/site/install-tool.ts | lines 66.67 br 42.5 fn 55.56 | uncovered lines: 67-68,70-74,81-82,90-94,97-107,112-120,133,142,146-147,178-179,214-215,222-228,231-233,236-237,243-244
- packages/agent-plugins/src/site/install-upload.ts | lines 89.8 br 72.92 fn 83.33 | uncovered lines: 60-63,107-108,113-114,215-216,307-308,330-332,355,366-368,408-413
- packages/agent-plugins/src/site/memory-i18n.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-171
- packages/agent-plugins/src/site/memory.ts | lines 63.33 br 73.68 fn 69.23 | uncovered lines: 6-9,11-12,23,26-27,37-44,52,67-70
- packages/agent-plugins/src/site/plugin-memory.ts | lines 81.67 br 96.15 fn 73.33 | uncovered lines: 28-31,65-71
- packages/agent-plugins/src/site/provider-plugin-link.ts | lines 53.45 br 100.0 fn 90.0 | uncovered lines: 101-111,113-128
- packages/agent-plugins/src/site/set-enabled.ts | lines 100.0 br 93.33 fn 66.67 | uncovered lines: 
- packages/agent-plugins/src/site/uninstall-tool.ts | lines 84.44 br 81.82 fn 72.73 | uncovered lines: 119-124,150,266-279
- packages/agent-plugins/src/site/update-effects.ts | lines 100.0 br 83.33 fn 83.33 | uncovered lines: 
- packages/agent-plugins/vercel/object-stores/vercel-blob.mjs | lines 98.72 br 65.52 fn 76.92 | uncovered lines: 137,144
- packages/agent-plugins/vercel/targets/vercel.mjs | lines 100.0 br 94.96 fn 98.39 | uncovered lines: 
