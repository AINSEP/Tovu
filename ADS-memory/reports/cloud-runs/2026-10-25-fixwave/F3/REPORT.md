# F3 — Jini mcp + agent-runtime (Stryker L3) + chat/memory/search (L5) fix wave

**SOURCE BUG FOUND + FIXED (top):** agent-runtime `isDeepSeekAuthFailureText` reported ANY mention of `DEEPSEEK_API_KEY` as "not authenticated" (qualifier regex self-matched inside the variable name). RED test `8c1c653b` → fix `5eea6ef7`. Details §2.

Jini branch `cloud/fixwave-1025-F3` @ **`36bd0ee2`** (40 commits on `origin/cloud/overnight-1024-jini` @ 3e2fbae8; push confirmed via `git ls-remote`). All Jini pushes succeeded; no format-patch fallback needed.

## 1. Headline
- **Tests added: 595** (per changed test file, unique test names at base vs HEAD via `vitest list`; **no test file lost tests**): mcp +170, agent-runtime +177, chat +135, memory +77, search +36. Test-only diff, plus 1 minimal bug fix and 3 behaviour-preserving CCN extractions.
- **Final suites green (measured):** mcp 1508/1508 (74 files), agent-runtime 4340 + 1 skipped (173 files), chat 3843 + 1 skipped (259 files, in the coverage run), memory 406/406, search 355/355. `tsc --noEmit` 0 errors in all 5 packages.
- **Source bugs: 1 found, 1 fixed.**
- **Coverage (v8, lines/branches):** memory 100/100, search 100/100, mcp all `src` files 100/100 (only pre-existing `__tests__/fixtures.ts` helpers <100 — test code), agent-runtime 100 / 99.94 (`claude-filesystem-policy.ts` 92.85→100 by F3; remaining gap `defs/claude.ts:139`, untouched), chat core 100 / 99.77 (`title.ts` 96.77→100 by F3; remaining gaps `turn-usage.ts:23` pre-existing, `assistant-client/*subscription.ts:62,79,86,94` untouched). Every non-UI source file F3 touched is at 100/100.
- **CCN > 10 in scope** (non-UI `src` of the 5 packages, eslint `complexity: 10`, 302 files): **3 → 0** (chat `collapseDeliveryReceipts`, `selectedAnswerText`, `turnUsage`; affected tests 185 + 132 green before and after; tsc clean).
- **Stryker:** 38 files re-scored, every one ≥ its lane score; see §3. Wall ≈ 2 h 25 m; tokens ≈ 0.5 M (rough).

## 2. Source bugs
1. **agent-runtime `isDeepSeekAuthFailureText`** (`src/auth.ts`). `DEEPSEEK_API_KEY && /auth|api[_ -]?key|missing|…/` — the qualifier's `api[_ -]?key` matches inside `DEEPSEEK_API_KEY`, so the conjunction was just "mentions the variable". The tailored classifier's null is authoritative for the auth probe, so a healthy deepseek probe that merely names the variable got `status: missing` + sign-in guidance. RED `8c1c653b` (`'DEEPSEEK_API_KEY loaded' → false` fails), fix `5eea6ef7` (drop the self-matching term; reasonix already omits it). Behaviour change: "DEEPSEEK_API_KEY is empty" (no failure word) is no longer flagged.

Design observation, NOT changed: `role-marker-guard` withholds only a COMPLETE role keyword; a prefix split across chunks (`"##"`, `" us"`) is emitted before the marker is recognized (`"## us"` reaches the UI; the forged turn after it is still dropped). Pinned as current behaviour with a comment in `role-marker-guard.test.ts`. Owner call whether partial prefixes should be held back too.

