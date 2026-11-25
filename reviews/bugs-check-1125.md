DONE 11/21/6; NEEDS-OPUS 4

# Check of the six bug-fix plans `plans/bugs-1125/*` (42 sheets)

Reviewer: Software Architect (Opus, high). I read `AI-Dev-Shop/agents/software-architect/skills.md` (v2.3.2, 2026-11-05) first and applied it in design-gate mode. In that mode the review checks boundaries, contracts, test seams and parallel-slice ordering, and assigns no post-code findings. Read-only: no builds, tests or codebase-memory tools were run. Four Sonnet read-only verifiers, each under 25 calls, checked anchors with `git show` and `git grep`. I re-checked every security claim and every claim that changed a verdict myself.

**What was checked against what.**
- Bug code: Tovu and Jini `origin/integ/merge-23-2026-11-25` (Tovu `6ace8e8fb`, Jini `50f8dfcd9`). These are the same SHAs the plans used.
- Bug list: `origin/codex/tv-bugs-1125:development/open-bugs.md`. Its header says 45 STILL OPEN, verified against Jini `7727d518c`.
- Extraction refs: Jini `w3-r2allj`, `r3-w1aj`, `r3-w1bj`, `adm-dom2-j`, `r2y-ext-w1j` and `p411-j`; Tovu `tv-adm-dom2`, `tv-r3-w1b`, `tv-w2all`, `tv-w3-ext-w1x`, `tv-w3-ext-a` and `tv-w3-p4mounts`.

**Counts.**
- Verdicts are given per sheet: 11 APPROVE, 21 FIX, 6 REJECT, 4 NEEDS-OPUS. Each NEEDS-OPUS sheet is written out in the Appendix.
- The "51 bugs" headline counts **7 bugs twice**, because they appear in two plans: B226, SC-permanent-delete, FIX 19, H1052, H1115, H1122 and H1995. H1440 is skipped by two plans and built by a third.
- Five of the six REJECTs remove those duplicates. The sixth is a bug that is already fixed.

**Spot-check result.**
- Every security bug is real at merge-23: H1193, B115, B272, B239, the MCP value echo, the reauth permission, B170, B259, B226, SC-delete, H1005, H1122 and the site-update error text.
- Every data bug is real: B270, L079, FIX 19, H1970/H1973 and H1115. H1052 is real too.
- Media bugs O1731, O1732, O1733 and c21 are real.
- Of the admin, chat and rules bugs, every item spot-checked is real except **O1751, which is already fixed**.
- The plans' root causes are right everywhere except H1122, where the plan is incomplete.

Path prefixes used below: `W/` = Tovu `apps/website/src/`, `A/` = Tovu `apps/admin/src/`, `D/` = Tovu `apps/desktop/src/`, `J/` = Jini `packages/`.

---

## Rules applied to every sheet (coordinator: paste into each Sol dispatch)

1. **Base.** Build on merge-24, after the extraction lands. Re-find each anchor by its **symbol name**, not its line number. Several line numbers in the ledger are stale: B226 `verify.ts` is `:136-148`, not `:135`; site-update `tools.ts` is `:92`/`:106`, not `:73-74`.
2. **Tests.** A new test file is allowed wherever a plan names a file that does not exist yet. Record each mutation in `COMMIT-PLAN.md`, as the plans say. Follow the honest-testing rules: never soften an assertion; when a pinned assertion encodes the bug, rewrite it to the corrected behavior and name it in the commit.
3. **Function size.** Never grow a function past 80 lines or complexity 10. `registerWorkspaceChatIpc` (~110 lines) and `initSiteDir` (~70) are already at or over the limit, so add a helper rather than adding lines inline.

---

## sec.md — security (11 sheets)

