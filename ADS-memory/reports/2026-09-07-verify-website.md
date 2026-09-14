# TestRunner verification — 6 unattested audit-fix commits (apps/website)

Date: 2026-09-07
Scope: verification only, no source/test edits. Commits authored by a subagent stopped before
it could report; each shipped exactly one test file plus (except one) a source fix.

No `test-certification.md` exists for this ad hoc audit-driven work (not a TDD-tracked
feature/spec cycle), so the certification-hash gate in step 1 does not apply here — noted, not
skipped silently.

All runs used the project's real invocation (root `package.json`'s `test` script shape), one file
per `node --test` process, from repo root:

```
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test \
  --experimental-test-module-mocks <one file>
```

No `serve-command*.integration.test.ts` file was run. No process was killed or restarted. No
`git add`/commit/stash performed.

## Summary table

| Commit | Test file | Pass/fail | Actually pins the bug? | Notes |
|---|---|---|---|---|
| `c85e2e38` | media-rendition-gating-bypass.test.ts | PASS 15/15 | **Proven by test** | Real HTTP calls through the actual `createApp()` route (no mocks). 3 new tests (lines 446-525) directly exercise the id/slug alias-mismatch bypass: embed-by-id/fetch-by-slug, embed-by-slug/fetch-by-id, both asserting 404 for anonymous + 200 for an entitled member. Matches the diff's `resolveAssetAliases` fix exactly. |
| `63b8ab7c` | duplicate-site.integration.test.ts | PASS 16/16 | **Proven by test** | Real filesystem `duplicateSite()` call, real files written/read back. New test asserts `uploads/chat-attachments` is absent from the duplicate while `uploads/public-media.txt` is carried; a second test proves the exclusion is root-scoped (a nested dir named `chat-attachments` deeper in `uploads/media/` still copies). Both match the `cpSync` `filter` fix. |
| `ebe760d8` | serve-site-dir-pin.unit.test.ts | PASS 7/7 | **Proven for the primitive; does NOT prove the wiring** | Tests call `pinServedSiteDirIntoEnv()` directly and check downstream resolvers (`resolveChatAttachmentUploadDirectory`, `describeSiteBinding`, `buildDaemonSpawnEnvOverrides`) agree once it's called. **No test in this file, or anywhere else in the tree, calls `runServeCommand` and checks it actually invokes `pinServedSiteDirIntoEnv`** (grep confirms the only non-doc references to the symbol are this test file and its one call site in `serve.ts:245`). If that call site in `runServeCommand` were deleted, this suite would stay green — the exact "correct primitive, unwired call site" failure mode. The only test that *would* catch that wiring regression lives in the `serve-command*.integration.test.ts` family, which this run was ordered not to execute (hangs, orphans `tovu serve`). Flagging, not fixing. |
| `f208e5c8` | site-registry.unit.test.ts | PASS 20/20 | **Proven by test** | Directly asserts the corrected `switcherCompatible` computation in both directions: a `TOVU_SITE_DIR` outside `<cwd>/sites` → `false` (was hardcoded `true` before the fix — the old assertion is literally replaced), one inside → stays `true`, and the new `SITE_BINDING_NOT_SWITCHABLE_ENV` flag forces `false` even for an in-root path. Matches `isUnderSwitcherSitesRoot` + the env-flag OR in the diff exactly. |
| `ed10c0b7` | outbox-worker.test.ts | PASS 10/10 | **Proven by test** | New test injects a two-value fake clock (`12:00:00Z` then `13:00:00Z`) so `claimPending`'s read and the failure's `nextAttemptAt` read are distinguishable — the one thing the commit message notes every pre-existing test in the file couldn't do (fixed clock throughout). Asserts the row is NOT immediately due at the failure instant and IS due after the real backoff from that instant. Confirmed by reading `outbox-worker.ts:104`: `clock.nowIso()` (not the earlier `now`) is the anchor, matching the diff. |
| `28f46bbb` | media-slug-uuid-collision.test.ts | PASS 4/4 | **Proven live — TEST-ONLY is correct, the primitive fix already shipped upstream** | 0 source lines in `apps/website` because the actual control lives in `@jini-ai/cms/media` (a local workspace package, symlinked via `node_modules/@jini-ai/cms -> ../../../Jini/packages/cms`). Verified directly in that package: `MEDIA_SLUG_UUID_SHAPE_PATTERN` now excludes UUID-shaped slugs from `isValidMediaSlugFormat`, and `findMediaByIdOrSlug` resolves **id first, slug second** (`media-service.ts:482-485`). Verified the compiled `dist/media/media-service.js` contains the same logic and is NEWER than the `.ts` source it's built from (dist `19:11` vs src `19:10`, this Tovu commit at `19:12:35`) — the dist-staleness trap this repo is known to hit did not bite here. All 4 tests pass through Tovu's real composition root and public `/m/{id}/original` route, so both the primitive AND the Tovu-side wiring are proven, exactly as the commit message claims. |