## 3. Per-file Stryker (score %, lane before → F3 after; same config: vitest runner, perTest, StringLiteral excluded, `--force`, mutate = touched files)
| package | file | before | after |
|---|---|---|---|
| mcp | server/tools/component-catalog-tools.ts | 64.3 | **100** |
| mcp | server/tools/run-tools.ts | 70.2 | **100** |
| mcp | server/tools/tool-catalog-tools.ts | 87.1 | **100** |
| mcp | server/message-relay.ts | 83.7 | **100** |
| mcp | server/resources/site-guide-resource.ts | 76.0 | **100** |
| mcp | federation/approvals/scope-option.ts | 80.0 | **100** |
| mcp | tools/ask-choice/question.ts | 89.3 | 95.9 |
| mcp | bin/serve.ts | 89.4 (3 NoCov) | 93.6 (0 NoCov; rest: main-module guard, option objects) |
| mcp | core/config.ts | 89.3 | 92.1 |
| mcp | core/tokens.ts | 88.4 | 91.5 |
| mcp | agent-install/install.ts | 88.0 | 90.0 |
| mcp | client/client.ts | 72.8 | 83.8 |
| mcp | federation/stdio/adapter.stdio.ts | 87.7 | 88.8 (101/139/140 equivalent: win32 parse ⊇ posix; redaction re-checks length) |
| agent-runtime | prompt-budget.ts | 69.5 | 93.8 |
| agent-runtime | auth.ts | 79.1 | 90.9 |
| agent-runtime | claude-filesystem-policy.ts | 73.2 (12 NoCov) | 86.6 (1 NoCov; later +coverage tests not re-scored) |
| agent-runtime | invocation.ts | 76.0 | 84.0 |
| agent-runtime | role-marker-guard.ts | 73.1 | 83.6 (211/239/264/266/293 judged equivalent) |
| agent-runtime | env.ts | 93.9 | 93.9 |
| chat | core/agentic/chat-capabilities.ts | 32.5 | **100** |
| chat | core/durable-runs/policies.ts | 50.0 | **100** |
| chat | core/user-text-redaction.ts | 78.1 | 91.4 |
| chat | core/accepted-input.ts | 86.6 | 90.2 |
| chat | server/durable-runs/recover.ts | 87.7 | 88.6 |
| chat | core/durable-runs/continuation.ts | 84.3 | 86.1 |
| chat | core/util/validate.ts | 77.3 | 86.0 (BOM regex equivalent: `trim()` strips U+FEFF) |
| chat | core/util/recover.ts | 71.3 | 79.6 |
| chat | core/util/pointer.ts | 75.6 | 78.7 (+2 guard tests after the re-score, not re-scored) |
| chat | core/persistence/title.ts | 64.1 | 71.8 |
| memory | entry-frontmatter.ts | 72.1 | 83.7 (+tests after, not re-scored) |
| memory | note-store.ts | 83.2 | 86.3 (+tests after, not re-scored) |
| memory | verify.ts | 89.1 | 92.0 |
| memory | llm-provider.ts | 89.1 | 89.6 |
| search | registry.ts | 96.0 | 97.0 |
| search | indexer.ts | 93.2 | 93.4 |
| search | tools.ts | 85.3 | 90.2 (catalog contract pinned after, not re-scored) |
| search | testkit/conformance.ts | 85.4 | 87.0 |

What these numbers do NOT catch: StringLiteral excluded, type checks off, perTest attribution (indirect kills count), equivalent mutants only partly separated by hand, files with tests added after their re-score are understated.

## 4. Anti-patterns seen most (feed AI Dev Shop)
1. **Call-history leak in mocks** — `toHaveBeenCalledWith` on a never-reset module mock matches ANY earlier call, so "omits key X" assertions passed on a previous test's call (mcp run-tools). Rule: `beforeEach(vi.clearAllMocks)` + `toHaveBeenLastCalledWith`/`NthCalledWith`.
2. **`toEqual` ignores undefined-valued keys** — "key omitted" checked with `toEqual`, so `if (x !== undefined) o.x = x` → always-assign survived (mcp run-tools/tool-catalog/tokens, search `present`). Rule: `toStrictEqual` or `Object.keys`.
3. **Unasserted declarative contracts (AP5)** — tool schemas/annotations (mcp ×4 files, chat `CHAT_CAPABILITIES`, search catalog). Rule: inline `toEqual` + validate good/extra-key/missing-required with a real JSON-schema validator.
4. **Guard masked by a later check** — a guard test whose input is ALSO rejected downstream proves nothing (pointer candidate-self with no such file; `https://` scheme rejected by the empty-segment rule; note-store invalid id with no file at the path). Rule: make the input otherwise-valid so only the guard can refuse it.
5. **Singleton / shortcut inputs (AP2)** — `[1]` lists for every↔some; verify cases that matched via the substring path instead of the word-overlap path under test.
6. **Object-literal `__proto__`** — `{'__proto__': …}` sets the prototype, never an own key; prototype-pollution guards need `JSON.parse` input.
7. **Defaults tested only at the primitive** — `writeSecretText` owner-only/createParent flags pinned in secure-write but not at the two callers' default ports.

