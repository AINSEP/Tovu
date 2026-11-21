Tovu has four executor-ready sheets. Jini has one ready sheet queued for a four-sheet batch. I drafted all three cloud tasks. The table covers the 24 prior PARTIAL rows, the three cloud rows, and the remaining disk-refusal work from 1449.

The source bases are Tovu merge-10 `0973a5fdc8` and Jini merge-10 `de4e555b9`. I used the dispatch’s waiver for the missing `AI-Dev-Shop` bootstrap. The architecture section files were also unavailable in the clone. I stopped the targeted reads with the remaining evidence gaps listed below. I changed no files and ran no tests, builds, installs, type-checks, or browser checks.

`W` means `apps/website/src`, `A` means `apps/admin/src`, and `P` means Jini `packages`.

## Dispositions

| ID | Disposition | Reason and evidence |
|---|---|---|
| 1319 | OPUS-CLOUD | The Recharts pin test checks the exact installed version, provider declarations, full integrity map, and actual file digests. The published tarball and packaged rendering are the acceptance evidence. O1 below. |
| 1321 | PARTIAL | `W/assistant/tool-catalog-query.ts:34–58` indexes the descriptor and search enrichment. The schema field at Jini `P/cms/src/media/agent-tools.ts:163` does not enter that path. The current metadata baseline already carries `image alt text` for `media_update_metadata`, and `tool-search-operator-requests.json:36` supplies an exact candidate query. The current full-catalog rank remains unverified. |
| 1322 | READY-FOR-CODEX | Combine-9 still records the generic-seam assertion red. The two combine-8 hits remain at `overlay-guidance-single-copy.unit.test.ts:33` and `soon-lock.unit.test.ts:89`. One is a historical comment and the other retells Tovu’s explicit host inventory inside a generic-seam test. T-VENDOR below. |
| 1323 | PARTIAL | The four L244 witnesses were not recovered. Each needs its original input and current revision-write path before a no-op behavior change can be scoped. |
| 1324 | PARTIAL | The process-log producer is confirmed under 1339. The remaining admin messages lack their originating requests or operation IDs. The shared admin failure owner derives copy from request metadata at `admin-failure.ts:101–108`, so treating the shared fallback as the producer would miss route overrides. |
| 1325 | RETIRE | B07 landed. Jini `afe6152a6` added the source opener. `P/platform/src/secrets/credential-sets/vault.service.ts:396–405` opens with the previous key and verifies the fresh seal before writing. Tovu `W/server/runtime/composition/site-key-recovery.ts:162–173` supplies the previous opener. Jini `vault.reseal-verification.test.ts:39,53` and Tovu `sealed-credential-discard.test.ts:167` cover the rotation path. |
| 1326 | PARTIAL | Member updates reach `W/features/members/member-admin-writes.ts:17` through admin and tool callers. `write-service.test.ts:497` covers a sequential note-only update. The live read/write interleaving and the other historically reported stores still need independent witnesses. The old count of 28 is unverified. |
| 1329 | RETIRE | `W/assistant/site/visitor-confirmation-gate.ts:38–42` uses explicit Unicode escapes and removes all 11 reported bidi controls. `visitor-confirmation-gate.unit.test.ts:114–127` supplies all 11 and asserts they stay out of the approval summary. This test exercises the Tovu projection at its actual Jini confirmation-gate boundary. |
| 1330 | PARTIAL | The obsolete accessor name was not found in the prior daemon/runtime review. The replacement endpoint binding, token owner, and authorization test remain unidentified. |
| 1332 | PARTIAL | Jini exports `createAssistantRunFinalizer` from `P/chat/src/server/run-finalizer/entry.ts:77` via `./server/run-finalizer`. Tovu still uses its own `W/server/runtime/composition/modules/run-finalizer/entry.ts`, including the type import in `assistant-chats.ts:35`. The historical C9/C10/C12 witnesses cover successor-daemon routing, rejected settlement leaving a row unwatched, and recovery relaunching a finished run after daemon loss. Those three cases need comparison against the current Tovu callers and Jini engine before any repoint. |
| 1335 | OPUS-CLOUD | `codex/jx-proto` `7bfd293f7` adds unsupported protocol-version refusal. The capability, resume, usage, unknown-request and provider behavior matrix still needs installed CLIs. O2 below. |
| 1338 | PARTIAL | The old hardcoded catalog hit is stale. Current `soon-lock.ts:14,33–34` consumes Tovu’s explicit host list and keeps the generic maturity read provider-neutral. The separate production-boundary report also named forms-tool copy and translated admin dictionaries. Their current occurrence-level evidence is incomplete. Keep both vendor guards. |
| 1339 | READY-FOR-CODEX | Both entry points await `identityReady` before daemon spawn. The process rejection guard hands the reason to Jini’s console logger, which projects it to safe class/code metadata at `P/core/src/primitives/logger.ts:125–132`. A specific seed failure loses its diagnostic in the default process log. T-SEED-LOG below. |
| 1342 | PARTIAL | The merge-10 hook report exists. The historical reported components have yet to be matched to current imports and the current gate, so there is no verified list of edits. |
| 1347 | RETIRE | The Tovu store forwards `send` options and its `store.unit.test.ts:925–948` checks redirect refusal. Jini `P/agent-plugins/github/source-control/github.mjs:74–85` sends the account probe through the guarded client with `redirect: "error"`. `github.test.mjs:71–76` verifies that a redirect produces one original request and zero requests to the redirect target. |
| 1358 | PARTIAL | Run-store, model-proxy, and memory-route disclosures lack current response assertions. The signed-out UI and AG-UI transport fixes cover different boundaries. |
| 1359 | PARTIAL | The coverage artifact yields four `Invalid URL` cases in `connect-tool.api-connections.unit.test.ts`. They cover a real-host wait/connected sequence, declaring-plugin card copy, a failed connected-card update, and default poll/wait settings. Match the current fixture URL and provider route before editing. |
| 1361 | PARTIAL | `codex/tv-own` `27f4407273` removes the obsolete Tovu architecture baseline pair and leaves one runtime pair. The historical Serve type-only edge and agent-runtime distribution warning still need separate artifact-level checks. |
| 1371 | PARTIAL | The old E2 entropy implementation was superseded. Current Jini chat uses `redactSecretShapes` plus `CHAT_RULES` at `P/chat/src/core/user-text-redaction.ts:2,23–44`. The accepted-request path masks before serializing at `durable-run-store.ts:392`. The original E2 header, authority, query, and prose cases have yet to be matched to the implementation that serves the current chat entry point. |
| 1373 | PARTIAL | Combine-10 proves package resolution and reports known desktop reds. It does not resolve the historical question about the `wave3/desktop-d0c` aggregate command propagating a required child’s failure. The old invocation and its replacement exit status are still needed. |
| 1375 | PARTIAL | Current chat still has short `sk-` and slash-dash Slack rules. `durable-run-store.accepted-request.test.ts:18–19` reads the serialized accepted request. This does not establish the old terminal-character, provider-prefix, diagnostics-export, and analytics cases across their respective consumers. |
| 1442 | RETIRE | `codex/tv-gate` `fa805fdab4` closes silent omission. `A/features/security/__tests__/CopyKeysDialog.unit.test.tsx:25–34` verifies a separate omitted count for each source. The branch retains the 50/source picker limit and the known-ID adoption path. |
| 1445 | READY-FOR-CODEX | `development/scripts/hygiene-audit.mjs:153–154` reads positional translation spreads. `A/lib/translation-entry.ts:11` uses `{ source, translated }`. T-I18N fixes that parser case. The deployment audit dictionary’s reported missing translations can be retired as false positives. Its positional-dictionary parser remains PARTIAL, as detailed below. |
| 1447 | PARTIAL | Jini `P/sidecar/src/json-ipc.ts:327–346` still constructs a logger and returns `HANDLER_ERROR`, `internal error`, and a correlation ID. The socket callback already exceeds the function limit. The intended host reporter and all transport consumers need confirmation before a sheet can name a safe split and preserve the wire contract. |
| 1449 | NEEDS-DECISION | **Should an ordinary disk-budget 507 stop minting and reporting an incident across the admin backup and import paths?** Recommend yes. Preserve status `507`, `INSUFFICIENT_STORAGE`, typed operator copy, the caller’s `error`/`message` field, and explicit 503 overrides. `codex/tv-bugs1` fixes ID minting but still reports before classifying the disk refusal at `admin-failure.ts:74–79`. T-DISK-PINS fixes the two stale contract assertions against that branch while the policy decision is pending. |
| 1450 | READY-FOR-CODEX | Jini `scripts/check-error-gate.mjs:107–125` writes the ledger before comparing and permits a scoped scan to replace the full ledger. J-RATCHET below. |
| 155 | NEEDS-DECISION | **May the first write or activation of an existing theme ask for approval once per trusted server run and theme, including ordinary edits?** Recommend yes, as in the cull’s ND-1. `theme/file-mutation-tools.ts:29–69` permits reversible edits and `tool-approval-policy.test.ts:80` pins separate activation approval. Require the same grant at both actual mutation paths. Denial must preserve bytes and the active theme, approval must cover later steps in the same run and theme, and a new run must ask again. |
| C10-A7 | OPUS-CLOUD | Combine-10 A7 records 66/66 and 13/13 green alone and shifting failures when files share a real Postgres database and truncate the same tables. The pool-close timeout is a separate failure mode. O3 below. |

