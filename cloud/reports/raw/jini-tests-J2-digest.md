# Lane jini-tests-J2 (Jini, vitest, Node 24, rerun after runner-flag fix)

## 1. Results
| package | exit | files pass/fail | tests pass/fail/skip | secs |
|---|---|---|---|---|
| chat | 1 | 293/1 (+1 skipped) | 4235/1/1 | 488 |
| admin | 0 | 211/0 | 2847/0/0 | 152 |
| daemon | 0 | 207/0 (+1 skipped) | 4069/0/1 | 106 |
| agent-runtime | 0 | 186/0 | 4294/0/1 | 53 |
| platform | 1 | 154/1 | 3075/1/6 | 43 |
| db | 0 | 93/0 | 735/0/0 | 166 |
| user-management | 0 | 96/0 | 1162/0/0 | 61 |
| desktop-host | 0 | 80/0 (+1 skipped) | 688/0/1 | 16 |
| agentic | 0 | 73/0 | 1555/0/0 | 19 |
| devops | 0 | 72/0 | 1097/0/0 | 33 |
| diagnostics | 0 | 58/0 | 956/0/0 | 14 |
| provider-plugins | 0 | 51/0 | 806/0/0 | 51 |
| oauth | 0 | 40/0 | 714/0/0 | 12 |
| http-kit | 0 | 28/0 | 579/0/0 | 9 |
| server | 0 | 27/0 | 471/0/1 | 38 |
| ui-kit | 0 | 19/0 | 225/0/0 | 11 |
| capability-providers | 0 | 18/0 | 198/0/0 | 6 |
| cookie-consent | 0 | 17/0 | 174/0/0 | 9 |
| sandbox | 0 | 17/0 | 132/0/0 | 7 |
| agent-plugins | 1 | 113/1 | 1594/1/2 | 49 |
| cli | 0 | 31/0 | 575/0/0 | 9 |

Totals: pass 29181, fail 3, skip 12 (sum of the rows). No type/lint step in this lane.

## 2. Failing tests
- chat: `src/react/features/chat-pane/__tests__/hooks/useChatPaneAgentControl.test.tsx:183 › useChatPaneAgentControl — chat.send_message goes through the pane guard › refuses to send while a run is streaming, with a reason instead of a silent bypass` — AssertionError: expected [Function] to throw error matching /streaming/ but got 'cannot send: A reply is still running…'
- platform: `src/__tests__/source-boundaries.test.ts:18 › platform source never references host source paths or aliases` — AssertionError: expected [ Array(1) ] to deeply equal [] (offender: packages/platform/src/__tests__/fetch-with-timeout.test.ts)
- agent-plugins: `src/lifecycle/__tests__/unit/load-supporting-files.unit.test.ts:59 › enable, load and supporting reads share admission after loading, including revocation and refused files` — AssertionError: expected { status: 'loaded', … } to deeply equal { status: 'already-loaded', … }

## 3. Type/lint errors
None (not run in this lane).

## 4. Classification
- chat failure: stale test. Test regex /streaming/ but the guard message is now 'A reply is still running. Stop it first.' (chat/src/react/features/chat-pane/rules.ts:204, copy key `streaming`). Cannot tell whether the copy or the test is the intended one; behavior (refusal with reason) works.
- platform failure: stale test / boundary-test false positive. fetch-with-timeout.test.ts:139 contains the string 'archive.tovu.zip', which matches the forbidden host token 'tovu' (char codes 116,111,118,117) in source-boundaries.test.ts. The fixture URL is the product-name leak the boundary test flags.
- agent-plugins failure: likely stale test. 'already-loaded' appears nowhere in non-test source under packages/agent-plugins/src (only in this test), so the controller no longer returns it; second load() returns status 'loaded' with full guidance. Not verified against the controller's git history.
- No environment failures. The earlier invalid run (minThreads/maxThreads RangeError) was a runner-flag bug and is not included.

## 5. Did not run
- Skipped by runner: 1 file skipped in each of chat, daemon, desktop-host; test-level skips: chat 1, daemon 1, agent-runtime 1, platform 6, desktop-host 1, server 1, agent-plugins 2.
- No timeouts (longest: chat 488s, under 1800s). All 21 packages ran to a runner summary.