## 5. NOT done
- L5 top-10 #3: Stryker re-run of chat `src/store/**` with `coverageAnalysis: off` (the ~1.5k unmeasured store/durable-run mutants). Not started — a full-suite-per-mutant run would not fit the remaining window.
- L3 #8 `federation/trust.ts`: existing `trust.pins.unit.test.ts` already covers the report's named cases (depth 8/9, acronyms, arrays); not re-scored, no tests added.
- `agent-runtime/launch.ts` (L3 84.1%): already ~45 characterization tests; not touched or re-scored.
- `mcp/federation/adapter.http.ts`: only the protocol-version fallback added; listener `{once}`, `finally` cleanup and pre-aborted-signal survivors left.
- L5 "remaining" chat files (transcript, partial-json, history-tools, question-form, strip) and memory extract-facts/extraction-log: not touched.
- Coverage <100 left (all untouched by F3): agent-runtime `defs/claude.ts:139`; chat `turn-usage.ts:23` (pre-existing branch next to my refactor), `assistant-client/*subscription.ts`.
- The 3 owner-decision pins in BRIEF.md concern Tovu tests, not in F3's Jini scope — nothing to do.
- Setup note for other Jini lanes: vitest 2 needs `--maxWorkers=2 --minWorkers=1`; `vitest list --json <file>` OVERWRITES `<file>` (use `--json=<path>`) — hit once, restored from HEAD, nothing lost.

## 6. Commits (Jini `cloud/fixwave-1025-F3`)
- `36bd0ee2` test(agent-runtime): fix TS18048 in the guidance hostName test
- `ff9e7c10` test(chat): title of a punctuation-only clause is empty (title.ts to 100% branches)
- `77b242af` test(chat): pointer guard refuses candidate-self and scheme targets even when such files exist
- `6fe6a2e1` test(mcp): only a trailing .cmd/.exe is stripped from the runner name
- `03a587e7` test(mcp): scopeOption omits the key when absent, keeps an empty scope
- `6c70e9c2` test(mcp): stderr tail redaction 4-char minimum and char-by-char split secrets
- `892d1085` test(mcp): isManagedProjectCwd one guard per case; transport discriminator wrong types refused
- `923a98a2` test(agent-runtime): probe exec defaults (SIGKILL, tmpdir) and no close-wait for finished children
- `cb90835a` test(agent-runtime): spawn env treats blank values as unset; perAgentEnv override order
- `702bca13` test(mcp): http adapter sends the client protocol version before negotiation and the server's after
- `7de233e2` test(mcp): exact uninstall argv (codex/kimi) and JSON install entries (cursor/copilot/opencode/openclaw/cline)
- `98985160` test(mcp): ask-choice question validation one broken clause per case with exact errors; answer matching tables
- `e921f49a` test(mcp): site-guide envelope check one clause per case; completed output rendering
- `554f52a7` test(mcp): client ref extraction per-pattern table (HTML/CSS/JS/srcset, kind by mime/ext anchors, externals, traversal) and textual-mime table
- `614c6911` test(search): pin the search tool catalog contract inline
- `b85ccb13` test(agent-runtime): claude-filesystem-policy to 100% branches (file root, imagePaths-only, non-object settings)
- `7a585d3c` test(memory): re-score survivors — id $ anchor with a real file, rel==='' containment, readConfig enabled defaults, frontmatter no-space/LF render, 4-char words without substring path
- `8e4e5139` refactor(chat): extract multiSelectLabels and addEventUsage (CCN 11 -> <=10), behaviour-preserving
- `cd9090c5` refactor(chat): extract withDeliveryState from collapseDeliveryReceipts (CCN 11 -> <=10), behaviour-preserving
- `a7801165` test(agent-runtime): re-score survivors — env short-circuit probes, JSON-text spacing, guidance hostName, marker spacing
- `ffe5ee47` test(chat): conversation title regex edges — http(s), filler anchors, reference definitions, heading indents, emphasis, escapes
- `4f96e373` test(chat): acceptedInputEvent refuses each malformed mid-run message shape
- `f07daa39` test(chat): artifact recovery — last tagged artifact wins, untagged/unknown/empty identifier fallbacks, identifier escaping
- `11722153` test(search): conformance kit catches each bad-highlight term and over-limit pages; exact-end edge passes
- `4f066280` test(memory): verify row-coverage thresholds (substring minimums, 4-char words, stopwords, 2 shared) and fail-closed statuses
- `6e365bac` test(memory): frontmatter CRLF/padding/anchors, render round-trip, /vN path detection, code-fence JSON parsing
- `d40d78a7` test(mcp): exact key sets for run-tools bodies, published descriptors and sanitized tokens; null token-file shapes
- `81d4713a` test(search): mixed-type list/filter refusals with exact messages, no undefined keys, site scope on every port call, mixed retry tally, registry boundaries
- `737d706f` test(chat): pin CHAT_CAPABILITIES manifest inline and recovery budget constants
- `64c9c53b` test(chat): durable recovery diagnostic filters per clause; delegated tool-call unwrap per clause
- `63fda81c` test(chat): pointer guard one-clause-per-case + 100-byte limit; validate min-length boundary and every reserved-path site
- `5221ecf5` test(chat): user-text redaction URL-span exemption edges and exact entropy thresholds
- `8e110914` test(memory): note-store containment negatives — invalid ids, 96-char limit, subdir reasons, symlink escape, read paths never create
- `73ca990f` test(mcp): stdio child cwd — Windows path/extension table, requested-vs-rewritten command
- `0d0ec1db` test(agent-runtime): claude version floor edges, fork/missing-path fail paths, runtime read paths
- `5eea6ef7` fix(agent-runtime): deepseek auth classifier qualifier no longer self-matches DEEPSEEK_API_KEY
- `8c1c653b` test(agent-runtime): auth classifiers one-alternation-per-case table (RED: deepseek flags any DEEPSEEK_API_KEY mention)
- `ac08f392` test(agent-runtime): per-char Windows quoting + exact limit boundaries; role-marker tail window/pending clamp
- `dd3eac5a` test(mcp): relay nonce gate negatives, secret-file default port (0600/owner-only/createParent), tokens __proto__ guard
- `e7470f19` test(mcp): pin tool descriptor contracts (inputSchema/required/additionalProperties/annotations), reset run-tools mocks, relay route/case tests

