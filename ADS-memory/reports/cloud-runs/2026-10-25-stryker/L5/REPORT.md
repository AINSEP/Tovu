# L5 — Stryker measure-only: Jini chat logic, memory, search

Jini @ `cloud/overnight-1024-jini`. Stryker 9 + vitest-runner, TS 5, concurrency 3, perTest coverage, `StringLiteral` excluded, type checks off. No source or test edits. Full per-file tables: `table-chat.md`, `table-memory.md`, `table-search.md`.

## 1. Headline
| package | files | mutants run (valid) / total | killed+timeout | survived | no-coverage | score |
|---|---|---|---|---|---|---|
| chat (src/server, core, store, contracts; non-UI) | 94 | 8751 / 10529 | 6330 | 843 | 1578 | **72.33 %** (88.25 % of covered code) |
| memory | 8 | 1123 / 1364 | 967 | 156 | 0 | **86.11 %** |
| search (incl. `src/testkit/*`, shipped non-test code) | 12 | 2197 / 2699 | 1983 | 214 | 0 | **90.26 %** |

Ignored mutants (chat 1778, memory 241, search 502) are the excluded `StringLiteral` mutants. All three packages ran in full; nothing was cut for time.
Wall: chat 3 h 12 m (dry run 3.5 m; the last ~600 mutants were slow stragglers), memory 4 m 40 s, search 8 m, total about 3 h 25 m. Tokens about 0.15M.

## 2. Suspected source bugs
None found. Survivors below are all test gaps or equivalent mutants. I did not investigate beyond the survivors.

## 2b. MEASUREMENT GAP, 1578 chat mutants have no coverage but tests exist
Every file under `src/store/runtime/*`, `src/store/sql/*`, `src/store/legacy/sqlite/*`, `src/store/{sqlite,pglite,postgres}/index.ts`, `src/server/durable-runs/accept.ts`, and `src/core/durable-runs/run-lock.ts` reports 0 killed, 100 % NoCoverage. That covers durable-run-store (520), store.ts (327), run-ledger (207), legacy messages (167), and so on.
These files DO have passing tests (e.g. `src/store/runtime/__tests__/run-ledger.test.ts` is 21 tests, green, and `durable-run-store*.test.ts` exists). So this is NOT proof of untested code. Under Stryker's perTest coverage the tests were not attributed to these files. Likely cause, not verified: the tests load the SQL kernel through the `@jini-ai/db` alias and `better-sqlite3`/pglite peers, which bypass the instrumented sandbox modules. The 3.5 min dry run still ran 2785 tests green.
Consequence: the 72 % headline is **understated** and the whole persistence and durable-run store layer is **unmeasured**. The covered-code score of 88.25 % is the more honest number. Follow-up: rerun this subtree with `coverageAnalysis: "off"` (or `all`) and `mutate` limited to `src/store/**`. I did not have the time budget to do this at the end of the 4 h window.
Also excluded by the vitest config: `*.postgres.test.ts` (run only via `vitest.postgres.config.ts`), so postgres paths are not covered even when the files load.

## 3. Per-file table
See `table-chat.md` (94 files, worst first), `table-memory.md`, `table-search.md`. Worst covered files (score): chat `core/agentic/chat-capabilities.ts` 32.5, `core/persistence/title.ts` 64.1, `core/util/recover.ts` 71.3, `core/util/pointer.ts` 75.6, `core/util/validate.ts` 77.3, `core/user-text-redaction.ts` 78.1, `core/util/markdown-context.ts` 79.3; memory `entry-frontmatter.ts` 72.1, `note-store.ts` 83.2, `rule-body.ts` 84.4; search `contract.ts` 76.0, `tools.ts` 85.3, `testkit/conformance.ts` 85.4.

Survivors by mutator, chat (843): ConditionalExpression 271, Regex 213, EqualityOperator 62, MethodExpression 57, ArrayDeclaration 50, ObjectLiteral 48, LogicalOperator 41, BooleanLiteral 34, OptionalChaining 21, BlockStatement 15, ArithmeticOperator 10, ArrowFunction 9, UnaryOperator 9, AssignmentOperator 2, UpdateOperator 1.

