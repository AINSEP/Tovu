DONE run V4 | branches 10/10 | tests run 4849 pass 4751 fixed 29 dropped 1 | weak fixed 2 | bugs 6 | left: none

# verify-1127 V4 — Codex coverage-test branches adm-1, adm-2, web-1..web-8 (Tovu)

Unattended cloud run, Opus (high), 2026-11-27 21:08–23:00 UTC. Brief: `ADS-memory/reports/cloud-runs/briefs/verify-1127.md`.
4 subagents (Opus high, one branch each: adm-1, adm-2, web-2, web-5); coordinator did web-1, 3, 4, 6, 7, 8, reviewed every subagent commit and did all pushes. No `--no-verify`, no force-push, no skips, no ts-ignore/`as any`, no threshold/config/baseline/.gitleaks.toml edits; packages/commerce and PageEditorChrome untouched; no codebase-memory tools.

## Pushed SHAs
| branch | final sha | change |
|---|---|---|
| codex/tv-w62-cov-adm-1 | 80110fef | 4 reds + tsc fixed, 1 prod fix, 1 test dropped (Jini bug) |
| codex/tv-w62-cov-adm-2 | 84bb9512 | prod fix (+6 base reds fixed), 1 test fixed, 1 strengthened |
| codex/tv-w62-cov-web-1 | bf912d18 | 1 tsc fix |
| codex/tv-w62-cov-web-2 | 888fe049 | prod fix, 1 tsc + 1 timing fix |
| codex/tv-w62-cov-web-3 | 84faa3c5 | 1 tsc fix |
| codex/tv-w62-cov-web-4 | f358e8f1 (unchanged) | nothing needed — no commit |
| codex/tv-w62-cov-web-5 | 15b91f36 | prod fix, 2 test fixes |
| codex/tv-w62-cov-web-6 | 6720433b | prod fix, 2 tsc fixes |
| codex/tv-w62-cov-web-7 | 06f1d8f2 (unchanged) | nothing needed — no commit |
| codex/tv-w62-cov-web-8 | 2b797e06 (unchanged) | nothing needed — no commit |

Counts in the first line = the branches' own changed test files, final runs (website node:test per branch; admin vitest). All 98 remaining reds are NOT Codex tests, or are Codex tests that cannot execute because their whole file crashes on the base too (listed per branch); every one was rerun on the unmodified base `integ/merge-28-2026-11-26` (or alone, for load-only timeouts).