| Sheet | Verdict | Exact fix text |
|---|---|---|
| 1 H1193 desktop default password | **FIX** (owner gate, Q2) | Do not build until the owner answers Q2. `W/features/identity/first-owner-password.ts:3-5` records owner ruling **B213**: "the desktop app keeps the shared starter password … not a bug". The sheet never mentions it. If the owner chooses to fix (the recommendation), apply the sheet with these corrections. **(a)** Always use `--create-input-stdin`, with `{ adminPassword, agentPluginTokens }` in the existing `initStdinPayload` envelope (`D/site-dir-store.ts:304-306`). The token-only branch becomes dead; delete it, and keep the CLI's `--agent-plugin-tokens-stdin` flag. **(b)** The generator is a new seam on the same input object as `spawnFn`. Its production binding is `() => randomBytes(24).toString("base64url")`. Add an assertion that the output passes `validatePasswordPolicy` from `@jini-ai/user-management/server`. **(c)** Move the new branch into a `buildInitInvocation({ input, generateAdminPassword }, _optional = {})` helper so `initSiteDir` stays at or under 80 lines. **(d)** Rewrite the five argv pins to the stdin form: `D/site-dir-store.test.ts:165,331,386` and `D/agent-plugin-tokens.test.ts:134,158`. **(e)** `D/…/smoke-packaged-chat-gate.ts:288` creates a site with no password. If that smoke signs in with `tovu-dev`, give it an explicit password instead. **(f)** Rewrite the doc comment in `first-owner-password.ts` to state the new rule. |
| 2 B115 remainder | **FIX** | Confirmed: 3+6+4 = 13 handlers at `D/workspace-chat-ipc.ts:167-182` lack `assertTopFrame` (signature at `:90`). Do not add 13 inline calls to the 110-line registrar. Add a local helper, `topFrameOnly(handler)`, returning `(event, ...args) => { assertTopFrame({ event }); return handler(event, ...args); }`, and wrap the 13 registrations with it. Change nothing else. |
| 3 External MCP (4 parts) | **NEEDS-OPUS** | Part 3a (OAuth callback) is a port-contract change across two repos and both adapters, so it goes to Opus: see **Appendix A1**. Parts 3b–3d are Sol commits with these fixes. **3b:** the owner is **Jini only**; the old Tovu rules file no longer exists at merge-23. In `J/admin/src/screens/settings/external-mcp-tool-picker-rules.ts`, change `:240` to `applyDefaults = allowedToolNames === undefined`. Make the other `parseSavedToolNames` consumers at `:286-300` and `:406-414` use the same undefined-vs-`""` distinction. Also fix `toolSurfaceSignature` in `hooks/use-external-mcp-tool-picker.hooks.ts:82`. Before editing, verify that the Tovu roster sends `""` for a persisted empty grant. If it does not, stop. The witness is the existing todo at `A/features/settings/hooks/__tests__/external-mcp-picker-reopen.unit.test.tsx:64`. **3c:** as written. The echoes are confirmed at `J/mcp/src/federation/hosted/store.ts:88-92` and `store-oauth-fields.ts:118-121`. First grep the tests for pinned "is not supported"/"expected one of" copy and update those pins. **3d:** `requireToolPermission` is **not** in `W/assistant/tool-registrations.ts`. Import it from `@jini-ai/cms/core`, as `W/assistant/mcp-federation/registrations.ts:7` does. Add `authorize` as a **required** member of `ExternalMcpReauthToolDeps` (`W/assistant/external-mcp-reauth-tool.ts:147`), bind it from `routeDeps`, and update every fixture that constructs these deps. |
| 4 B170 form-delivery | **FIX** | The owner is Jini only: `J/cms/src/settings/site/form-delivery.ts:181`. There is no Tovu `form-delivery.ts` at merge-23. The witness is the todo at `W/features/settings/__tests__/form-delivery.unit.test.ts:261`. **Trap:** the `SECRET_SHAPE_PATTERNS` entries carry the `g` flag, so calling `.test()` on them is stateful. Write `SECRET_SHAPE_PATTERNS.some(p => { p.lastIndex = 0; return p.test(value); })`, or match on non-global clones. Add a control asserting that ordinary values such as `"main"` and `"https://example.com/hook"` are still accepted. |
| 5 B259 describeApiError | **FIX** | Do **not** special-case the `"network down"` literal; that would be a test-shaped hack. At `A/lib/admin-http/request.ts:261-264`, return `e.message \|\| fallback` for `ApiError` and `fallback` for every other value. Rewrite the pin at `A/lib/__tests__/api-describe-error.unit.test.ts:24` to expect `fallback`, because it pins exactly the raw-message leak. If operators need network-failure copy, it must come from a typed `ApiError` produced by the transport. Out of scope, add to backlog: `A/features/ai-assistant/rules.ts:27` and `A/features/roles/roles-host-binding.ts:24` define their own `describeApiError`; audit them for the same leak. |
| 6 B226 publish verification | **FIX** (owns B226) | Use the sec-sheet basis, `{ id, revision }`. The data sheet's id-only basis would not catch a secret rotation, because the vault writes `revision = expectedRevision + 1` on replace or patch with the same id (vault-adapter `:84,:102`). Take `revision` from the **same** `VaultSummary` that `selectPublishCredential` returns (`publish-credentials/store.ts:71-74`), and return it from `resolveForPublish`/`resolveDefaultForPublish`. Never re-read it after the probe. The environment fallback basis is `{ kind: "env" }`. Changing the `isConfigured` return shape breaks about 40 fakes in `publish-agent-tools.unit.test.ts`; update them mechanically. The witness is the todo at `publish-verification-basis.unit.test.ts:61`. |
| 7 SC-permanent-delete-canonical | **FIX** (owns the bug) | As written, except that `repo.canonical` is optional (`types.ts:106`), so call `deps.repo.canonical?.list({ workspaceId })`. Before editing, grep the callers of `describeCredential` (the admin GET-by-id among them). Each will now also resolve canonical keys. That is intended, because it matches list precedence; record it in the commit. |
| 8 H1005 root-key race | **FIX** | `generateFileRootKey` (`J/platform/src/secrets/keyring.env.ts:343`) returns `{ hex, fingerprint, keyFilePath }`, so cache `Buffer.from(result.hex, "hex")`. Note that it creates the directory at mode `0700`, which is stricter; that is acceptable. Keep the plan's loser behavior, where `RootKeyFileAlreadyExistsError` propagates and the next invocation reads the winner's key. Do not catch it and re-read: the winner's file may still be partly written. |
| 9 H1122 Secrets tab | **REJECT** (duplicate; incomplete) | Superseded by **admin 3, commit 1**. This sheet only removes the early returns at `AccessTokensTab.tsx:158-171`. Tier 1 in `hooks/use-access-tokens.hooks.ts:~491-503` stays `undefined` until **all three** stores succeed, so with this sheet alone a partial failure would show "Loading…" forever. |
| 10 site-update error text | **APPROVE** | Anchors are `W/features/site-update/tools.ts:92` and `:106`. Keep `checked: false` in the check result. |
| 11 FIX 19 actor fallback | **REJECT** (duplicate) | Built once, as **data 3** (FIX). This sheet's NEEDS-OPUS label is not justified. The production ceremony already supplies the actor (ledger: `publish-trust-apply-coverage` proves it end to end). The roughly 84 red tests are fixtures only, in 12 files that are listed by name and that all exist at merge-23 and on `tv-r3-w1b`, `tv-w2all` and `tv-w3-ext-w1x`. |

