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

REPO: Jini only. HEAD = codex/w62-cov-cms-3 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/cms/src/forms/html/import-remote-submissions.ts | lines 100.0 br 96.36 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/html/retry-draft.ts | lines 92.86 br 93.33 fn 85.71 | uncovered lines: 21-23,62
- packages/cms/src/forms/notify-subscriber.ts | lines 98.13 br 92.19 fn 100.0 | uncovered lines: 186-187
- packages/cms/src/forms/portable-validation.ts | lines 100.0 br 99.08 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/reconcile-attachments.ts | lines 100.0 br 98.11 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/repo.memory.ts | lines 99.39 br 98.06 fn 100.0 | uncovered lines: 104
- packages/cms/src/forms/result-html.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/result-query.ts | lines 100.0 br 97.56 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/site/form-destination-manifest.ts | lines 100.0 br 95.65 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/site/form-file-storage.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 21-22,29-34,37-50,52-56
- packages/cms/src/forms/site/protect-existing-files.ts | lines 95.0 br 80.0 fn 100.0 | uncovered lines: 36-37
- packages/cms/src/forms/site/publish-content.ts | lines 89.29 br 38.46 fn 62.5 | uncovered lines: 64,77-81
- packages/cms/src/forms/site/rate-limit-profile.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 14-18
- packages/cms/src/forms/sql/form-delivery-repo.ts | lines 15.04 br 100.0 fn 0.0 | uncovered lines: 67-73,77-84,86-91,96-101,107-108,120-133,136-144,147-158,169-183,189-195,202-206,216-220
- packages/cms/src/forms/sql/form-pull-lease-repo.ts | lines 13.95 br 100.0 fn 0.0 | uncovered lines: 11-12,14-17,21-27,36-37,46-63,68-71
- packages/cms/src/forms/sql/form-submission-receipt-repo.ts | lines 33.33 br 100.0 fn 0.0 | uncovered lines: 24-31
- packages/cms/src/forms/stale-form.ts | lines 100.0 br 95.65 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/submission-email-validation.ts | lines 100.0 br 95.65 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/submission-evidence.ts | lines 100.0 br 79.41 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/submission-ip-retention.ts | lines 100.0 br 92.31 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/submit-service.ts | lines 100.0 br 97.75 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/tool-handlers.definitions.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/tool-handlers.submissions.ts | lines 85.15 br 71.05 fn 87.5 | uncovered lines: 35-39,41-44,57-58,101-102,140-141
- packages/cms/src/forms/write-service.ts | lines 100.0 br 99.1 fn 100.0 | uncovered lines: 
- packages/cms/src/fs-files/custom-root-store.ts | lines 97.5 br 96.97 fn 100.0 | uncovered lines: 130-131
- packages/cms/src/fs-files/native-folder-picker.ts | lines 100.0 br 89.47 fn 81.82 | uncovered lines: 
- packages/cms/src/fs-files/tool-registrations.ts | lines 70.97 br 60.0 fn 50.0 | uncovered lines: 82-83,91-96,106-113,162-170,172-177,200-202,222-223
- packages/cms/src/fs-files/write-files.ts | lines 94.38 br 87.69 fn 100.0 | uncovered lines: 61-62,127-129
- packages/cms/src/html/document-marks.ts | lines 100.0 br 96.43 fn 100.0 | uncovered lines: 
- packages/cms/src/html/site/export-html-policy.ts | lines 35.0 br 65.0 fn 42.86 | uncovered lines: 5-10,13-18,21-26,29-38,47,71-80
- packages/cms/src/html/site/safe-url.ts | lines 93.94 br 72.22 fn 100.0 | uncovered lines: 107-108
- packages/cms/src/html/site/source-edits.ts | lines 100.0 br 77.78 fn 100.0 | uncovered lines: 
- packages/cms/src/html/style-values.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- packages/cms/src/html/text-layout.ts | lines 100.0 br 94.87 fn 100.0 | uncovered lines: 
- packages/cms/src/listing/static-collections.ts | lines 96.77 br 68.75 fn 100.0 | uncovered lines: 96
- packages/cms/src/media/blob-store.object-store.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/cms/src/media/blob-store.selection.ts | lines 77.14 br 74.19 fn 88.89 | uncovered lines: 137-138,145,163-164,171-181
- packages/cms/src/media/chat-preview.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/cms/src/media/content-type-sniffer.ts | lines 100.0 br 98.91 fn 100.0 | uncovered lines: 
- packages/cms/src/media/convert-video-tool.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/cms/src/media/cover-image.ts | lines 100.0 br 97.71 fn 100.0 | uncovered lines: 
- packages/cms/src/media/media-service.ts | lines 95.4 br 99.0 fn 97.37 | uncovered lines: 493,495-513
- packages/cms/src/media/original-response.ts | lines 100.0 br 88.24 fn 100.0 | uncovered lines: 
- packages/cms/src/media/plugins/document-text/mammoth.ts | lines 100.0 br 76.92 fn 100.0 | uncovered lines: 
- packages/cms/src/media/replace-media-file.ts | lines 100.0 br 97.92 fn 100.0 | uncovered lines: 
- packages/cms/src/media/site-generation/generation-credentials.ts | lines 92.59 br 55.56 fn 100.0 | uncovered lines: 65-66
- packages/cms/src/media/site-generation/media-provider-registry.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4,65-66,75-87,90-100,104-107,114-123,126-135,138-141,149-166,169-175,177-178,181-184,186-188
- packages/cms/src/media/site-generation/provider-credential-save.ts | lines 100.0 br 72.73 fn 100.0 | uncovered lines: 
- packages/cms/src/media/site-generation/providers-tools.ts | lines 75.42 br 65.38 fn 52.63 | uncovered lines: 87,90-95,169-177,180-190,212-213
- packages/cms/src/media/site-generation/tool-registrations.ts | lines 98.35 br 86.49 fn 96.88 | uncovered lines: 77,79-80
- packages/cms/src/media/site-import/bindings.deps.ts | lines 100.0 br 100.0 fn 94.74 | uncovered lines: 
- packages/cms/src/media/site-import/bindings.ts | lines 82.76 br 80.0 fn 72.73 | uncovered lines: 53-57
- packages/cms/src/media/site-import/tool-registrations.ts | lines 96.09 br 89.02 fn 96.15 | uncovered lines: 212,257-260,372-376
- packages/cms/src/media/site-transform/image-ops.ts | lines 100.0 br 89.29 fn 100.0 | uncovered lines: 
- packages/cms/src/media/site-transform/tool.ts | lines 87.1 br 100.0 fn 75.0 | uncovered lines: 62-64,102-106
- packages/cms/src/media/site/analytics.ts | lines 61.54 br 33.33 fn 50.0 | uncovered lines: 5-9
- packages/cms/src/media/site/blob-write-bindings.ts | lines 93.75 br 100.0 fn 75.0 | uncovered lines: 37-38
- packages/cms/src/media/site/bootstrap.ts | lines 6.67 br 100.0 fn 0.0 | uncovered lines: 57-62,64-81,83-86
- packages/cms/src/media/site/chat-preview.ts | lines 55.56 br 16.67 fn 100.0 | uncovered lines: 24-29,33-34
- packages/cms/src/media/site/content-type-resolution.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,47-50,53-54,56-65,68-71,84-93
- packages/cms/src/media/site/derived-media-link.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,13-26
- packages/cms/src/media/site/duplicate-asset.ts | lines 78.15 br 47.62 fn 71.43 | uncovered lines: 231,233-234,243-245,252-254,278-281,295-307
- packages/cms/src/media/site/hydrate-blob-store-from-seed.ts | lines 100.0 br 94.87 fn 100.0 | uncovered lines: 
- packages/cms/src/media/site/import-media-entity.ts | lines 71.36 br 62.32 fn 85.71 | uncovered lines: 213-223,226-231,245-246,248-253,258-259,316-317,337-338,341-342,440-441,443-444,453,466-468,473-482,487-496
- packages/cms/src/media/site/import-video-conversion.ts | lines 60.0 br 38.89 fn 55.56 | uncovered lines: 63,115-119,123-134,143,146-153,162-166
- packages/cms/src/media/site/library-save-attachment.ts | lines 66.67 br 60.0 fn 60.0 | uncovered lines: 15,17-21,23-30,43-44,84-85,87-89
- packages/cms/src/media/site/list-pending-chat-attachments.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,44,53,57-65,79,82-85,89-94,96-101,104,107-109,113-115
- packages/cms/src/media/site/promote-chat-attachment.ts | lines 87.8 br 33.33 fn 71.43 | uncovered lines: 66-68,99-101,143-144,177-178
- packages/cms/src/media/site/provider-credential-batch.ts | lines 94.74 br 83.33 fn 100.0 | uncovered lines: 31-32
- packages/cms/src/media/site/provider-credential-store.ts | lines 86.96 br 74.79 fn 84.85 | uncovered lines: 78-83,179-183,187-189,199-202,209-210,214-217,224-225,337-338,488-489
- packages/cms/src/media/site/provider-credential-vault.ts | lines 93.14 br 81.69 fn 70.83 | uncovered lines: 60-61,67-68,132-134
- packages/cms/src/media/site/public-path.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/cms/src/media/site/publish-content.ts | lines 55.14 br 67.74 fn 41.38 | uncovered lines: 85-88,99-101,139-144,155-166,180-186,189-200,203-205,207-216,218-222,227-228,231-232,265-267,272-274,285-287,290,292-295,300-302
- packages/cms/src/media/site/purge-media.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-3,11-22
- packages/cms/src/media/site/rendition-access.ts | lines 81.58 br 69.81 fn 93.33 | uncovered lines: 212-215,232-240,252-255,299-300,365-366
- packages/cms/src/media/site/verify-published-media.ts | lines 96.72 br 84.0 fn 100.0 | uncovered lines: 67-68
- packages/cms/src/media/site/view-image-tool.ts | lines 30.47 br 100.0 fn 12.5 | uncovered lines: 112-114,117,119-124,135-137,145-155,158-164,171-180,188-194,196-200,202-224,226-233,237-241
- packages/cms/src/media/site/view-video-tool.ts | lines 75.13 br 48.19 fn 73.91 | uncovered lines: 63-65,73-74,76-77,88,104-107,115-120,148-150,152-158,167-168,173-174,177-178,194-204,227-228
- packages/cms/src/media/site/where-used.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 6,20-23,25-43
- packages/cms/src/media/tool-registrations.ts | lines 100.0 br 98.84 fn 100.0 | uncovered lines: 
- packages/cms/src/media/versioned-repo.ts | lines 100.0 br 98.63 fn 100.0 | uncovered lines: 
- packages/cms/src/media/video-frames.ffmpeg.ts | lines 100.0 br 98.48 fn 100.0 | uncovered lines: 
- packages/cms/src/media/video-frames.ts | lines 100.0 br 98.9 fn 100.0 | uncovered lines: 
- packages/cms/src/media/video-transcode.ts | lines 83.2 br 84.44 fn 86.67 | uncovered lines: 87,187,190-208
- packages/cms/src/navigation/menu-render.ts | lines 100.0 br 97.92 fn 100.0 | uncovered lines: 
- packages/cms/src/navigation/site/publish-content.ts | lines 68.97 br 77.27 fn 45.83 | uncovered lines: 66-73,76-85,87-90,119-125,159-160,163-164,169-177,189-193,285-286,333-337
- packages/cms/src/navigation/site/trash-aware-memory-menu-repo.ts | lines 97.01 br 100.0 fn 92.86 | uncovered lines: 89-90
- packages/cms/src/pages/authoring-html.ts | lines 100.0 br 94.74 fn 100.0 | uncovered lines: 
- packages/cms/src/pages/html-change-recording.ts | lines 85.45 br 36.36 fn 50.0 | uncovered lines: 47-49,82-83,109-110,116
- packages/cms/src/pages/html-document-store.memory.ts | lines 28.4 br 44.44 fn 28.57 | uncovered lines: 57-58,74-77,85-88,92-93,102-113,117-118,123-126,128-130,132-136,138-140,142,145-161,169-172,193-198,200-201,205-212,215,217-227,231-235,238-257