## Executor job briefs

Copy the following block into each Codex job, including the queued Jini sheet when it is batched.

> Read these rules before every edit. Do exactly the named source and test edits. Preserve behavior outside the named correction. Write or identify the failing test first. Add only the specified test cases and mutations. New functions use `(required, optional = {})` under the args rule. Never remove, rename, or change an existing `_optional = {}` pad or the args rule. Inject hooks as props.
>
> No re-export shells, new dependencies, `eslint-disable`, `@ts-ignore`, `as any`, or `as never`. No unnamed helpers, wrappers, adapters, ports, interfaces, types, generics, options, flags, or layers. No speculative parameters or exports, additional pads, validation, guards, defaults, catches, retries, or fallbacks. Move statements and why-comments verbatim when a move is named. Add no comments except the named one-line note. Reuse existing Jini dependency bags and helpers. Keep vendor code in provider packages and server-framework objects out of Jini domain code. Keep `@tovu/sdk` in Tovu. Use `jini-*` naming in Jini. Record breaking changes on a `BREAKS:` line. The composition-deps gap and Jini API deprecation gate are dropped.
>
> Functions must be ≤50 lines and complexity ≤10. Record files over 500 lines in root `COMMIT-PLAN.md` and continue. Stop the affected sheet and continue the others if a named declaration is missing, a cast is required, either function limit is exceeded, or an unlisted production importer of a changed interface or moved declaration appears. Use `git grep -n -F '<symbol>' -- apps/ development/ packages/` for the named importer check. An additional test importer requiring the same repoint goes in `REFRESH.md`.
>
> No other repo-wide scans. No tests, builds, installs, type-checks, linters, or codebase-memory-mcp. `.git` is read-only. A lockfile change, new npm dependency, or new Jini package goes to OPUS-CLOUD. Combine runs red, green, and mutations. Before finishing, reread the diff, delete anything outside the sheet, and list deletions in root `COMMIT-PLAN.md`.