## 4. Triaged survivors (a = real test gap, b = equivalent, c = noise)
### chat
- `core/durable-runs/policies.ts:2` `RECOVERY_WINDOW_MS = 5 * 60_000` → `5 / 60_000` survives. (a) No test asserts the constant or any behavior that depends on the 5 min window.
- `core/agentic/chat-capabilities.ts` (27 of 40 survive): (a) the tool input schemas (`required`, `additionalProperties:false`, `properties`) are never asserted. Mutants emptying them are all alive. Assert the exported schema with `toEqual`. These schemas are the tool contract the model sees.
- `core/user-text-redaction.ts` (33): (a) 64:* the URL-span exemption (`offset >= url.start && offset < url.end`). Every operator and boundary mutant survives, so a secret-like token at the edge of or inside a URL is untested. Redaction is privacy-relevant. Add boundary-position cases (token at start, last char, one past the end). 36–38 `entropy()` is never directly checked (counts/arith mutants live). 53 the `literalPrefix` collision loop has no test where the text already contains the prefix.
- `core/util/validate.ts` (55; 26 Regex): (a) 63 `<= MIN_HTML_LENGTH` boundary, 59 BOM-strip regex, 102/117/149/160 reserved-workspace-path checks (srcset flag, css text, `isLocalPathLike` guard) all flip to `true`/`false` with no failure. Path-reference validation is a guard, so it needs positive and negative cases per branch.
- `core/util/pointer.ts:31,49` (a): the `target === null || target === candidateFileName || !isSafeHtmlTarget` guard to `false` survives, as does `projectFileNames.includes(target)` to `false`. Need a test where the pointer is unsafe, equal to the candidate, or matches a project file. 48 `/\.html?/i` regex is probably (b), since the pointer is anchored elsewhere.
- `core/util/recover.ts` (31): (a) 22 the empty-identifier fallback, 28–36 `taggedOpenRe` scan loop. No test with several tagged artifacts where the *last* one must win, or with an unknown identifier.
- `core/persistence/title.ts` (73; 54 Regex): mostly (a)/(c). Anchor/quantifier mutants (`^`, `\s{0,3}`, `\s+` → `\s`, `https?` → `https`) survive, so there is no test for `http://` URLs, reference-link definitions, or runs of whitespace. 107:108 NoCoverage, the `[]` fallback for non-matching input.
- `server/durable-runs/recover.ts` (51): (a) 28–30 the result-event filters (`result.is_error===false`, `system/task_notification`) can be mutated to `true` with no failure, so a failed result event or a task_notification is not proven to be treated differently. 48 `run.message.events ?? []` is untested with `events` undefined.
- `core/durable-runs/continuation.ts` (17): (a) 20 `/execute.*delegated_tool/` and the `input && typeof input.toolId === 'string'` guard. 27 `completed` set computed from `tool_result` events. Missing a case where an unrelated tool or a non-string toolId must NOT be treated as delegated.
- `core/accepted-input.ts` (37): (a) 52 `event.kind !== 'ext' || name !== MID_RUN…`, to `&&` or `false` survives. 54 `data && typeof data.id === 'string' && typeof data.text === 'string'` to `true` survives. Missing malformed mid-run message events. 58:104 NoCoverage.
- Remaining files (`transcript`, `partial-json`, `turn-usage`, `history-tools`, `question-form/*`, `strip`) are all ≥ 85 %. Their survivors are mostly Regex anchors and `ArrayDeclaration`/`ObjectLiteral` defaults, classified (c)/(b) in bulk. I did not triage them individually because the budget was spent elsewhere.

### memory
- `note-store.ts` (71): real path-safety gaps, (a):
  - 428 `if (!isValidId(id)) throw new Error('invalid note id')` to `false` survives. No test that an invalid id is refused at that site (probably guarded earlier too, so possibly (b)). Confirm by feeding `../x`.
  - 162 the `isValidId` regex anchors (`^`/`$`), `id.length <= 96` to `< 96`, and `&& id.length` to `true` survive. No test for the 96-char limit or ids with embedded invalid chars.
  - 207 `containsPathSeparatorOrNul({ subdir })` guard to `false` survives. No test with a `/` or NUL in `subdir`.
  - 321 `contained = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))` to `false` survives. The symlink and escape containment decision is not pinned.
  - 446/484/511 `create` flag `false`→`true` survives (read paths silently creating dirs would go unnoticed).
  - 346/353/379/513 empty-catch/finally blocks emptied: error-swallow and cleanup behavior untested.
  - 518 `.md`/INDEX_FILE filter. 449/468 `err?.code`, `parsed?.enabled !== false` defaults.
  - 233 `capitalize`, 411–420 `slug` helper: (c) low risk.
