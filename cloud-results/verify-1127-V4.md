PARTIAL run V4 | branches 6/10 | (interim — subagent branches adm-1, adm-2, web-2, web-5 still being verified) | left: codex/tv-w62-cov-adm-1, codex/tv-w62-cov-adm-2, codex/tv-w62-cov-web-2, codex/tv-w62-cov-web-5

# verify-1127 V4 (interim)

### codex/tv-w62-cov-web-1 — bf912d18
- 26 test files (11 site-chat, 15 website). First run: tsc 1 error (site-chat), tests 350/351 (1 file-level crash). Final: tsc 0, 350/351.
- Red → why → fix: `apps/site-chat/src/__tests__/SiteAssistantWidget.confirmation.test.ts:143` (tsc TS2769) — `React.createElement(SiteAssistantWidget, { useSiteAssistantWidgetHook })`: the widget's props parameter is optional, so `P` inferred as possibly-undefined, failing `P extends {}`, and the call fell to the Attributes-only overload. Fix: `createElement<WidgetProps>` with `WidgetProps = NonNullable<Parameters<typeof SiteAssistantWidget>[0]>`. Runtime test passes.
- ENV (not fixed, not a branch defect): `apps/site-chat/src/__tests__/site-assistant-transport.test.ts` crashes at load — `Incompatible React versions: react 19.2.8 / react-dom 19.2.7` (react-dom loaded from the linked Jini's pnpm store). Same crash on the unmodified base tree; `--preserve-symlinks` does not help. The 13 Codex lines in that file typecheck but were NOT executed here.
- Weak tests fixed: 0 (the 5 `assert.ok` added are narrowing guards next to exact `equal`/`deepEqual` checks).
- Mutation spot-checks (all RED, reverted): `admin-screen-link-tool.ts:144` untrimmed tab in query → 1 red; `site-assistant-errors.ts:33` drop `instanceof TypeError` guard → 1 red; `admin-frontend-owner.ts:14` cap 128 → 129 → 1 red.
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