## Aggregate

- 6/6 test files pass: 15+16+7+20+10+4 = **72 tests, 72 passing, 0 failing**.
- 5 of 6 commits proven by test in the strict sense (test would go RED if the bug were
  reintroduced at the code path it exercises).
- 1 of 6 (`ebe760d8`) is only **partially** proven: the exported function `pinServedSiteDirIntoEnv`
  is correctly tested in isolation, but nothing in the runnable suite (given the
  `serve-command*.integration.test.ts` ban) proves `runServeCommand` still calls it. This is a gap
  in test coverage of the wiring, not evidence the wiring is broken — `serve.ts:245` currently does
  call it (read directly, not via a banned test run). Recommend: if/when the `serve-command*`
  integration suite's hang is fixed, add or confirm an assertion there that a `tovu serve <dir>`
  boot leaves `process.env.TOVU_SITE_DIR === <dir>` (or equivalent black-box check), OR add a
  narrower unit test that stubs/spies `pinServedSiteDirIntoEnv` and asserts `runServeCommand` calls
  it before `bootSiteDir`.
- No flaky behavior observed (single run each, all deterministic — fixed clocks/env injection
  throughout, no timing-sensitive assertions outside the intentionally-mocked clock in
  `ed10c0b7`).
- No coverage tooling run (out of scope — verification-only dispatch, no coverage profile named in
  the dispatch).

## Full outputs

All six runs' full `node --test` output were plain pass listings (no failures) and are not
individually offloaded (each well under 500 lines). Raw captures used during this run:

- `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/5a5b6522-619b-4fea-ad76-314ed1ced7e5/scratchpad/c85e2e38.out`
- `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/5a5b6522-619b-4fea-ad76-314ed1ced7e5/scratchpad/63b8ab7c.out`
- `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/5a5b6522-619b-4fea-ad76-314ed1ced7e5/scratchpad/ebe760d8.out`
- `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/5a5b6522-619b-4fea-ad76-314ed1ced7e5/scratchpad/f208e5c8.out`
- `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/5a5b6522-619b-4fea-ad76-314ed1ced7e5/scratchpad/ed10c0b7.out`
- `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/5a5b6522-619b-4fea-ad76-314ed1ced7e5/scratchpad/28f46bbb.out`

(session-scoped scratchpad — not part of the repo's audit trail; this report is the durable
artifact)

## Coordinator classification

- No `IMPLEMENTATION_FIX_REQUIRED` items — no test failures.
- `COVERAGE_TRIAGE_REQUIRED` (advisory, not blocking): `ebe760d8`'s wiring gap above. This is a
  missing-test finding, not a failing-test finding — routed to Coordinator to decide whether a
  wiring-level regression test is worth adding now or deferred until the `serve-command*`
  integration hang is independently fixed.
- No touched-file coverage regressions evaluated (no baseline supplied in this dispatch).
