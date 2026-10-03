# t04 honesty lines — Tovu verification

TestRunner(Direct). Inputs: explicit t04-commit dispatch, t04-honesty-lines brief, last agent_message in t04-honesty-lines.jsonl, current diffs, POST-WAVE step 4.

HEAD at report creation: `8e16871fea8f6d45eab4c3dbff79170fc8fa5514`. Verification exercised the dirty working tree, not HEAD alone.

Outcome: 10 passed, 1 failed; all 11 tests executed, none skipped. No commit created, no changes staged or source/test edits made by this verification. Each suite ran separately after acquiring a test-slot directory; every acquired slot was released. The dispatch requires all four suites to pass before commit; that gate failed.

## Commands and results

`env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks apps/website/src/assistant/__tests__/honesty-lines-search.test.ts`

Executed 4; passed 3; failed 1; exit 1. Test-file SHA256: `0569fb83aaaf337fa97efe54e09f339704a06d6d5df4b19e1366f2a45e2798c9`.

`env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks apps/website/src/assistant/__tests__/tool-search-keywords.operator-requests.test.ts`

Executed 2; passed 2; failed 0; exit 0. Test-file SHA256: `69e46daa4752ee07f15cd3c0796d136f7738294369008050c7b0f61ec30ac544`.

`env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks apps/website/src/features/trash/__tests__/tool-registrations.purge-ban.test.ts`

Executed 4; passed 4; failed 0; exit 0. Test-file SHA256: `aa9c82f0841956fab1e4f78b4668b11bdfa691ae1b3bb2b231c6ae74c8d82a10`.

`env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks apps/website/src/features/trash/__tests__/trash-list-items-honesty.test.ts`

Executed 1; passed 1; failed 0; exit 0. Test-file SHA256: `6d9d64a7595d6ac64aba5c9681a7e33bf56a76c57e8af3bb5cf2bc2e10983506`.

## Exact failure output

```text
✖ delete the footer menu ranks trash_item in the top 3 of the real catalog (170.251943ms)
  AssertionError [ERR_ASSERTION]: trash_item must rank in the top 3 for "delete the footer menu": menus_create_menu, content_read.menu, menus_assign_location
      at TestContext.<anonymous> (/Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/honesty-lines-search.test.ts:45:12)
      at async Test.run (node:internal/test_runner/test:1069:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:752:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '=='
  }
rc=1
```

Classification: IMPLEMENTATION_FIX_REQUIRED — menu deletion discoverability acceptance check fails. Root-cause ownership between current Tovu search vocabulary and Jini catalog descriptions is unverified; Jini was not inspected or modified. Suggested next assignee: t04 implementation owner. No flaky claim or identical failing-command retry.

## Left out

All four t04 files remain uncommitted:

- apps/website/src/features/trash/agent-tools.ts — exact manual-purge/automatic-removal honesty sentence.
- apps/website/src/assistant/tool-search-keywords.ts — identity_role_assign, identity_user_update_email, trash_list_items extensions.
- apps/website/src/features/trash/__tests__/trash-list-items-honesty.test.ts — new file.
- apps/website/src/assistant/__tests__/honesty-lines-search.test.ts — new file, failing menu assertion.

An additional comment correction in tool-search-keywords.ts changes @jini-ai/sqlite to @jini-ai/sqlite-chat. It is outside t04's three named keyword extensions; author is unknown, so it was left untouched.

`git diff --quiet -- apps/website/src/assistant/tool-search-keywords.ts apps/website/src/assistant/tool-search-doc2query.ts` exited 1. Keywords contains the above t04 extensions and unattributed comment correction. Doc2query has no diff. Shared index was empty at the final inspection.

## Evidence limits

No coordinator certification/hash inventory was supplied; the direct dispatch explicitly specified the four tests. Current file hashes are evidence only, not certification validation. No coverage tool/profile or mutation slot was requested for this bounded verification; coverage was not measured and no coverage-pass claim is made. E2E: N/A for this scoped dispatch. Acceptance convergence: 3/4 new search assertions; Trash wording assertion passed. Risks: menu deletion ranks the wrong tools; no all-green commit gate satisfied. Re-run all four required suites after the implementation owner resolves menu ranking.