### J-RATCHET · Jini · merge-10 `de4e555b9` · ~1.8k executor tokens

**Tests first.** Edit `scripts/__tests__/check-error-gate.test.ts:10,13,187–197`. Extend the existing script import to `import { compareErrorGateDebt, errorGateConfig, findErrorGateViolations, sanctionedModules, updateErrorGateDebt } from '../check-error-gate.mjs';`. Add `mkdtempSync`, `rmSync`, and `writeFileSync` to the `node:fs` import and add `import { tmpdir } from 'node:os';` and `import { join } from 'node:path';`. Use one temporary ledger per case, removed with the existing Vitest test context’s `onTestFinished`. Cover only these cases.

- Full update with a new row and a worsened row returns 1 with ledger bytes identical. Mutation moves the write before the refusal.
- Scoped update whose apparent result is a shrink returns 1 with ledger bytes identical. Mutation drops scoped refusal.
- Full shrink writes only the surviving rows. First full update against an absent file creates the ledger. Mutation refuses a legitimate shrink or assumes the ledger file already exists.

**Source.** In `scripts/check-error-gate.mjs:21,107–128`, add `existsSync` to the existing `node:fs` import. Add script-local export `updateErrorGateDebt({ debtPath, current, scoped }, _optional = {})`. It returns 1 with stderr copy for scoped update. For a full update with an existing ledger, use the existing `compareErrorGateDebt` and return 1 with stderr copy if it has added or worsened rows. For an absent ledger or a permitted full update, use the existing serialization and write, retain the successful row-count message, and return 0. `current` is the existing `stored` array. Route the existing CLI update arm through this function using `scoped: argv.includes('--files')`. Keep `--list` precedence. Move the regular compare-and-report statements at `:116–125` verbatim into private `reportErrorGateDebt({ argv, stored }, _optional = {})` to keep `main` within its limits.