F3 DONE 2026-10-25T23:51Z — wall ≈ 2 h 17 m, tokens ≈ 0.5 M (rough).

## Run log
## 2026-10-25T21:34Z — STARTED
Jini branch cloud/fixwave-1025-F3 from origin/cloud/overnight-1024-jini @ 3e2fbae8. Tovu reports worktree @ 6e117dc3. Setup (Node 24, pnpm install, build) running. Plan: mcp tool-descriptor contract tests first (musts), then L3 top-10 security items, then L5 top-10.
## 2026-10-25T21:41Z — PROGRESS
Setup OK (Node 24.22, pnpm install, `pnpm -r build` done). Note: Jini vitest 2 needs `--maxWorkers=2 --minWorkers=1` (plain `--maxWorkers=2` → "minThreads and maxThreads must not conflict").
Pushed Jini e7470f19 (mcp tool descriptor contracts — the 4 MUST files), dd3eac5a (serve nonce gate, secret-file default port, tokens `__proto__`), ac08f392 (agent-runtime prompt-budget quoting/boundaries, role-marker-guard tail window). mcp full suite 1381/1381 green; all mcp source files 100% lines/branches (only pre-existing `__tests__/fixtures.ts` helpers <100%).
## 2026-10-25T21:54Z — PROGRESS
SOURCE BUG FOUND+FIXED: agent-runtime `isDeepSeekAuthFailureText` — qualifier `/auth|api[_ -]?key|…/` self-matches inside `DEEPSEEK_API_KEY`, so any mention of the variable (incl. healthy probe output) => "missing auth". RED test 8c1c653b, fix 5eea6ef7.
Pushed through d40d78a7: L3 top-10 #1-#7,#9 + MUSTs; L5 top-10 #1,#2,#4-#9.
mcp Stryker re-score (8 files): component-catalog 64.3→100, run-tools 70.2→96.4, tool-catalog 87.1→98.4, message-relay 83.7→100, serve 89.4→93.6, config 89.3→90.1, tokens 88.4→89.9, adapter.stdio 87.7→88.0 (before = lane L3 report).

## 2026-10-25T23:16Z — PROGRESS
agent-runtime round-2 re-score done; chat L5 re-score (1936 mutants) still running since 22:07; mcp round-2 started. Jini HEAD pushed through scope-option test.

## 2026-10-25T23:51Z — DONE
Finished inside caps. Jini HEAD 36bd0ee2 pushed and confirmed. Final report above.