**Skipped list.**
- **H1440: skip is right.** The cap is no longer silent: `omittedCount` is shown, and the dialog says "more not shown". See Q3.
- **H1974: skip is right.** Verified: `W/features/media-generation/provider-credential-save.ts:17-34` writes through `replaceWorkspace` with `tombstoneProviderIds: []` and one provider only.
- **H2179: skip is right here.** Admin 9 covers the log copy.
- **H2195: skip is right.** Only a stale comment remains.

**In plain words.** Every security bug in this plan is real. Most fixes are small and Sol can build them. Three things change:
- The desktop-password fix contradicts an earlier owner ruling, so the owner must decide first.
- The OAuth part needs Opus, because it changes a shared storage contract in both repos.
- Two sheets duplicate other plans, and one of them (Secrets tab) would have left the screen stuck on "Loading" after a partial failure.

## data.md — data integrity (8 sheets)

| Sheet | Verdict | Exact fix text |
|---|---|---|
| 1 B270 redirect create | **APPROVE** | Confirmed at `J/cms/src/redirects/redirects.ts:525-551`. `persistRedirectWrite` has one caller, so it can be removed. Copy `updateRedirect`'s pattern (`:691-693`). The validation reads must run on the deps handed in by the transaction, and the transaction must not be nested. The todo is at `redirects.write-boundaries.test.ts:359`. The import test is new. |
| 2 L079 atomic revert | **NEEDS-OPUS** | Confirmed. The memory host binds `transaction: ({ work }) => work()` (`W/server/runtime/composition/memory-deps/route-deps/trash-and-content.ts:122`, `memory-deps/slices/memory-trash.ts:82`), which is exactly the fake atomic callback the sheet warns against. See **Appendix A2**. |
| 3 FIX 19 actor fallback | **FIX** (owns FIX 19) | The extraction refs `w3-r2allj` and `r3-w1bj` **delete** `applyRunActor` as dead code. It sits at merge-23 `J/cms/src/publish/content/repo-handler.ts:441-457`, and the diff to `w3-r2allj` removes it. So "use the existing `applyRunActor`" fails on merge-24. Re-add it verbatim, with its doc comment and its two imports (`MutationActor`, `MissingMutationActorError`), then replace the two fallbacks: `repo-handler.ts:~372` and `raw-row-contributor.ts:188`. Restore the two witnesses from Jini `2df333941`. Do not restore that commit's `entries/write-service.create.test.ts` hunk. Land the 12 Tovu fixture files in the **same** consumer bump as the cms change. |
| 4 H1970 / H1973 media providers | **FIX** | At merge-23 the store and vault are still **Tovu** files (`W/features/media/provider-credential-{store,vault,store.memory}.ts`). The sheet's Jini paths exist only on `w3-r2allj` and `r3-w1bj`, so build on merge-24 only. Split into two commits. **(H1973)** Add `incarnation` as an **optional** string in `FIELDS["media-provider"]` (`J/platform/src/secrets/credential-sets/vault.meta.ts:26`, a strict whitelist). Before landing, confirm the meta reader on the currently published platform version tolerates the new key. If it rejects unknown keys, stop. `idGen` is a required constructor dependency; update the Tovu SQL binding `media-provider-credential-repo.ts`. **(H1970)** Then the store method, the new route `batch-providers.ts`, and the required UI port. Order: store, then route, then UI, in **one** `@jini-ai/ui` release together with rules 1. Use the existing `J/cms/src/admin-http/routes/media/__tests__/patch-delete-providers.test.ts` as the style model for the new route test. |
| 5 B226 | **REJECT** (duplicate) | Built as sec 6 with the `{ id, revision }` basis. |
| 6 SC-permanent-delete | **REJECT** (duplicate) | Built as sec 7. |
| 7 H1115 newsletter null preheader | **APPROVE** (owns H1115) | One expression in `createNewsletterUpdateCampaignHandler`. |
| 8 H1052 Trash pagination | **APPROVE** (owns H1052) | Confirmed at `J/admin/src/screens/trash/Trash.tsx:183`, an early return ahead of the Load more button at `:218`. `pagination.unit.test.tsx` is a **new** file; the existing sibling is `header-copy.unit.test.tsx`. Build this before admin 1, which edits the same file. |

**Skipped list.**
- **H1974: right.**
- **H1440: right** (Q3).
- **UI-1 "44 vs 30 days left": right.** It conflicts with a recorded decision; see Q1.
- **Restore-ledger `actor_kind` column: right.** `ops/database-journal.db` has no versioned steps, and ADR-066 only migrates content.db. See Q4.

**In plain words.**
- All data bugs are real.
- Redirects, newsletter and Trash paging are ready as written.
- The publish-actor fix is safe for Sol, but the extraction deleted the helper it calls, so the helper is restored with it.
- The media-provider sheet must be built after the extraction, because its files only move to Jini there.
- Revert atomicity needs Opus, because the in-memory host cannot roll back today.

## media.md — large files and media (3 sheets)