- `entry-frontmatter.ts` (12): (a) frontmatter and key/value regex anchors, and `.trim()` on `name`/`description`/`type`, never tested. No CRLF or surrounding-space cases.
- `rule-body.ts` (7): (a) `.trim()`s and the empty-value skip (64) untested. Labeled-line regex anchors.
- `llm-provider.ts` (22): (a) 113 timeout validation, 149–150 URL `/v1` suffix regexes (trailing slash, `/v2`), 155 non-object response, 214 error-cause formatting, 423–424 stripping of a ```` ``` ```` fence around model JSON (mutated to `true`/`false` survives).
- `verify.ts` (19): (a) 88–90 token filter (`>= 4`, stopwords), 104 pass/fail status guard, 126–129 trim/lowercase on rule match. `extract-facts.ts` (14) and `extraction-log.ts` (11) are small residuals, unmapped.

### search
- `contract.ts` (6): (b)/(c). Five regex-anchor mutants on a provider-id label normalizer (235) and one empty `catch` (217).
- `registry.ts` (4): (a) 25 the `provider.id` string/pattern check to `false` survives. 36 `maxBatch < 1` to `<= 1`: boundary `maxBatch = 1` is not tested. 83 optional seed.
- `tools.ts` (24): (a) 121 `value.every(isString)` to `some` (an array mixing strings and non-strings is accepted). 129 filter-object `every(scalar)` to `some`. 144 `present` filtering of undefined optionals to `true`. Many `ObjectLiteral` survivors are `{ siteId }` argument objects replaced by `{}` (162, 235 and so on), which means the fakes ignore the siteId argument. Test with two sites.
- `indexer.ts` (31): (a) 144 `written && status === 'indexed'` counter, 162 empty-fresh early return, 183 `upserted + removed` to `-`, 215 `Math.max(1, maxBatch)` to `min`, 186 `targets.get({siteId})` arg to `{}`. The counters in the returned summary are not asserted exactly.
- `service.ts` (3): the `{siteId}` arg to `{}` ×2, and a nextCursor conditional.
- `testkit/conformance.ts` (96) and `testkit/memory-provider.ts` (43): this is the provider conformance harness and its in-memory reference provider (shipped, non-test source). Survivors are in highlight-range validation (129 `integral && start>=0 && start<end && end<=len`, every term alive) and typo-tolerance matching (59–70). (a) for the harness: a broken provider returning bad highlight ranges would not be caught, which weakens the conformance suite's claim.
- `fakes.ts` (5), `digest.ts` (1), `contribution.ts` (1): residual.

## 5. No-coverage ranges
- chat: see 2b. 1578 mutants across the 16 files listed there, plus these genuinely single-site ones: `core/persistence/title.ts:107`, `core/accepted-input.ts:58`, and 2 in `durable-run-subscription.ts`. Everything else with 0 % was a measurement artifact until proven otherwise.
- memory: 0 no-coverage mutants (100 % statement and branch coverage threshold in config).
- search: 0 no-coverage mutants (100 % per-file threshold in config). Note that its high coverage still yields 214 survivors, which shows 100 % line coverage does not mean strong assertions.

## 6. NOT RUN
- Chat UI: `src/react`, `src/embed-widget`, `src/testing`, all `.tsx` (per brief).
- Chat `*.postgres.test.ts` (excluded by config; postgres paths unexercised).
- `StringLiteral` mutants (1778 + 241 + 502): not run on purpose.
- Chat no-coverage store/durable-run files were *counted* but not usefully mutation-tested (see 2b).
- Everything else in scope ran.

## 7. What these numbers do NOT catch
Type checks are off, so type-invalid mutants are not filtered and may inflate or deflate counts. `StringLiteral` is excluded, so error-message and event-name contracts are not covered. "Killed" means any test in the package failed, so indirect kills count. The chat 72 % is wrong in both directions: the store layer is unmeasured, and non-store files are fine. Untested inputs are not detected, only weak assertions on existing code. UI, React, embed-widget and `.tsx` are excluded. Equivalent mutants are only partly separated by hand. The incremental file means a later run skips unchanged mutants.

## 8. Top 10 tests to write first (by risk)
1. memory `note-store`: path containment. Invalid ids (`../x`, `a/b`, 97 chars, uppercase), `/` or NUL in `subdir`, and a symlink escape through `containedConfigPath`/`resolveContainedDir`. Assert refusal at each site (lines 162, 207, 321, 428).
2. chat `user-text-redaction`: secret-like tokens at the exact start, end, and just past a URL span, and the high-entropy threshold (entropy value tested directly).
3. chat store: rerun Stryker over `src/store/**` with coverage mapping fixed (see 2b), then triage. About 1.5k mutants are unmeasured, including `durable-run-store`, `run-ledger`, and the SQL store.
4. chat `core/util/validate.ts` and `pointer.ts`: reserved-workspace-path references in `src`/`srcset`/CSS `url()`, unsafe or equal-to-self pointer targets, and the BOM and min-length boundary.
5. chat `server/durable-runs/recover.ts` and `continuation.ts`: result events with `is_error`, `task_notification`, non-string `toolId`, and `events` undefined. Assert the recovered output exactly.
6. chat `chat-capabilities.ts`: `toEqual` on the full tool input schemas (`required`, `additionalProperties`, `properties`).
7. chat `durable-runs/policies.ts`: assert `RECOVERY_WINDOW_MS === 300_000` and the exact boundary of the window.
8. search `tools.ts` / `indexer.ts`: mixed-type `filters` and arrays (every vs some), two-site isolation (`siteId` passed through), the exact `written`/`indexed` counters, and `maxBatch` clamping.
9. search `registry.ts` and `testkit/conformance.ts`: provider id pattern, `maxBatch = 1` boundary, and highlight ranges that are non-integer, negative, empty, or past the end must fail conformance.
10. memory `llm-provider.ts` / `verify.ts` / `entry-frontmatter.ts`: base-URL `/v1` and trailing-slash variants, fenced model output, CRLF and padded frontmatter, and the 4-char word cutoff and stopwords.

L5 DONE 2026-10-25T19:30Z, wall about 3 h 33 m, tokens about 0.15M.
