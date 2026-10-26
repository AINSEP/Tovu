# FU-A REPORT — Codex test findings F4/F7/F8, publish-backstop security fixes, visitor-confirmation review

## 1. Headline
- **Codex test findings fixed: 11 of 11.** F4: 4/4 (Jini). F7: 3/3 (Tovu). F8: 4/4 (Tovu). For every finding with a meaningful mutation, the fixed test fails against the mutation Codex described, and every mutation was reverted (§2).
- **Owner-approved security fixes a–d: all four done.** Tovu `cloud/fixwave-1025-F8`. Each one has a RED test commit that comes before its fix commit.
  - **a. `secrets_vault`:** now denied by name, whatever its columns are called.
  - **b. Private/per-install core tables:** 29 core tables are now denied by exact name. This includes `deployments`; F8's pin that it was allowed is gone. A new test classifies every table in the real migrated schema, so a future core table that nobody has classified turns the test red.
  - **c. Backup copies of credential/key/database files:** names like `.npmrc~` or `site.db.bak`, and bare `.pem`/`.key`, are now refused by both the typed-tree rule and the raw-file rule.
  - **d. Secret scan of file and folder names:** the scan now checks every tracked path and every path in history, before extension filtering and blob dedupe. Matched values are redacted in all its output.
- **Visitor-confirmation review verdict: SAFE.** `binding.executionId` is minted by the server and a visitor cannot choose it. It is now on `DYNAMIC_BINDINGS` with the trace in a comment. The RED completeness test is green. **No source bug.**
- **Source bugs found: 0.** Items a–d are hardening the owner approved, not regressions.
- **Process:** all work was done in this session, with no subagents. Wall time ≈ 25 min (23:35 → ~00:01 UTC). Roughly 0.25M tokens.

## 2. Per finding: test → mutation proof → commit

### Jini `cloud/fixwave-1025-F4` — commit `08297605`
| Codex finding | Test change | Mutation proof (reverted) |
|---|---|---|
| jwt-auth:176 (Medium, AP8): the "correct-length" cases were really 31 and 33 bytes | Takes the real signature, flips one byte, asserts the result is exactly 32 bytes, then asserts it is rejected. Also checks that signOut with it leaves the real session valid. | Removed `timingSafeEqual` (length guard only) → the new test **fails**. The old truncate/pad test it replaces still passed. |
| jwt-auth:219 (Medium, AP7): a malformed-token signOut was only checked for resolving `undefined` | New table of correctly signed bad-claim tokens that carry the genuine session's `jti` (missing sub, numeric sub, string exp, missing exp). After signOut, the genuine session must still verify. | Removed the `sub` validator → 2 tests **fail** (missing sub, numeric sub). |
| ws/edges:56 (Medium, AP3): malformed-channel cases only ever published on `'c'` | `delivered()` now also publishes on 5, `undefined` and `null`, using a test-only cast. | Removed `typeof obj.channel !== 'string'` → 2 tests **fail** (missing channel, non-string channel). |
| jwt-auth:187 (Low, AP4): 12 sign-ups only produced 2 residues | Replaced by 3 hand-signed, deterministic fixtures. Each one asserts its exact base64url residue (0, 2, 3) and that it verifies. | A coarse padding mutation (`'='`→`'A'` in the decoder) fails all three. It also fails every other token test, because signatures share the decoder. No mutation targets residue 3 alone, since Node's base64 decoder is lenient about padding. The value of this fix is that the residue set is now exact and asserted, not an extra kill. |

The capability-providers jwt-auth + ws suites pass: 89/89 (vitest; a stale `--maxWorkers` combination errors, so they ran without it).