| Sheet | Verdict | Exact fix text |
|---|---|---|
| LF-1 O1731/O1732 | **FIX** | Delete the anchor paragraph's claim that "tv-w3 has the older 50 MiB × 2 rule". It is wrong: `tv-w3-ext-w1x` and `tv-w2all` already use `ATTACHMENT_MAX_BATCH_BYTES = MAX_UPLOAD_BATCH_BYTES`; only a stale comment at `:28-29` says otherwise. Step 1 (`maxStoredBytes: MAX_UPLOAD_BATCH_BYTES`) is independent: land it first. For step 3, `attachment-owner-read.ts` exists only on the extraction refs, with the signature `readChatAttachmentForOwner({ uploadDirectory, ref, ownerId, io }, { maxBytes } = {})`. Add the prefix read as a **required** `read({ buffer, position, length })` member of the existing handle port. Run it only after ownership and identity are verified on that same handle, and before any `readFile`. Step 4: `copyFile` is imported directly at `J/daemon/src/http/attachment-staging.ts:32`. Inject it as a required `copyFile` dependency of `stageAttachmentClaim`'s deps, bound in production to `(src, dst) => copyFile(src, dst, constants.COPYFILE_FICLONE)`. |
| LF-2 c21 `files_copy` conversion | **FIX** | **Build order.** Jini `cms/src/asset-transfer/copy-tool.ts` exists only on `r2y-ext-w1j`. It is absent on merge-23, `w3-r2allj` and both `r3-w1*j`. Tovu `W/features/asset-transfer/copy-tool.ts` is still Tovu-owned on `tv-w2all` and `tv-w3-ext-w1x`. If `r2y-ext-w1j` is **not** in merge-24, apply the copy-tool half to the Tovu file at the same symbols. Also check that the media branch's byte validation accepts video: at merge-23 `asset-destinations.ts:128` calls `validateImageBytes`, and on `w3-r2allj` it calls `deps.media.validateBytes`. If it refuses `video/*`, have the media destination validate with the same policy the direct media import uses. `videoImport` is not referenced anywhere under `W/server/runtime/composition` today, so the binding in `installResourceTools` (`tool-catalog-manifest.ts:520`) is new wiring. |
| LF-3 O1733 | **NEEDS-OPUS** | Phase A goes to Sol with one fix: **do not** put a 192 MiB product number in Jini core. Add `MEDIA_JSON_UPLOAD_MAX_BYTES` to Tovu `packages/contracts/src/upload-limits.ts`, next to `VIDEO_UPLOAD_LIMIT_BYTES`. Inject it into the Jini upload and replace routes as a required `maxJsonUploadBytes` dependency, the same way `maxVideoUploadBytes` is injected today. Use the same constant in `json-body-parsers.ts:42` and in the admin pre-read check. The admin file read is **not** in `use-media.hooks.ts` (no `readAsDataURL` there), so find the actual encode helper before wiring. Phase A also lowers the owner-approved 500 MiB Admin video upload (bt3), so it waits for **Q5**. Phase B goes to Opus: see **Appendix A3**. |

**Skipped list.** None skipped. The routing of other classes is correct.

**In plain words.** The attachment and copy fixes are real and buildable by Sol. One stated reason was wrong, and one file has not been extracted on the main refs yet. The big-upload fix has a quick half, which needs an owner OK because it lowers the Admin upload size, and a streaming half that needs Opus.

## admin.md — admin UI (9 sheets)

| Sheet | Verdict | Exact fix text |
|---|---|---|
| 1 Trash paging + retention copy | **FIX** | Drop the paging half; data 8 owns it, and this sheet goes after data 8. The header **already** reads "Items are permanently deleted {days} days after they are moved to Trash. Each item shows how many days it has left." (`J/admin/src/screens/trash/rules.ts:54`, key in `trash-i18n-a`). The remaining change is copy only, and it depends on **Q1**. With the recommended answer A, change that key in `rules.ts` and all three `trash-i18n-{a,b,c}` dictionaries to "Items moved to Trash now are permanently deleted after {days} days. Items trashed earlier keep the date shown on their row." Pin it in `header-copy.unit.test.tsx` with a fixture row showing 44 days. Do not touch `purgeAfter` or the sweeper. |
| 2 Media Trash countdown (UI-2) | **FIX** | `daysRemaining` is module-private at `J/cms/src/admin-http/http/trash.ts:27`. Export it, and import it only from inside cms. Adding the required `clock`, `retentionDays` and `readTrashDeadlines` dependencies to `MediaGridRouteDeps` (`grid.ts:31`) is a breaking change for hosts. Tovu is the only host; land the Jini route and the Tovu binding in one bump. The SQL reads `trashed_items` (`purge_after`, keyed by `workspace_id`, `entity_type`, `entity_id`). It shares a file with data 4 and LF-3 (`W/…/modules/media.ts`) and with LF-3 (`A/features/media/hooks/use-media.hooks.ts`). Order: data 4, then admin 2, then LF-3 Phase A. |
| 3 Secrets: store isolation + key 51 | **FIX** | Build **commit 1 only**; it also owns H1122. Give each of the three tier-1 reads its own state, `{ status: "pending" \| "ok" \| "error"; rows?: [] }`, and build groups from the `ok` stores. Keep `AccessTokensBody` at or under complexity 10 by extracting `StoreNotices`. Defer commit 2 (the H1440 Load more): `W/features/project-keys/service.ts` is missing on `tv-w2all`, and the cursor is cross-boundary design (Q3). |
| 4 H1115 | **REJECT** (duplicate) | Built as data 7. |
| 5 H1057 pt-PT | **FIX** | `J/ui/src/core.ts` does **not** export `resolveSystemLocale` on any ref; add the export. `resolveSystemLocale` returns `Locale \| null` (`locale.ts:33`), so fall back to `en` on `null`. The desktop depends on the **published** `@jini-ai/ui ^0.7.3-next.2` (`D/../package.json:44`), so a Jini release is needed before the Tovu commit. |
| 6 O1751 Draft pill | **REJECT** (already fixed) | `A/styles.css:2034` has `.status-draft, .jini-status-draft { background: var(--surface-3); color: var(--muted); }`, added in `2ae4824bf` and loaded globally by `A/main.tsx:26`. The scoped `.jini-status` base rule (`jini-media.css:455`) sets no color. Close O1751 after a light and dark browser look. Do not add a second rule. |
| 7 H1995 relay + UI-5 cleanup layout | **FIX** | Drop the relay half; chat 2 owns it. This sheet's "already-claimed returns failure" would turn a duplicate click on a **successful** resume into "Answer not sent". Keep the UI-5 CSS half as written: `.assistant-chat-cleanup*` has no CSS at merge-23. Anchor it to `.admin-chat-dock .jini-chat-pane__header` (`assistant.css:1479`), using the `.jini-conv-menu` pattern at `:1481`. |
| 8 Storage UI-4 | **FIX** | The labels are `CATEGORY_LABELS` in `A/features/storage/hooks/use-storage.hooks.ts:15-16`, and the parenthetical is at `:38`. Add two new keys to `storage-i18n.ts`. The required `setDocumentTitle` prop must also be added to every test mount of `StorageScreen`. |
| 9 H2179 held-plugin log | **APPROVE** | Update the existing pin at `W/server/runtime/boot/__tests__/bootstrap-reporting.unit.test.ts:122` in the same commit. |