**Importers and ledgers.** The CLI self-entry at `:128` still calls `main`. The new update function has that module’s `main` and the named test as its only callers. No import repoints, package exports, API-baseline, injection-debt, or manifest changes. Keep the checked-in error-gate ledger bytes. No UI look. **STOP** if the ledger behavior requires changing the normal WARN/strict decision, the test needs a cast, or a pushed ref changes this script before execution.

**BREAKS:** `--update --files` and full updates that grow the ledger now return a failure and leave the ledger intact.

### T-VENDOR · Tovu · merge-10 `0973a5fdc8` · ~0.6k executor tokens

**Test first.** Identify the existing red at `W/features/api-connections/__tests__/vendor-neutrality.test.ts:82–92`, “no generic seam file names the first provider.” Its scanner test at `:77–80` remains the positive control. Mutation restores the two old hit lines and must fail the generic-seam assertion.

**Edits.** In `W/features/agent-plugins/__tests__/unit/overlay-guidance-single-copy.unit.test.ts:33`, replace `google-login's overlay` with `a plugin overlay` in the existing comment. In the same directory’s `soon-lock.unit.test.ts:88–92`, add `import { HOST_SOON_AGENT_PLUGINS } from "../../bundled-catalog.js";` and iterate `HOST_SOON_AGENT_PLUGINS` in place of the five-item inline array. Preserve the rest of the assertions. `soon-lock.ts:14` already imports that export. No production edits or importer repoints.

**Debt and look.** No ledger, export, manifest, or browser changes. **STOP** if the host list is empty or the combine red names additional hits. Keep the existing scanner scope and exact allowlist.

### T-SEED-LOG · Tovu · merge-10 `0973a5fdc8` · ~0.8k executor tokens

**Test first.** Update the existing default-sink case in `W/server/runtime/boot/__tests__/fatal-boot-failure.unit.test.ts:102–115`. Use a rejected `Error` whose message contains `identity seed failed` and a synthetic `password=` canary. Assert one console call with the existing first argument, a diagnostic retaining the seed-failure phrase, and absence of the canary. Preserve the installed listener and uninstall assertions. Mutation restores the class/code-only logger path and must lose the seed-failure phrase.

**Source.** In `W/server/runtime/boot/process-error-guards.ts:1–6,75–85`, replace the primitives import with `import { formatErrorForLog } from "@jini-ai/core";`. Add `import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";`. Remove the now-unused `consoleLogger` declaration. In `installUnhandledRejectionGuard`, replace the default sink’s body with `console.error(message, formatErrorForLog({ error: reason }, TOVU_ERROR_REDACTION_OPTIONS));`. Keep the injected sink’s arguments, listener registration, and uninstall logic. The existing formatter and host policy are used together at `admin-failure.ts:39–42`.

**Importers and debt.** Existing imports of `installUnhandledRejectionGuard` stay as written, including the entry-point import at `W/index.ts:26` and the test’s dynamic import at `:103`. No package exports, ledger, API-baseline, or manifest edits. No browser look. **STOP** if the named console logger has another use in this file or the formatter requires changing either process entry point.

### T-I18N · Tovu · merge-10 `0973a5fdc8` · ~2.1k executor tokens

**Test first.** Add `development/scripts/__tests__/hygiene-audit-translation-entry.test.mjs`. Use `node:test`, strict assert, a disposable fixture directory, and `execFileSync` from `node:child_process` to exercise the existing CLI with `--repo tovu=<fixture> --out <out> --skip-audit`. The fixture’s only indexed app file is `apps/admin/src/sample-i18n.ts`, with a three-locale object. Give English and French literal `Save` and `Cancel` keys. Spanish supplies `Save` via `...translationEntry({ source: "Save", translated: "Guardar" })` and omits `Cancel`. Assert that the generated `i18n-missing-keys.tsv` lists Spanish `Cancel` and has no Spanish `Save` row. Create the fixture index in the disposable repo during combine, with no operation on the executor checkout’s `.git`. Mutation restores positional-only spread parsing.