### Tovu `cloud/fixwave-1025-F7` — commits `7585dedf` (tests) and `c94e818a` (review)
| Codex finding | Test change | Mutation proof (reverted) |
|---|---|---|
| content-target-inputs:266 (Medium, AP8): the selector and the foreign id were both `"x"` | Slug `"logo"` resolves to foreign id `"x"` → the input stays `"logo"`. A same-workspace positive case → `"x"`. | Guard dropped (`asset ? asset.id : selector`) → **fails**. |
| content-target-inputs:287 (Medium, F6.1): beforeLookup and authorize were recorded in separate logs | One shared log, asserted as a sequence: `before → auth → media-id`. | Moved `beforeLookup` after authorization → the new test **fails**. The old test passed against the same mutation (measured: 25/25). |
| daemon-access.unit:132 (Medium, AP1): denials only asserted status | Foreign-run, off-list, no-resolver and missing-bearer denials now assert the exact body and `nextCalls === 0`. | Mutated Jini `daemon/dist/run-credentials.js`: off-list body → `{}` **fails**; `NOT_FOUND` → `FORBIDDEN` **fails** (2 tests). |

Run result: `content-target-inputs`, `daemon-access.unit` and `mcp-ui-allowlist-completeness` pass 45/45.

### Tovu `cloud/fixwave-1025-F8` — commit `a838ec25` (Codex test findings)
| Codex finding | Test change | Mutation proof (reverted) |
|---|---|---|
| raw-row-contributor.ports:92 (Medium, AP7): a custom `read` replaced the port's recorder | The custom read records every call. The test asserts exactly the 4 permitted reads. | `if (!early)` → `if (true)` → **fails**. |
| typed-secret-card:165 (Medium, AP1/AP10): a catch-all accepted any rejection | No catch. Asserts `{changed:false,cancelled:true}`, zero emissions, zero permit calls and zero calls. | `prepare` throws an unrelated error when aborted → **fails**. The old test passed this via `.catch`. |
| secret-scan-guard.ports:198 (Low): partial message assertions | The full `err` arrays for tip and history-only leaks are compared, including the exact guidance text. The spawned CLI test compares complete stdout/stderr with newlines, plus the exit status. | Changed guidance wording → 3 tests **fail**. Dropped the guidance's leading `\n` → 3 tests **fail**. |
| backstop-policy.deny-table:72 (Low): the in-memory SQLite connection was never closed | `t.after(() => client.close())` is registered right after the open. | Resource cleanup only; no meaningful mutation. |

### Owner-approved security fixes (Tovu `cloud/fixwave-1025-F8`)
| Item | RED test → fix | Notes |
|---|---|---|
| **a + b** | `f8e4e967` (RED: 3 of 4 failing) → `8b4141db` | `BACKSTOP_DENIED_CORE_TABLES` is an exact-name, case-insensitive set checked in `checkRawTable`. The 29 classified tables are listed below. Plugin tables and look-alikes (`p_mail_suppression`, `x_workspaces`, `deploymentsx`) keep the generic rules. `backstop-policy.private-tables.unit.test.ts` asserts that the set of sendable tables in the real migrated schema equals a reviewed list of 20 content tables. F8's `deployments` allowed-pin is replaced by a benign anchor look-alike (`outboxed`) plus `deployments` → denied. |
| **c** | `840bec17` (RED) → `5afe9cf8` → `ca9b4f66` | `credentialBaseName()` (in file-tree-policy, exported) lowercases a name and strips stacked `.bak`/`.old`/`.orig`/`~`. It is used by `deniedFileNameReason` and by the raw `isPrivateRawName`. A new check after the extension rule, `deniedKeyOrDatabaseReason`, catches bare `.pem`/`.key`, `*.pem.bak`, `site.db.bak`/`~`/`.old` and `*.sqlite3`. Mutation: suffix stripping disabled → 2 tests fail. The first mutation of the raw base-name check **survived**: `checkRawFilePath` runs `checkTreePath` first, so most names were already caught there. `ca9b4f66` adds raw-only cases (`config.json.bak` and `.site-meta.json~` at depth) and that mutation now fails. |
| **d** | `b2fa3307` (RED: 6 of 6 failing) → `e47d8227` | Tip: `scanPathForViolations(relFile)` runs before the extension skip. History: `listHistoricalPaths` runs `git log --all -m --no-renames --name-only -z`, which gives every distinct path ever added or changed, independent of blob dedupe. Violations gain `line: "path"`. `redactPath()` replaces matched values with `[redacted]` in every reported file, content hits included. Mutations: redaction disabled → 6 fail; history path scan dropped → 2 fail. The real-repo regression and the spawned CLI test pass, so this repo's real history has no credential-shaped path. |