**Skipped list.**
- **UI-1 retroactive Trash deadline change: right to skip.** The decision is recorded three times in the ledger. Bug-2 notes say "Old 60-day stamps kept; no migration". The `bt3` entry says "old stamps are kept untouched by decision". H2210 says "rows trashed under the old 60-day rule KEEP their stamped `purgeAfter` (44 days left is correct) … pinned in `sweeper.test.ts`". The owner choice is **Q1**.
- **Roles Reload button `g5a-s2t-reload-button` (H2071): wrongly left out.** It is a STILL OPEN admin-UI item that no plan owns. See "Not covered".

**In plain words.**
- Most admin fixes are small and real.
- The Draft pill is already styled.
- The Trash header already states the 30-day rule. The "44 days left" rows are the promised old deadlines, so only the wording can change, and only once the owner confirms.
- The saved-key paging is a feature, so this check defers it.

## chat.md — chat and AG-UI (3 sheets)

| Sheet | Verdict | Exact fix text |
|---|---|---|
| 1 AG-UI transport lifecycle | **FIX** | Make `cancelPendingRun` a **required** member of `AgUiDurableLocalCliBinding` (`J/chat/src/core/assistant-client/ag-ui-transport.ts:53`), like the other four. A host that cannot cancel passes `async () => {}` explicitly. The Tovu route exists. `/api/runs/pending/cancel` matches `app.post("/api/runs/:runId/cancel")` (`W/…/modules/assistant.ts:624`), and `cancelDurableRun` falls back to `cancelBeforeAcceptance` (`:278,:292`), which reads `messageId` and `conversationId` from the body. Bind to it unchanged. Export `SURFACE_EXCHANGE_META` from `core/index.ts`. The duplicated literal is at `W/…/modules/assistant-ag-ui-approval-segment.ts:16`. |
| 2 H1995 refused resume | **FIX** (owns H1995) | Use this sheet's shared answer-promise design, not admin 7's. "Keep the existing concurrent-success case" is wrong: no such test exists in `A/lib/__tests__/assistant-transport.ag-ui.approvals.unit.test.ts` (tests at `:107-228`). **Add** it as a new test: two concurrent answers, one POST, both receive success. |
| 3 H1998 launch fields | **APPROVE** | Build after chat 1, which edits the same file `A/lib/assistant-transport-ag-ui.ts`. The server's re-validation (`readPickedFolders` at acceptance, plus the capped page-context decoder) is already specified. |

**Skipped list.** All 9 near-matches route correctly to other plans.

**In plain words.** All four chat bugs are real. The fixes are buildable once two small corrections are made: the new cancel hook must be required, and a test the sheet assumes exists has to be written.

## rules.md — code rules and tech debt (8 sheets)

| Sheet | Verdict | Exact fix text |
|---|---|---|
| 1 MediaProvidersTab hook required | **APPROVE** | Ship in the same `@jini-ai/ui` release as data 4's UI port. First confirm that `useMediaProvidersTab` is exported from `@jini-ai/ui`'s root; if it is not, add the export in that release. |
| 2 AccessTokensTab hook required | **FIX** | Build after admin 3 commit 1, which touches the same `AccessTokensTab.tsx` and `Security.tsx`. Three more fixtures pass this prop and must be updated: `AccessTokensTab.unit.test.tsx`, `Security.unit.test.tsx` and `access-tokens-revoke-copy.unit.test.tsx`. |
| 3 Retire the legacy failure sink | **NEEDS-OPUS** | `failureReporterOf` and `UNBOUND_FAILURE_REPORTER` do not exist in code on any ref; they appear only in prose from a reverted attempt. Callers: `sendAdminFailure` in 57 non-test files, `adminFailureResponse` in 15, `reportServerFailure` in 18. The prior attempt turned 24 tests red. Making an unbound reporter "log nothing" would silently drop diagnostics for any router that never bound one. See **Appendix A4**. |
| 4 Split site-assistant / BYOK | **FIX** | Build after rules 3, because the BYOK attachment failure call site moves. The size test must check **each** destination file at or under 500 lines, as well as each root. The current sizes are 1,026 and 891 lines, so a three-way split fits. |
| 5 Duplicate export keys | **APPROVE** | On merge-24, core and plugins are already de-duplicated (2 copies on `w3-r2allj` vs 4 at merge-23), so edit only `ui` `./resource-monitor`. |
| 6 Routines on SIGTERM/SIGINT | **APPROVE** | `W/cli/commands/serve-listen.ts:105,132` vs `W/index.ts:351`. |
| 7 Expiry-test flake | **APPROVE** | Test-only change. |
| 8 Publish candidate into connect | **APPROVE** | A one-line fix. The precedent is the same pattern at `tool-catalog-manifest.ts:505`. It shares the file with LF-2 (`installResourceTools`); land them in separate commits and rebase between them. |

**Skipped list.** **ProvidersTab: right.** It is deleted on `tv-adm-dom2`, and its Jini destination on `adm-dom2-j` requires both hooks with no defaults (`:78-79,:91-92`).