## Setup / method (and deviations)
- Jini `integ/merge-28-2026-11-26` (d1ced6c5) `pnpm install --frozen-lockfile` + `pnpm -r build` (Node 24, green). Tovu `npm ci --ignore-scripts` root/admin/site-chat (admin without `--legacy-peer-deps`), `link:jini`, `tsc -p` contracts + sdk after link. One git worktree per branch under /home/user/wt (node_modules symlinked to the main checkout; all branches are test-only vs base, so the shared dist/links are the base's).
- Typecheck: files-only tsconfigs extending `tsconfig.tests.json` (website), `apps/site-chat/tsconfig.json` (site-chat files) and, for admin, the admin package `tsc -p apps/admin/tsconfig.json` (0 errors on both admin branches).
- **gitleaks: NOT run.** Downloading the gitleaks release binary was refused twice by this environment's permission classifier; I did not work around it. Substitute: the repo's own `development/scripts/check-secret-scan.ts` on every branch after staging — same 3 pre-existing hits as the base (PEM block in `site-backup/__tests__/credential-warnings.integration.test.ts:31`, an ADS-memory report, `provider-credential-store.rethrow.test.ts:60`), 0 new. Owner: run `gitleaks` on these SHAs, or allow the binary install.
- Coverage: scoped node `--experimental-test-coverage` / vitest `--coverage.include` on each job's FILES. "Folder mode" (every test in each FILE's dir + `__tests__`, plus branch tests) for web-3, 4, 6, 7, 8; "branch mode" (only the branch's changed test files) for web-1, web-2, web-5, adm-1, adm-2 because folder mode exceeded the 20-min cap. "before" is the brief's full-suite number, so a scoped "after" can be LOWER for files other suites cover — those are not regressions. Uncovered `1-N` at file top = import lines (node coverage artefact). Full per-file tables (file, before, after lines/br/fn, uncovered lines): `cloud-results/verify-1127-V4-coverage/<job>.tsv`.

| branch | files | any axis up vs before | 100/100/100 after | not loaded by scoped tests |
|---|---|---|---|---|
| tv-w62-cov-adm-1 | 90 | 53 | 36 | 0 |
| tv-w62-cov-adm-2 | 29 | 25 | 17 | 0 |
| tv-w62-cov-web-1 | 90 | 30 | 6 | 10 |
| tv-w62-cov-web-2 | 90 | 45 | 11 | 15 |
| tv-w62-cov-web-3 | 90 | 48 | 18 | 3 |
| tv-w62-cov-web-4 | 90 | 42 | 16 | 4 |
| tv-w62-cov-web-5 | 90 | 45 | 4 | 3 |
| tv-w62-cov-web-6 | 90 | 68 | 15 | 2 |
| tv-w62-cov-web-7 | 90 | 85 | 59 | 3 |
| tv-w62-cov-web-8 | 90 | 66 | 14 | 7 |

## Per branch

### codex/tv-w62-cov-adm-1 — 80110fef (subagent, Opus high; pushed by coordinator)
- 61 test files. First run: 1284/1372 (88 red in 15 files), admin tsc 19 errors. Final: tsc 0, 1287/1371 (84 red = 82 OLD red on the unmodified base in 12 files + 2 Codex tests that cannot execute because their whole file fails at render with `@jini-ai/admin screens need <AdminKitProvider>` on base too: Posts "links a post title to its editor…", AgentPlugins "opens the clicked plugin's files through the production Agent Plugins surface" — kept, UNVERIFIED).
- Red → why → fix:
  - `app-shell-chrome.unit.test.tsx` "does not apply the assistant conversation query on an unrelated panel": used the Posts screen, which throws the AdminKitProvider ENV error. Now routes to `/admin/import-export`, waits for its nav link `aria-current="page"`, asserts the URL query untouched, no dock status notice, no "no longer available" text (also removes an unsupported `exact` option).
  - `chat-cleanup` "uses the generic retention label … object property": **BUG fixed (prod, 1 line)** `apps/admin/src/components/AssistantDock/chat-cleanup-copy.ts:51` — `REASONS[reason] ?? …` returned `Object` for `reason = "constructor"`; now `Object.hasOwn(REASONS, reason) ? REASONS[reason] : "Not checked"`.
  - `use-page-editor.unit.test.ts` "replaces an id-based bookmark…": wrong expectation. With a clean editor and no interactive surface, `onBackLinkClick` lets the native link navigate (Jini `page-editor-recovery.hooks.ts:47-58`); the test now asserts `preventDefault` not called and the path unchanged, and its title says so.
  - `SiteExportTab.secret.unit.test.tsx` clipboard-retry test: **dropped — proves a Jini bug** (BUG 2 below).
  - tsc: `sites-config` (unsupported `exact: true` on `getByRole` removed; string name already exact), `SiteExportTab.expiry` (explicit `renderHook` generics), `Library` (`patch?.title`).
- Weak tests fixed: 1 (`use-push-to-talk` test title contradicted its assertion; renamed).
- Mutation spot-checks (all RED, reverted): `App.tsx` pass `route.query` on every panel → app-shell unrelated-panel red; `chat-cleanup-copy` fallback "Not checked" → "Unknown" → 2 red; media-dependencies `fakeGridPage` filter from `items` not `ordered` → "limits deep-linked results…" red.
- Secret scan: 0 new hits.

### codex/tv-w62-cov-adm-2 — 84bb9512 (subagent, Opus high; pushed by coordinator)
- 31 test files. First run: 474/490. Final: admin package tsc (`tsc -p apps/admin/tsconfig.json`) 0 errors (coordinator-verified); tests 483/490. The 7 reds are not Codex tests: 5 OLD (red on base: use-admin-execution-credential "preserves or supplies the operator message…", assistant-transport.ag-ui RUN_ERROR ×2, widget-embed-extension "a failed create-new in the Change dialog…", security-ports "describes a credential failure from the server message"); 2 in app-sites-section-visibility "Import & Export…" time out only in the 31-file parallel run (29/29 alone, green on base).
- Red → why → fix:
  - **BUG fixed (prod, 4 lines):** `apps/admin/src/integrations/jini-admin/security-module.hooks.ts:71-74` `SecurityModulePanel` rendered `createElement(SecurityModuleLoading)` without the `useAdminLocaleHook` it requires → loading fallback threw "useAdminLocaleHook is not a function". Hook is now a REQUIRED prop forwarded to the loading view. Fixed Codex's "shows a loading status…" + "resets the desktop owner password…" and 6 existing security-panel tests already red on base. Only tests call `SecurityModulePanel` today (live route uses `features/security/Security`).
  - `widget-embed-extension.unit.test.tsx` "saves edited media content only on the placement…": Columns number input re-clamps per keystroke (clear + "4" → 6); now sets the final value with `fireEvent.change`, asserts 4 before saving; expected saved content unchanged.
- Weak tests fixed: 1 (security loading status `/loading/i` → exact "Loading credentials…" + locale hook called with `({}, {})`).
- Mutation spot-checks (all RED, reverted): assistant-chats `setConversationPinned` `pinned ?? requested` → red; agent-navigation-entities `post` returns input id instead of `post.id` → red; security-module fix reverted → loading test red (TypeError).
- Secret scan: 0 new hits.

### codex/tv-w62-cov-web-1 — bf912d18
- 26 test files (11 site-chat, 15 website). First run: tsc 1 error (site-chat), tests 350/351 (1 file-level crash). Final: tsc 0, 350/351.
- Red → why → fix: `apps/site-chat/src/__tests__/SiteAssistantWidget.confirmation.test.ts:143` (tsc TS2769) — `React.createElement(SiteAssistantWidget, { useSiteAssistantWidgetHook })`: the widget's props parameter is optional, so `P` inferred as possibly-undefined, failing `P extends {}`, and the call fell to the Attributes-only overload. Fix: `createElement<WidgetProps>` with `WidgetProps = NonNullable<Parameters<typeof SiteAssistantWidget>[0]>`. Runtime test passes.
- ENV (not fixed, not a branch defect): `apps/site-chat/src/__tests__/site-assistant-transport.test.ts` crashes at load — `Incompatible React versions: react 19.2.8 / react-dom 19.2.7` (react-dom loaded from the linked Jini's pnpm store). Same crash on the unmodified base tree; `--preserve-symlinks` does not help. The 13 Codex lines in that file typecheck but were NOT executed here.
- Weak tests fixed: 0 (the 5 `assert.ok` added are narrowing guards next to exact `equal`/`deepEqual` checks).
- Mutation spot-checks (all RED, reverted): `admin-screen-link-tool.ts:144` untrimmed tab in query → 1 red; `site-assistant-errors.ts:33` drop `instanceof TypeError` guard → 1 red; `admin-frontend-owner.ts:14` cap 128 → 129 → 1 red.
- Secret scan: 0 new hits.

### codex/tv-w62-cov-web-2 — 888fe049 (subagent, Opus high; pushed by coordinator)
- 35 test files. First run: tsc 2 errors, 893/899 (one file crashed while the shared check script was being edited; 10/10 alone). Final: tsc 0, 904/908. The 4 reds are not Codex tests: 3 OLD, coordinator-verified red on the unmodified base (automatic-agent-plugins "50 relevant ids are discoverable…" note > 600 bytes; "explicit loader and guarded write refuse ask…"; outbox-retry-policies "processOutbox schedules a retryable form-delivery failure…" `lastError 'delivery-failed'` vs `'Error'`); 1 load-only timeout (automatic-agent-plugins "CLI onStarted retains the Codex prompt carrier…", passes in a 4-file run).
- Red → why → fix:
  - tsc `assistant/site/__tests__/visitor-slug-navigation.unit.test.ts:78`: request literal widened `caller` to string → `'anonymous-visitor' as const`.
  - **BUG fixed (prod, 1 line):** `apps/website/src/assistant/site/tools.ts:168` bodyJson text joined nodes with `" "` AFTER the per-node budget, so separators exceeded the documented `MAX_TEXT_CHARS` (4001 chars) → `.join(" ").trim().slice(0, MAX_TEXT_CHARS)`. Codex's "caps nested document text at 4000 characters including the separators" is the failing-first proof.
  - `visitor-ag-ui-resume.unit.test.ts` "a failed shutdown denial is reported…": `denyAndEnd` reports from a fire-and-forget `.catch`; the test now yields one `setImmediate` before asserting (assertion unchanged).
- Weak tests fixed: 0 (all 35 files reviewed).
- Mutation spot-checks (all RED, reverted): drop `.slice(0, MAX_TEXT_CHARS)` → red; drop `reportError` in `visitor-ag-ui-resume.ts:91` → red; drop empty-runId check `visitor-browser-invocation.ts:46` → red; `withoutOutboxTraceParent` returns the original event → 2 red.
- Secret scan: 0 new hits.

### codex/tv-w62-cov-web-3 — 84faa3c5
- 15 test files; first run: tsc 1 error, tests 234/234 pass. Final: tsc 0, 234/234.
- Red → why → fix: `deployments/static-publish/__tests__/verify.unit.test.ts:123` (tsc TS2322) — Codex declared a non-secret credential field `secret: false`; `DeployTargetFieldSpec.secret` is the literal `true`. Fixed by omitting it (same meaning). No runtime red.
- Weak tests fixed: 0 (all new tests assert exact values / messages / port-call counts; reviewed all 15 files).
- Mutation spot-checks (all RED, reverted): `form-file-purge.ts` `if (!kernel) return true` → `false` (form-file-renditions: 1 red); `host-overlays-dir.ts` `optional.env ?? process.env` → `?? {}` (host-overlays-dir: 1 red); `external-mcp-store.ts` normalize forces `transport: "streamable_http"` (external-mcp-store: 1 red).
- Secret scan (`check-secret-scan.ts`; gitleaks unavailable, see top): same 3 pre-existing hits as base, 0 new.

### codex/tv-w62-cov-web-4 — f358e8f1 unchanged (no fix needed, nothing pushed)
- 21 test files. tsc 0. Tests 320/321; the 1 red is OLD, not a branch test: `plugin-runtime/__tests__/unit/host-binding.unit.test.ts` "site import retains verified helpers and refuses changed bytes before evaluation" → `Package changed before loading.` from Jini `verifyPluginSnapshotIntegrity`; red identically on the unmodified base (the 28 Codex lines in that file are in other tests and pass). Not in merge-28's website red list (its shard did not run there).
- Weak tests fixed: 0 (one `assert.doesNotThrow` in host-binding is paired with the contrasting `assert.throws` on the SVG case; other `assert.ok` are guards).
- Mutation spot-checks (all RED, reverted): `site-file-request.ts:79` drop `|| '.'` → 1 red; `classify-routine-approval.ts:52` drop messageId equality → 1 red; `routine-run-handler.ts:168` canceled → failed → 1 red.

### codex/tv-w62-cov-web-5 — 15b91f36 (subagent, Opus high; pushed by coordinator)
- 30 test files. First run: tsc 2 errors, 526/528. Final: tsc 0, 528/528.
- Red → why → fix:
  - `source-control/__tests__/propose-credential-tool.test.ts` (tsc + red) "a credential save failure logs only fixed exchange metadata…": read `input.workspaceId`, but `VaultRepoPort.put` takes `{ record, expectedRevision }` → `input.record.workspaceId` (test was wrong).
  - `storage/__tests__/compaction-recovery.test.ts:261` (tsc `never.message`): a dead line after `assert.equal(outcome.status, "restored")` narrowed to never; removed the dead line, the real assertion stays.
  - **BUG fixed (prod, 1 code line):** `apps/website/src/features/theme/code-tier-asset-normalizer.ts:201` the `(src=)` pattern also matched inside `data-src=`, so a sibling `data-src="main.js"` was rewritten too (contradicts its own "Preserves every other attribute" doc) → lookbehind `(?<![\w-])(${attr}=)`. Codex's "rewriting a relocated script changes src but preserves data-src…" (flagged expected-red in its COMMIT-PLAN) is the proof.
- Weak tests fixed: 0 (all 30 files reviewed).
- Mutation spot-checks (all RED, reverted): export-preflight-copy `>` → `>=`; share-policy file-count `>` → `>=`; share-policy drop `totalBytes` from the max; remove the new lookbehind; read-status drop the aborted-signal guard; read-status rethrow the journal error.
- Secret scan: 0 new hits.

### codex/tv-w62-cov-web-6 — 6720433b
- 19 test files. First run: tsc 2 errors, tests 226/227. Final: tsc 0, 227/227.
- Red → why → fix:
  - `theme/__tests__/held-back-themes.unit.test.ts:197` (tsc TS2345) — `fs.openSync` mock forwarded `flags?: string|number` (undefined not an `OpenMode`). Mock now takes `...args: Parameters<typeof fs.openSync>` and forwards them unchanged; assertions unchanged.
  - `widgets/__tests__/unit/deps.unit.test.ts:208` (tsc TS2353) — passed `id` to `findPublishedPostBySlug`, whose input is `{ workspaceId, slug }`; removed the extra key (the test asserts the slug lookup).
  - **BUG fixed (production, 4 lines):** `theme/visitor-publication.ts:74` `publishVisitorPage` located `</body>` via `html.toLowerCase().lastIndexOf('</body>')`. `toLowerCase()` can lengthen text (`İ` → `i` + U+0307), so the index was one char early and the publication script was spliced inside the tag (`…</div><<script …>…</script>/BODY>`). Now `for (const m of html.matchAll(/<\/body>/gi)) bodyEnd = m.index` on the original string. Proven by Codex's `visitor-handles.unit.test.ts` "Unicode text before the closing tag…" (red before, green after). Regression run of all 11 test files importing visitor-publication: 575/577, the 2 reds are OLD (red on base identically: site-assistant-transport React ENV crash; `site-chat-stream.golden` "page.navigate to a published page…").
- Weak tests fixed: 0 (one `assert.ok(match, …)` is a narrowing guard before `JSON.parse`).
- Mutation spot-checks (all RED, reverted): Unicode test vs the original production code (above); `held-back-choice.ts:103` drop `err instanceof SyntaxError` fallback → 1 red; `preview-policy.ts:5` drop the `/i` flag → 1 red.
- Secret scan: 0 new hits.

### codex/tv-w62-cov-web-7 — 06f1d8f2 unchanged (no fix needed, nothing pushed)
- 14 test files. tsc 0. Tests 109/110; the 1 red is OLD, not a Codex test: `platform/db/__tests__/migration-manifest.test.ts` "GATE A: every SQLiteInteger column … bigint" → `blob_gc_journal.attempts: generated as PgInteger, not bigint`; red identically on the unmodified base (the 15 Codex lines in that file pass).
- Weak tests fixed: 0 (one `assert.ok(error instanceof …)` inside a rejects predicate, followed by exact name/message checks).
- Mutation spot-checks (all RED, reverted): `client/open-site-db-client.ts:125` delete `await content.close()` in the chat-open catch → 1 red; `migrations/0006_submission_ip_retention*.ts:17` missing `source_ip` returns instead of throwing → 1 red; `migrations/0042*.ts:29` `DEFAULT 1` → `DEFAULT 0` → 1 red.

### codex/tv-w62-cov-web-8 — 2b797e06 unchanged (no fix needed, nothing pushed)
- 21 test files. tsc 0. Tests 309/309 on the first run.
- Weak tests fixed: 0 (the `assert.ok` added are narrowing guards before exact checks).
- Mutation spot-checks (all RED, reverted): `site-dir/schema-guard.ts:63` drop the tag equality → 1 red; `site-dir/local-site-intent.ts:34` drop the unique-port check → 1 red; `dev-supervisor/dev-restart.ts:50` drop the request id from the reply filename → "an acknowledged request returns the supervisor's decision…" red (the mutated run then hung on its own poll timers until killed; source reverted).

## BUGs
Fixed here (each with the Codex test as failing-first proof): web-6 `theme/visitor-publication.ts` (`</body>` offset via toLowerCase), web-5 `theme/code-tier-asset-normalizer.ts` (`data-src` rewritten), web-2 `assistant/site/tools.ts` (text cap exceeded by separators), adm-2 `jini-admin/security-module.hooks.ts` (loading view without its required hook), adm-1 `AssistantDock/chat-cleanup-copy.ts` (prototype key → `Object` label).
OPEN (not fixed — outside Tovu): **BUG `Jini packages/admin/src/sites/transfer/use-export-password.hooks.ts:67-68` `copyPassword`** — after a failed copy, a successful retry leaves the "Couldn't copy the password. Copy it manually." alert beside "Copied". Proposed fix: `setPasswordError(copied ? null : labels.copyFailed)`. Dropped test (Tovu `apps/admin/src/features/sites/__tests__/SiteExportTab.secret.unit.test.tsx`, Codex adm-1): reveal the password; `writeText` rejects once then resolves; click Copy → `findByRole("alert")` has that text and the field keeps the password; click Copy again → `findByRole("button", { name: "Copied" })` visible, `queryByRole("alert")` null, `writeText.mock.calls` equals `[[password],[password]]`. Re-add it with the Jini fix. Also in `development/open-bugs.md`.

## Owner decisions
1. **ENV: admin `<AdminKitProvider>`** — AgentPlugins (38/38) and Posts (29/36) admin test files fail at render on the base with "@jini-ai/admin screens need <AdminKitProvider>" (linked Jini merge-28 vs Tovu tree). 2 Codex adm-1 tests there are UNVERIFIED until that is fixed.
2. **ENV: site-chat React mismatch** — `apps/site-chat/src/__tests__/site-assistant-transport.test.ts` crashes at load (react 19.2.8 vs linked Jini react-dom 19.2.7) on base too; web-1's 13 new lines there are typechecked but UNVERIFIED.
3. `SecurityModulePanel` now requires `useAdminLocaleHook` (adm-2 fix); only tests mount it today.
4. OLD reds surfaced in scoped runs (red on base, not touched): plugin-runtime host-binding "site import retains verified helpers…" (`Package changed before loading.`), migration-manifest GATE A (`blob_gc_journal.attempts` PgInteger), site-chat-stream.golden "page.navigate to a published page…", automatic-agent-plugins ×2, outbox-retry-policies `lastError`, plus adm-1's 82 / adm-2's 5 base reds listed above.
5. gitleaks binary install was refused in this container (see Setup) — run gitleaks on the pushed SHAs.