The 29 tables classified private/per-install in item b were measured with `openContentDb(":memory:")`; there are 100 tables in total, and 47 were allowed before this change:
- **Mail state:** `mail_suppression`, `mail_suppression_removals`, `mail_feedback_inbox`.
- **Consent:** `site_consent_heads`, `site_consent_revisions`.
- **Settings:** `setting_values_user`, `setting_revisions` (the audit log of before/after values).
- **Grants, audit and delivery queues:** `external_mcp_tool_approvals`, `agent_tool_attempts`, `form_delivery_jobs`, `form_delivery_plans`.
- **Install bookkeeping:** `domain_binding`, `publish_history`, `deployments` (no such core table exists; it is classified as an alias of the denied `deployment`), `plugin_activations`, `workspaces`, `database_write_watermark`, `site_title_preexisting_workspaces`, `change_set_items` (`change_sets` was already denied).
- **Derived search indexes:** `search_index_{retired,targets,watermarks}`, `post_search_document`, `post_search_fts{,_config,_data,_docsize,_idx}`.
- **Kept sendable:** `setting_values_global` and `setting_values_workspace` keep the existing `checkInstallationSetting` value rule.

**Owner may want to re-check** `workspaces`, `plugin_activations` and `site_consent_*`. These are judgment calls, and each one is a single entry in the set.

### Visitor-confirmation security review (F7, `c94e818a`)
Trace of `visitor-confirmations.ts:42` `toolId: binding.executionId`:
1. `visitor-confirmation-gate.ts:78` builds `binding.executionId` from `request.executionId`, where `request` is the `ToolConfirmationRequest` that Jini's `ToolExecutor` passes to `delegate.onConfirm`.
2. Jini `packages/daemon/src/tool-executor.ts:305` `openAudit()` mints it: `const executionId = randomUUID();`.
3. The visitor's entry point, `visitor-executor.ts` `invoke()`, calls `execute({ principal, run, toolId, input: structuredClone(input) })`. That call takes no id field. `createToolExecutor` gets only `{ now, delegate }`, with no id-factory override.

So no visitor-controlled field can reach `executionId`. **Verdict: server-issued.** It was added to `DYNAMIC_BINDINGS` (`assistant/site/visitor-confirmations.ts` → `binding.executionId`) with the trace as a comment. Without the entry, the RED completeness test fails as before: 1 failure, measured.

### Wider verification
- **Publish-content, site-backup and theme-publish suites, after a–c:** 1777 tests, 1776 pass, 0 fail, 1 skip that was already there.
- **`npx tsc -p tsconfig.json --noEmit`, after a–d:** exit 0.
- **`tsconfig.tests.json`:** 344 errors repo-wide, all already there before this run. **None** are in a file I touched.
- **Complexity (eslint `complexity: 10`) on the 3 changed source files:** 0 errors.
- **New warnings from this run:**
  - `sonarjs/super-linear-regex` on `BACKUP_SUFFIX_PATTERN`. The input is one path component, and the path is capped at 512 characters by `checkTreePath` before this runs, so the worst case is bounded and tiny.
  - The moved `isPrivateRawName` expression keeps its original `expression-complexity` warning.

## 3. NOT done
- No Stryker re-score of the touched files. The brief asked for a failing test per mutation, and those were done by hand (above).
- No residue-specific mutation for F4.4 (Node's base64 decoder is lenient about padding; see the table).
- The secret-scan path check uses `git log` paths. It does not cover paths reachable only from unreferenced objects. The blob scan never covered those either.
- I did not run the full Tovu or Jini suites, only the affected packages and directories.

## 4. Commits (all pushed; verified with `git log origin/<branch>`)
- **Jini `cloud/fixwave-1025-F4`:** `08297605`
- **Tovu `cloud/fixwave-1025-F7`:** `7585dedf`, `c94e818a`
- **Tovu `cloud/fixwave-1025-F8`:** `a838ec25`, `f8e4e967`, `8b4141db`, `840bec17`, `b2fa3307`, `e47d8227`, `5afe9cf8`, `ca9b4f66`

FU-A DONE 2026-10-26T00:01Z — wall ≈ 26 min, roughly 0.25M tokens.