**In plain words.** Six of the eight cleanups are ready or need only small corrections. Retiring the old error sink is much bigger than the sheet says: it touches about 60 files, and done naively it would hide real errors. It needs Opus.

---

## Cross-plan conflicts and build order

**Duplicates resolved (build once).**
- B226 → sec 6
- SC-delete → sec 7
- FIX 19 → data 3
- H1052 → data 8
- H1115 → data 7
- H1122 → admin 3 commit 1
- H1995 → chat 2

**Files touched by two or more plans. Serialize these, in the order given.**

| File | Order |
|---|---|
| `J/admin/src/screens/trash/Trash.tsx` and the trash rules/i18n files | data 8, then admin 1 (copy) |
| `A/features/security/AccessTokensTab.tsx`, `Security.tsx`, `use-access-tokens.hooks.ts` | admin 3 c1, then rules 2 |
| `W/server/runtime/composition/modules/media.ts` | data 4 route, then admin 2, then LF-3 A |
| `A/features/media/hooks/use-media.hooks.ts` | admin 2, then LF-3 A |
| `J/ui` media-providers (hook, port, tab) | data 4 UI, then rules 1, in one ui release |
| `A/lib/assistant-transport-ag-ui.ts` | chat 1, then chat 3 |
| `A/lib/ag-ui-approval-relay.ts` | chat 2 only |
| `W/server/runtime/composition/tool-catalog-manifest.ts` | rules 8, then the LF-2 host binding |
| `W/…/modules/assistant-byok.ts` and the BYOK failure path | rules 3, then rules 4 |
| `J/cms/src/publish/content/*` and the 12 Tovu fixtures | data 3 in one cross-repo bump |

**Waves** (Sol unless marked; at most two builders at once):

0. Merge-24 lands. Re-anchor every sheet by symbol.
1. **Jini-only, independent:** rules 5, sec 8, sec 4, data 1, sec 3b, sec 3c (Jini half), chat 1 (Jini half), admin 5 (export, then release).
2. **Tovu-only, independent:** sec 2, sec 5, sec 6, sec 7, sec 10, data 7, sec 3d, rules 6, rules 7, rules 8, admin 8, admin 9, admin 7 (CSS), chat 2. Sec 1 waits for Q2.
3. **Cross-repo pairs, each one Jini change plus one Tovu bump:**
   - data 3
   - data 8, then admin 1 (after Q1)
   - data 4, then rules 1
   - admin 2
   - chat 1 Tovu, then chat 3
   - admin 3 c1, then rules 2
   - LF-1 (step 1 first)
   - LF-2 (after the `r2y-ext-w1j` decision)
   - admin 5 Tovu
4. **After Q5:** LF-3 Phase A.
5. **Opus:** A1 (sec 3a), A2 (data 2), A4 (rules 3, then rules 4), A3 (LF-3 B).

## Not covered by any plan (STILL OPEN in the ledger, no plan or skip)

- **FULL JUDGE 3 (H2331 entry), four MEDIUMs:**
  - The Widgets nav is shown to roles that lack `widgets.read`.
  - A copied widget embed reuses its `placementId`.
  - A non-owner admin loses Local CLI because a 403 is swallowed.
  - The desktop thumbnail never refreshes (localhost vs 127.0.0.1).
- `g5a-o4-uncovered-writers` (H2065)
- `g5a-u2-jini-spec-principal` (H2066)
- `g5a-s2t-reload-button` (H2071). Admin calls it "outside the named fix set".
- Owner-held items, correctly left alone: the theme-package red tests, the `check:hooks` baseline, and typecheck:tests.

Recommendation: the coordinator dispatches one more Codex plan for the first three bullets.

## Owner questions (each with a recommended answer)

- **Q1. Trash: what should "Days left" mean for items trashed before the 30-day change? (product)**
  - (A) Keep the promised date. A row trashed on 11-08 keeps "44 days left", and the header says the 30-day rule applies to newly trashed items. This is the current recorded decision. It needs no data change and no migration.
  - (B) Shorten old items to 30 days from deletion. That needs an ADR-066 TS migration, or a sweeper clamp, over `trashed_items.purge_after`, and it permanently deletes items earlier than the date the UI showed.
  - **Recommended: A** (admin 1 copy only).
- **Q2. H1193 vs owner ruling B213: should desktop sites stop using the shared starter password `tovu-dev`? (product/security)** B213 ruled the desktop default "not a bug" (loopback, single user). But a desktop-created site directory can later be served or deployed, and the server-side guard only checks when an owner is first seeded. That site then keeps a publicly documented owner password. The ledger ranks it #1 HIGH. **Recommended: fix it.** Use a random per-site password sent on stdin, with boot-token sign-in, and let the owner set a chosen password in Users (sec 1 as corrected).
- **Q3. H1440, saved keys past 50 per site: build "Load more" now, or close as a visible cap? (product)** **Recommended: close H1440 as mitigated**, since the omission is now shown. Track continuation paging as a feature. Admin 3 commit 2 is deferred.
- **Q4. FIX 19 restore-ledger `actor_kind` column (coordinator may apply).** **Recommended:** keep `detail_json.actor.kind`, and open an ADR to give `ops/database-journal.db` versioned steps before adding any column.
- **Q5. LF-3 Phase A lowers Admin's JSON video upload from 500 MiB (bt3 owner decision) to 192 MiB, because a larger base64 body cannot fit in a Node string. (product)** **Recommended: accept 192 MiB** for Admin Media JSON uploads. Larger videos go through chat, `media_import_local_file`, or a future non-JSON upload.
- **Q6. Coordinator applies these recommended answers itself:**
  - B226 basis is `{ id, revision }`.
  - H1005: the loser throws.
  - An OAuth sign-in left open while the server config is edited fails and needs a fresh Connect.
  - `describeApiError` returns `fallback` for every non-`ApiError`.