**Source.** Edit `development/scripts/hygiene-audit.mjs:141–169`. Keep `blockKeys` and its existing callers. Use these named private declarations in the same file to keep each function within the limits.

- `literalLocaleArgument({ node }, _optional = {})` contains the existing literal-call shape check from `:146–147`. `blockKeys` still recurses with the same argument and incremented depth.
- `readLocaleObject({ node, consts, depth, out }, _optional = {})` contains the existing property loop at `:150–167`. Send spread properties to `readLocaleSpread`. Ordinary property parsing stays verbatim.
- `readLocaleSpread({ expression, consts, depth, out }, _optional = {})` contains the existing spread handling at `:152–159`, with the translation-entry recognition replaced by one call to `readTranslationEntrySpread`. Preserve the same-file identifier branch, ordering, depth cap, and unresolved counting.
- `readTranslationEntrySpread({ node }, _optional = {})` recognizes the existing `translationEntry` call pattern. Preserve the positional read. For an object literal first argument, read literal `source` and `translated` property assignments using existing `propName`, `unwrap`, and `strOf`. Return the key and empty-value flag only for a literal source key. Compute the flag with the existing trim-to-empty check. Other unsupported shapes retain the existing unresolved behavior.

**Importers and debt.** No source import changes or new exported entry points. `findDicts:182` and `perLocaleFileDicts:209` keep their existing calls to `blockKeys`. No manifests, ledgers, or UI look. **STOP** if the focused fixture requires changing the audit invocation or production dictionaries, or if any named function exceeds a cap. The deployment positional dictionary is outside this sheet.

### T-DISK-PINS · Tovu · after `codex/tv-bugs1` `e4cb906a3f` · ~0.4k executor tokens

**Tests first and only.** In `W/server/inbound/admin-http/routes/publish-content/__tests__/import-errors.test.ts:25–43`, update the ID checks for “the shared backup-route failure sender preserves typed disk refusals and their diagnosis” and “disk budget refusal is HTTP 507 with its actionable typed message.” Copy the existing standard ID regex from the branch’s `unexpected-admin-escape-paths.unit.test.ts` into those two assertions. The pushed source already calls `mintToolErrorId` before returning the typed 507. Preserve the status, code, message, and response-shape checks. Mutation restores the pre-branch UUID mint for the shared response and must fail both assertions.

**Importers and debt.** No import, export, manifest, or ledger changes. No browser look for the assertion refresh. **STOP** if a newer parent already removes incident IDs from typed 507s. That policy change belongs to 1449.

## Batch and order

| Order | Job | Base and overlap | Sheets | Estimated executor tokens |
|---|---|---|---|---:|
| 1 | Jini queue | Jini `de4e555b9`. Tonight’s `jx-ci` changes workflows. Its report lists no change to the error-gate script. | J-RATCHET. Queue for the next Jini job with at least three compatible sheets. | 1.8k |
| 2 | `codex/r62t-bugs2-tovu` | Tovu merge-10 `0973a5fdc8` **after `codex/tv-bugs1`** for T-DISK-PINS. The other three sheets use merge-10 source anchors. Tonight’s other job reports list no overlap on those edit files. | T-VENDOR → T-SEED-LOG → T-I18N → T-DISK-PINS | 3.9k |

The Tovu batch has no dependency on J-RATCHET or a Jini package release.

## Exact cloud task text

### O1 · 1319 · Recharts published artifact

> On Tovu merge-10 `0973a5fdc8`, reproduce `recharts-package-pin.unit.test.ts` against a clean install of the exact published `@jini-ai/provider-plugins` version selected for the release. Use the registry tarball and record its version, registry integrity, and resolved plugin directory. An unpacked Jini checkout is insufficient evidence. Review the tarball’s `charts-recharts` `jini.plugin.json`, browser provider declarations, and complete integrity map, including licenses and notices. Independently hash the files against the map. If the tarball is internally consistent and the reviewed approval differs, update the existing `charts-recharts-source.ts` approval and any required exact dependency and lockfile pins together. Preserve the admission rules. If the tarball itself disagrees with its map, stop the Tovu pin change and report the exact files to the provider release owner.
>
> Run the existing package-pin, browser-provider admission, and admin integer-tick tests against the installed artifact. Mutate one approved digest and require rejection. Restore it and verify in Chrome that a saved chart renders through `plugin.recharts`, then verify the same chart from a packaged Electron payload. Report the artifact, changed pins, test results, and both visual checks. Keep publication and signing in the existing release flow.