---

## Appendix — the NEEDS-OPUS sheets, written out

### A1. sec 3a: OAuth callback bound to the configuration it started under (B272-oauth / H1963)

**Evidence.**
- `J/integrations/src/api-connections/hosted-mcp/sign-in-flow.ts:47`: `sealedRedirectState` binds only `[workspaceId, serverId, browserBinding?]`.
- `sign-in.ts:216` persists tokens against a fresh `requireOAuthRecord` taken **after** the exchange.
- `updateOAuthRuntime` compares only the sealed-OAuth pointer (`J/mcp/src/federation/hosted/store.memory.ts:120-126`; Tovu `W/features/external-mcp/external-mcp-repo.writes.ts:120-124`).
- `version` is bumped only by `updateIfVersion` (`store.memory.ts:112`). Runtime writes, including `setOAuthStatus("pending")`, leave it untouched, so binding `version` does not invalidate the state that `beginConnect` itself creates.

**Tests first.**
1. Activate the todo at `W/features/external-mcp/__tests__/external-mcp-oauth.test.ts:1578`: begin a connection, save a replacement client through the normal edit path (version +1), then deliver the callback. Assert that the exchange port is never called, the replacement row is byte-identical, and there is no connected notice.
2. In `external-mcp-oauth.lost-update.test.ts`, hold the fake exchange, save a replacement, then release it. Assert that no tokens land and there is no connected notice. Run it both with the old and new `sealedOAuth` absent and with both present.
3. Jini `J/mcp/src/federation/hosted/__tests__/` (store memory): `updateOAuthRuntime` returns `false` when `expectedConfig.version` or `expectedConfig.createdAt` differs.
4. A matching Tovu SQL repo test: the same assertion through the real `UPDATE … WHERE`.

Mutations: `drop-callback-state-basis`, `drop-callback-write-basis`, `sql-runtime-ignores-config-basis`.

**Fix.**
1. In `J/core/src/contracts/hosted-mcp/record.ts:171`, give `ExternalMcpServerRepoPort.updateOAuthRuntime` a **required** `expectedConfig: { createdAt: ISODateTime; version: number } | null` in its required object. `null` means a runtime-only write: refresh, status, lease and device flow. Update the doc comment at `:136`.
2. In `store.memory.ts:120`, when `expectedConfig` is non-null, also require `current.version === expectedConfig.version && current.createdAt === expectedConfig.createdAt` inside the same queued `write`. In `W/features/external-mcp/external-mcp-repo.writes.ts:~120`, add `AND version = ? AND created_at = ?` to the same conditional `UPDATE` when it is non-null.
3. In `J/integrations/…/hosted-mcp/oauth-row-writes.ts:37` (`writeOAuthRuntime`) and `sign-in-status.ts:21` (`persistTokens`), thread `expectedConfig` through as a required field. Every existing caller passes `null`, except the two named in step 4.
4. In `sign-in-flow.ts`, `sealedRedirectState({ deps, serverId, browserBinding, configBasis: { createdAt, version } }, _optional = {})` appends both values to the AAD. Pass `record.createdAt` and `record.version` at both calls (`sign-in.ts:171,196`).
5. In `completeConnectionAuthorization` (`sign-in.ts:187`), keep the pre-exchange `record`. After the exchange, call `persistTokens(deps, await requireOAuthRecord(...), tokens, { expectedConfig: { createdAt: record.createdAt, version: record.version } })`. Keep the re-read for the pointer comparison, because its comment explains why the pending write requires it. If the write returns `false`, throw the existing stale-connection error and send no notice.
6. Pass the same basis to the invalid-client cleanup at `sign-in.ts:208-210`.

**Do not change** shared sign-in, the device flow or refresh. Every runtime write other than those two keeps `null`.

**Order.** Land the Jini contract, the memory adapter and integrations, then the Tovu SQL adapter, in one bump.

**Real-app check.** Use a disposable connection.
- Connect fresh: it succeeds.
- Edit the label mid-sign-in: the callback fails, and Connect works again.
- A replacement client never receives the old tokens.

### A2. data 2: atomic change-set revert (L079 / H0020)

**Evidence.**
- `J/cms/src/core/commands/revert.ts:188-195` loops `reverter.applyInverse` with no transaction.
- `RevertChangeSetDeps` (`:83-90`) has no transaction port.
- The SQL kernel offers `kernel.transaction(fn)`, with AsyncLocalStorage-joined repos (`J/db/src/kernel/kernel-core.ts:2,26,67`).
- The memory host binds `({ work }) => work()`, which cannot roll back.

**Tests first.** Exactly as the data sheet: replace the pin at `W/contracts/core/commands/__tests__/revert.unit.test.ts:609`, and add the new `W/server/runtime/composition/modules/__tests__/change-sets-revert-atomic.integration.test.ts`, using the **SQL** kernel. Add one more case: a memory-host revert whose second inverse throws must reject with the original error **and** leave the first write rolled back. Mutation: `run-revert-without-transaction`.

**Fix.**
1. Jini: add a **required** `transaction<T>(required: { work: () => Promise<T> }, _optional?: Record<string, never>): Promise<T>` to `RevertChangeSetDeps`. Run the reads, precondition checks, the descending inverse loop, the status re-check, `changeSets.save` and the outbox enqueue all inside `work`. Keep the force refusal first. Thread the port through `J/cms/src/admin-http/routes/change-sets/revert.ts` and `J/cms/src/change-sets/tool-registrations.ts`.
2. Tovu SQL host: bind `({ work }) => kernel.transaction(work)` on the **same** kernel that backs the reverter repos and the outbox, in `W/server/runtime/composition/modules/{content,change-sets}.ts` and `site-deps/route-deps-site-providers.ts`. Verify that the page-HTML reference writes and the post Trash-index writes use repos built from that kernel. Any that use a separate store must be named in the commit, and that host integration stops there.
3. Memory host (`memory-deps/route-deps/assistant-and-site.ts` and the memory slices): implement `transaction` as snapshot-and-restore. Clone the memory repos the reverters touch before `work`, and restore them if it rejects. Find those repos by name from `registry` (the reverters); grep `memory-deps` for each reverter's repo. If a touched memory repo exposes no snapshot, add `snapshot()`/`restore()` to that memory class only.
4. Do not change the forward command path.

**Order.** Jini, then Tovu, in one bump. No migration.

### A3. LF-3 Phase B: stream large local videos (O1733, the local-import half)

Build only after Q5 and Phase A have landed, on merge-24, where `createMediaImportLocalFileHandler` sits in `J/cms/src/media/site-import/tool-registrations.ts:220` and `media-tool-ports.ts` exists.

**Tests first.** As the media sheet's Phase B, plus one test in the Tovu FFmpeg adapter: a staged input path and a staged output path, with no `Buffer` of either file over 64 KiB. Mutations: `local-video-collects-chunks`, `conversion-reloads-original-buffer`, `stream-ignores-byte-cap`.

**Fix.**
1. `J/platform/src/fs/guarded-reader.ts`: add `withGuardedBinaryStream({ rootPath, relativePath, maxBytes, consume }, { signal } = {})`. Reuse the existing containment, deny-list and opened-descriptor checks from the binary read path (`:581-591`). `consume({ length, chunks })` receives an `AsyncIterable<Uint8Array>` with chunks of at most 64 KiB. If the bytes read exceed `length` or `maxBytes`, throw the existing size error. Close the descriptor in `finally`.
2. `media-tool-ports.ts`: add required `source.withLocalStream` and `storage.uploadStagedVideo({ spoolPath, sha256, byteLength, mimeType, provenance }, _optional = {})`.
3. Handler: apply the new path only above the ordinary 50 MiB ceiling and only after a prefix sniff identifies `video/*`; anything else is refused. Stream into a private spool (`mkdtemp` under the site's tmp root, mode `0600`), hashing as it goes. Below the ceiling, keep the current byte path.
4. Media service and blob adapters: add a staged write behind the injected port. It takes the existing blob lock, dedups by hash, and writes the blob before the row and rendition. If the deployed blob adapter cannot consume a file path without buffering it, **stop and report**.
5. `video-transcode.ts`: add a staged input and output variant, bound in Tovu `createMediaConversionPorts` to the FFmpeg adapter. Bound the input by `VIDEO_UPLOAD_LIMIT_BYTES` and the output by the existing conversion budget. Keep the original if conversion fails. Delete both spools on success, refusal and cancellation.

**Real check.** As in the sheet: record Node RSS, FFmpeg RSS and spool disk separately.

### A4. rules 3: retire the legacy failure sink without losing diagnostics (H2189 / FIX 4 step 3)

**Evidence.**
- `W/server/inbound/shared/admin-failure.ts` (234 lines):
  - `mintErrorId` `:48`
  - `adminDiagnostic` `:58`
  - `reportServerFailure` `:74-79`
  - `reportToLegacySinks` `:107-115`
  - `sendAdminFailure` defaults from `res.locals` at `:221-231`
- `tv-w3-p4mounts` already binds `failureReporter` for site shares (`system-site-shares.ts:59`) but keeps `reportToLegacySinks`.

**Step 0: census, which comes first and blocks everything after it.**
- Add `W/server/runtime/composition/__tests__/failure-reporter-bound.integration.test.ts`. Boot the composed app with the existing test-server helper. For every router that calls `sendAdminFailure`, `adminFailureResponse` or `reportServerFailure`, force a failure through the route's injected port and assert that the composed recording reporter received exactly one `record`.
- Generate the router list from the 57/15/18 caller files. Commit the list in the test as data.
- Any router the test shows as unbound is bound **first**: `res.locals.failureReporter = errors.reporter` in that router's mount, following `system-site-shares.ts:59`.
- Mutation: `unbind-one-router-reporter`.

**Step 1: the seam.**
- Add `failureReporterOf({ res }, _optional = {}): Pick<ErrorReporter, "record">` in `admin-failure.ts`. It reads `res.locals.failureReporter`. If that is missing, it reads `res.app.locals.failureReporter`, which the composition root binds once to the app reporter.
- Only if both are missing does it return `UNBOUND_FAILURE_REPORTER`. Its `record` throws `UnboundFailureReporterError`, and that maps to `UNAVAILABLE_ERROR_ID` with **one** `console.error` naming the operation, the single remaining wiring diagnostic. No tracker call and no minted ID.

**Step 2: remove the legacy path.** Delete `reportToLegacySinks`, `mintErrorId`, `adminDiagnostic` and the `tracker` member of `BoundFailurePorts`. Make the reporter-bearing second argument required in `reportServerFailure`, `adminFailureResponse` and `sendAdminFailure`. Keep admission, copy and status unchanged.

**Step 3: callers.** Update callers mechanically, one directory per commit: `admin-http`, `public-http`, `assistant`, then the composition modules. Each passes an in-scope reporter or `failureReporterOf({ res })`.

**Step 4: tests.** Move the fixtures named in the sheet, plus `site-shares.wire` and `site-share-failures`, onto the recording reporter. Never delete the private-envelope assertions.

**Order.** Rebase onto `tv-w3-p4mounts`, then steps 0 through 4, then rules 4.