### O2 · 1335 · ACP installed-CLI matrix

> Start from Jini merge-10 `de4e555b9` plus `codex/jx-proto` `7bfd293f7`. Identify the supported ACP CLI definitions shipped on that parent and record the actual executable and version used for each. Use disposable conversations and the existing Jini client. For every supported CLI record the v1 initialize response and the capabilities the client actually uses. Verify v1 proceeds and an unsupported protocol version stops before session creation or model discovery. Run and record each of these independently.
>
> 1. Capture advertised model, effort, session, and MCP capabilities. Record whether each relevant operation is attempted and whether the CLI accepts it.
> 2. Create a run and verify the same conversation resumes after a new daemon invocation. Record the durable reference and distinguish load, resume, and a fresh session.
> 3. Observe usage across two updates and a terminal frame. Record context occupancy, billable token deltas, and cumulative cost separately. Check the current USD consumer behavior.
> 4. Use the existing protocol harness for an unknown agent request and its request ID. Verify a terminal protocol response and that the run does not hang. Keep cancellation and ID-less error regressions as controls.
> 5. Verify one real Jini tool call, permissions, cancellation, and MCP delivery for each supported vendor. Record unsupported capabilities explicitly. Run an OpenCode pilot only if already approved and identify pilot results separately.
>
> Use synthetic tool data and redact credentials from recorded frames. Return a matrix with the exact versions, expected and observed results, and one named regression witness for each reproduced client defect. Any follow-up change starts with that failing witness. Keep new adapters, SDKs, dependency changes, and lockfile changes outside this diagnostic run.

### O3 · C10-A7 · Isolate the real Postgres dialect run

> Start from Tovu merge-10 `0973a5fdc8` after `codex/tv-ci` if editing its runner. Use disposable real Postgres 16 databases. Reproduce combine-10 A7 using the six `*.dialects.test.ts` files from `cloud-results/combine-10-tovu-a7-dialects-concurrent.txt`, with one shared `TOVU_CHAT_TEST_POSTGRES_URL`. Record per-file results and the evidence for cross-process table truncation. Run `durable-run-store.dialects` and `package-adapters.dialects` alone as controls against the 66/66 and 13/13 merge-10 results.
>
> Make the smallest runner correction for the configured real-Postgres path. Run the six files serially when they use the same database. If the runner already supports independent database URLs per process, use that existing mechanism. Keep the normal PGlite and SQLite matrix behavior. Add a failing runner witness first if changing checked-in runner code. Verify all six complete under the isolated or serial launch. Restore shared concurrent launch as the mutation and verify the original contention witness. Record an `agent-session-store` or run-ledger pool-close timeout separately with its file and stage. Report the commands, per-file outcomes, selection mechanism, and any remaining teardown failure.

## Remaining PARTIAL evidence

- **1321, 1323, 1324** — Measure full-catalog rank for the pinned `md-02` query before changing search terms. Recover the four L244 inputs and compare their before/after revision rows. Recover the request or operation IDs behind the remaining generic admin copy.
- **1326, 1330, 1332** — Force the member interleaving with the existing dialect fixture and identify each other store independently. Identify the current endpoint-bound token owner. Replay finalizer C9, C10, and C12 on current code and record production callers before choosing an engine migration or a narrow fix.
- **1338, 1342, 1358** — Verify the current production vendor hits, map the reported components to the current hook gate, and locate the three current disclosure boundaries with response assertions.
- **1359, 1361** — Refresh the four recovered `Invalid URL` cases against today’s fixture and route. Obtain a current source-versus-distribution graph for the historical cycle warnings.
- **1371, 1373, 1375** — Map the old E2 and chat-deps corpus to current intake, durable replay, diagnostics, and analytics. Identify the desktop command that used to return green on a required red and verify its replacement propagates failure.
- **1445, 1447** — The deployment dictionary really resolves its `{ entries: [...] }` values against `DEPLOYMENT_AUDIT_STRINGS` at `A/features/deployment/deployment-i18n.tsx:1759–1805`. The audit still needs a focused positional-dictionary witness that catches a genuinely short locale while suppressing the spurious `entries` key. For sidecar, name the existing host reporter and consumer set before revising the oversized socket handler.
