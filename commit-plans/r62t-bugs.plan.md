# Merge-10 bug triage

**85 entries reviewed. Four Tovu fixes are ready for one Codex job.** The review covers all 65 `[OPEN …]` entries, the combine-7 through combine-10 findings, all five UI batch items, and bug 155. Duplicate reports remain visible under their original IDs.

| Class | Count |
|---|---:|
| FIXED-ON-MERGE-10 | 40 |
| CODEX-FIX / READY-FOR-CODEX | 4 |
| UI-CHROME | 6 |
| NEEDS-OWNER / NEEDS-DECISION | 6 |
| OPUS-CLOUD | 3 |
| NOT-A-BUG/WONTFIX / RETIRE | 2 |
| PARTIAL | 24 |

Bases are Tovu `0973a5fdc8` and Jini `de4e555b9`. Numeric IDs other than 155 are line anchors in the owner's working list. `W` means `apps/website/src`, `A` means `apps/admin/src`, and `P` means Jini `packages`. “Fixed” describes the named defect in the merge-10 source or recorded verification. Packaged and live checks are identified where they remain relevant. The dispatch waived the missing `AI-Dev-Shop/AGENTS.md`. The Tovu commit-plans ref was available in the owner's repository through Git objects. This was a read-only review with zero new test runs or file edits.

## Disposition table

**F** fixed · **C** Codex fix · **U** Chrome · **N** owner decision · **O** cloud · **W** retire · **P** partial.

| ID / title | Class | Merge-10 evidence or remaining check | Sheet |
|---|---|---|---|
| 1315 Form delivery status codes | F | Jini `infra/src/events/outbox/worker.ts:50–63` stores allowlisted failure codes. `cms/src/forms/delivery/retry-policy.ts:35` provides those codes and Tovu `contracts/core/events/outbox-retry-policies.ts:17` binds the policy. | — |
| 1317 Daemon core RPC memory fixture | C | Combine-9 still records 1 red. `memory-deps/route-deps/trash-and-content.ts:166–171` puts the ledger and session lookup on different stores. Production `site-deps/route-deps-content-chat.ts:137–143` shares a kernel. | T1 |
| 1318 Federation reload listener | N | `app-federation-reload.observability.test.ts` remains base-red in combine-9. The desired roster reload contract is undecided. | Q1 |
| 1319 Recharts browser integrity pin | O | `recharts-package-pin.unit.test.ts` reports divergence from published bytes. Human review and a pin against the actual release tarball are owed. | O1 |
| 1321 BM25 media-tool ordering | P | Jini `media/agent-tools.ts:163` says “New alt text” in the field schema. Verify the descriptor that BM25 indexes and reproduce the ordering with the current catalog. | — |
| 1322 Vendor-neutrality test | P | Combine-8 identifies two test-only Google references. `vendor-neutrality.test.ts:8,82–92` deliberately includes tests. Check current hits and distinguish host product pins from generic seams before changing the guard. | — |
| 1323 L244 no-op version bump | P | Refresh the four old witnesses against current update and revision paths. Merge-10 cancellation changes address a different condition. | — |
| 1324 Generic log and admin errors | P | Outbox code retention and signed-out disclosure were fixed separately. Trace the remaining generic admin and operator messages to their producers. | — |
| 1325 B07 site-key re-seal verification | P | The entry describes a held branch. Establish whether its verifier landed and whether a key-switch regression still reproduces at the Tovu recovery route. | — |
| 1326 Member lost updates and other blind writes | P | Requires separate proof for member compare-and-write and the other named stores. The 28-site historical count is unverified on merge-10. | — |
| 1327 MCP isolation claim with capability unset | F | Cloud triage ran Jini's `mcp-isolation-claim.unit.test.ts` 5/5, covering unset and built launch args. Check the stamp against the installed CLI when a definition adds a claim. | — |
| 1328 Unsafe A06 executor sheet | W | Retire the superseded sheet as written. Its design review alone establishes no current production defect. | — |
| 1329 Invisible bidi filter and missing tests | P | Compare the current filter bytes and Jini gate coverage against the A03 review before repointing or adding tests. | — |
| 1330 Pinned-capability raw token accessor | P | The old accessor name was absent from the inspected daemon and runtime paths. Trace the current endpoint-bound owner before closing. | — |
| 1332 Run-finalizer duplicate and F1–F3 | P | Refresh the Jini export and caller inventory and carry forward the three individual defect witnesses. The original Tovu module path has changed. | — |
| 1334 Falsy bound-confirmation owners | F | Jini `daemon/src/bound-confirmations.ts:71` checks `held.owner === undefined`; `bound-confirmations.test.ts:129` covers falsy scalars. | — |
| 1335 ACP capability, resume, usage and vendor behavior | O | Jini still exercises `session/set_model`; cancel framing and id-less errors were addressed separately. Reproduce remaining cases against supported real CLIs before selecting protocol edits. | O2 |
| 1337 `render.ts` topic-branch merge collision | W | Retire the old merge-order instruction for this dispatch. The task starts from the integrated source. | — |
| 1338 Vendor names in generic code | P | The old `api-connections/bundled-catalog.ts` path is gone. Separate the current generic-seam hits from Tovu's explicit bundled-product inventory. Keep the production guard. | — |
| 1339 Identity seed rejection diagnosis | P | `runtime/boot/process-error-guards.ts:82` passes the rejection reason to its log sink. Verify the final redacted output for a failed seed. | — |
| 1341 Lazy Electron updater import | F | `apps/desktop/src/main/index.ts:110,471` statically imports `electron-updater` and injects its updater. | — |
| 1342 Hook injection regression | P | The old counts are not current. Refresh against touched components and the current hook gate before naming edit targets. | — |
| 1347 Credentialed source-control account probe | P | `source-control/store.ts:84–108` uses the supplied HTTP client and forwards options. Effective redirect refusal still needs a provider-path check. | — |
| 1358 Daemon and memory-route error disclosure | P | Three separate paths are reported. Refresh run-store, model-proxy and memory-route witnesses before selecting changes. | — |
| 1359 Four integrations/plugins reds | P | The entry omits test names and assertions. Recover them from the coverage report and match each to current source. | — |
| 1360 Effective settings returns 400 | N | `settings/__tests__/json-route-fallbacks.unit.test.ts:53,64` pins 400 for absent and empty `namespace`. The original request query is unknown. | Q2 |
| 1361 Serve and agent-runtime cycle warnings | P | Combine-10's architecture graph has one runtime module pair. The historical type-only and agent-runtime distribution cycles need separate checks. | — |
| 1363 `site-share-errors.ts` ownership | F | `sendSiteShareFailure` now lives at `routes/system/site-share-password.ts:53`. `site-shares.ts:1` and its test import directly. | — |
| 1365 Desktop omitted from local Jini links | F | `9132a6300`; `development/scripts/jini-links.mjs:22–28` discovers desktop. Cloud triage recorded desktop links; combine-10 also checked tarball resolution. | — |
| 1366 Unsafe href handling | F | Jini `cms/src/navigation/href.test.ts:47–58` covers protocol-relative URLs and non-string inputs; the implementation uses two resolution bases. | — |
| 1371 E2 chat redaction regression | P | Historical branch report and later replacement plan exist. Verify which implementation landed and map the reported cases to the current chat entry point. | — |
| 1372 Embedded chat missing surfaces provider | F | Jini `dc58acc1b`, merged by `3a7e7fa4d`, wires the provider and requires `surfaces`. The embed browser lifecycle check remains owed. | — |
| 1373 Desktop extraction plan green exit on red | P | Historical branch gate. Reconcile `wave3/desktop-d0c` with later packaged reports before reusing the old handoff. | — |
| 1374 Desktop stage and closure command | F | Cloud triage records `stage` in the desktop manifest and the required flag in `verify-package.ts:49`. Packaged release execution remains owed. | — |
| 1375 Remaining chat redaction gaps | P | Separate the older `wave2/chat-deps` branch's remaining cases from 1371. Current diagnostics, analytics and durable-chat consumers need individual verification. | — |
| 1381 Agent Plugins generic failure toast | U | Owner observed the toast on a populated Installed tab. No current failed request or error ID identifies the cause. | UI-P3 |
| 1384 Share archive includes warned bytes | F | `6d61166940`; `share-backend.ts:135,165,185` refuses warned ZIP delivery. The resulting acknowledgement conflict is C9-1. | — |
| 1433 Outbound characterization call-site drift | F | Current `outbound-connections.characterization.unit.test.ts:8,18–23` looks in `composePublishingPhase`; `boot-phases.ts:221` contains the call. | — |
| 1434 Visitor approval failure loses prompt | F | `f064021231`; `SiteToolConfirmation.hooks.ts:24–32` retains failed prompts; the widget renders the retry notice. Combine-8 records 5/5 hook cases. This is distinct from theme bug 155. | — |
| 1435 Core lock and missing idioms export | F | Tovu `0740ca85a` raised the lock pair. Combine-10 B1 proved packed resolution, including desktop's own package tree. Release publication and packaged execution are separate checks. | — |
| 1436 ACP cancellation sent with an ID | F | Jini `c52c3bae3`; `session-run.ts:570` sends the notification without an ID. | — |
| 1437 ACP id-less error advances model selection | F | Jini `c52c3bae3`; `session-results.ts:57–58` requires the outstanding model request ID to match. | — |
| 1438 Resource card menu keys and Escape | U | Jini `ResourceCardParts.tsx:31` still declares `role="menu"`. Verify keyboard handling and focus on the actual Resource Dashboard. | UI-R1 |
| 1439 Newsletter tool silently caps send log | F | `ceea7e24f0`; `newsletter/tool-registrations.ts:359` overfetches and reports truncation. The admin route is separate. | — |
| 1440 Admin newsletter send log caps at 100 | C | `routes/newsletter/list-send-log.ts:23` uses the repo default. The route is mounted at `composition/modules/newsletter.ts:67`. The repo already accepts a limit and an ID boundary. | T2 |
| 1441 Visitor lists silently truncate | F | `ceea7e24f0`; `assistant/site/tools.ts:202,210,259` exposes `entries` and `truncated` and describes the cap. | — |
| 1442 Other-site saved keys hidden past 50 | P | `other-site-keys.ts:39,82` still caps picker enumeration. The known-ID adoption fix at 1459 leaves the picker completeness question open. | — |
| 1443 Media picker error Cancel localization | F | `ceea7e24f0`; `MediaPickerDialog.tsx:155` translates Cancel; `JiniMediaPicker.hooks.unit.test.tsx:19` asserts `Cancelar`. | — |
| 1444 Omitted image model ignores saved model | F | `ceea7e24f0`; `media-generation/tool-registrations.ts:219–220` reads saved model metadata. Its test at `:442` exercises omitted-model selection. | — |
| 1445 Translation audit false positives | P | `hygiene-audit.mjs:153–154` reads positional spread arguments; `:146–147` already reads some wrapper literals. Pin the object-form spreads and isolate the remaining audit-dictionary false positives. | — |
| 1446 Sidecar malformed-frame echo | F | Jini `c52c3bae3`; `json-ipc.ts:299` emits fixed `BAD_FRAME` copy. `audit-regressions.test.ts:8` checks the no-echo contract. | — |
| 1447 Generic sidecar handler error and logger | P | Jini `json-ipc.ts:332,343` still creates a logger and returns `internal error`. Refresh the stopped handler sheet against the current function-size limit and intended host reporter. | — |
| 1448 Signed-out error details disclosed | F | Tovu `764cbc04a8`; `Login.tsx:52` and `OwnerRecoverySignIn.tsx:26` use `disclosure="id-only"`. Jini E6a landed in `c52c3bae3`. | — |
| 1449 Raw admin incident IDs and disk refusal | C | `inbound/shared/admin-failure.ts:55,74–77` mints UUIDs and reports disk exhaustion as an incident. T3 fixes ID format. Disk-refusal response parity remains partial. | T3 |
| 1450 Error-gate update accepts debt growth | P | Jini `scripts/check-error-gate.mjs:115–116` still writes before comparing. Pin refusal and unchanged ledger bytes, including `--files`, before dispatch. | — |
| 1451 Media list byte-size N+1 | F | `b53b3595cc` replaces per-hash reads with one list call. `ab038aae8` repoints stale unknown-size mocks. | — |
| 1452 Identity-settings characterization drift | F | Current `identity-settings.characterization.unit.test.ts:8,18–23` checks `composeSiteServicesPhase`; `boot-phases.ts:91` contains the call. | — |
| 1453 Jini agent-plugin expand test flake | F | Jini engaps J6 switched to `await screen.findByRole` in `agent-plugins.test.tsx:23`; combine-10's load probe did not reproduce the old failure. | — |
| 1454 AG-UI stream catch leaks error text | C | `composition/modules/assistant-ag-ui.ts:304` writes the thrown value to `RUN_ERROR`. `:389–391` already passes the outcome to diagnostics. | T4 |
| 1455 Share ZIP delivers warned files | F | Same producer as 1384. `6d61166940` added the refusal to both ZIP paths. See C9-1 for the owner-facing regression. | — |
| 1456 Private backup commits warned bytes | N | `site-backup/backup-service.ts:639–655,724` continues with warnings; `archive-round-trip.integration.test.ts:106–121` pins that behavior. | Q3 |
| 1457 Assistant tool authorization | F | Jini `246854498`; Tovu `4692bc9a1` binds permission checks for plugin search and four delegated tools. `70252d6c6` extracted the Tovu wrapper. | — |
| 1458 Cancelled CMS updates and theme import write | F | Jini `246854498`, `31d6ce265`; Tovu `35723a55ee`. Scope is the three named writer paths. | — |
| 1459 Approved saved key missing by ID | F | Tovu `45f44c2d9a`, merged by `4692bc9a1`, adds the captured-ID lookup and adoption witness beyond 50 rows. | — |
| 1460 Redirect wildcard bound | F | Jini `af6ff0339` rejects an active wildcard past the bound and supplies an over-cap notice. Tovu `d5a60ee1e` translates it. | — |
| C7-1 Plugin contribution filenames | F | Tovu `7801b3d883` / `14ef4ba26` repoints filenames. Combine-10 B1 checked the staged Cloudflare manifest and killed the old-filename mutation. | — |
| C7-2 Trash EXDEV cause | F | Jini `0696ae1e7` / `6a911a82a`; `directory-adapter.test.ts:319` pins the cause and live-tree recovery. | — |
| C7-3 Theme preview public barrel | F | Tovu `28f777f83`; `theme-preview-refresh.ts:5` uses the narrow roster leaf. Its worker-graph red disappeared. | — |
| C7-4 Search and mail credential labels | N | `modules/site-search.ts:60` uses `Jini Search —`; combine-8 records old-label failures and unfinished mail-label work. Existing saved labels need an owner policy. | Q4 |
| C7-5 Desktop renderer rest syntax and call drift | F | Combine-7 records `8ec117a4a`; combine-10 reports all four desktop TypeScript projects green. | — |
| C7-6 Desktop contract dependency | F | `196e536c8` declares the runtime dependency; combine-10 checked packed desktop module resolution. | — |
| C8-1 GitHub managed-manifest path | N | Jini `d9c625e6`; `commit-site.mjs:35` uses `.jini/managed-files.json`. Tovu `GUIDANCE.md:78` and the bundled contract tests still point at `.tovu`. | Q5 |
| C8-2 Dev runtime probe environment | F | `764cbc04a8` / `8c643e088`; `development/scripts/dev.mjs:861` passes `env: process.env`. | — |
| C8-3 Jini CSS selector mismatches | U | `jini-media.css:601,613,781` still targets classes different from the emitted TabBar and RowMenu classes. Combine-8 recorded 26 candidates. | UI-M1 |
| C9-1 Share refusal versus acknowledgement | N | Combine-9 records three new reds from `6d61166940`. Combine-10 explicitly carries the decision forward. | Q6 |
| C9-2 Site-chat stale lock | F | `47dd8b157`; combine-10 records site-chat `npm ci --ignore-scripts` exit 0. | — |
| C10-A1 Unknown media-size test drift | F | `ab038aae8` updates the three tests to mock `assetBlobRepo.list`; unknown size remains `null`. | — |
| C10-A2 Stale lockfile-pair test pins | F | `75900acdf`; combine-10 A2 repoints three stale tests against the lockfile and Jini pair. | — |
| C10-A7 Shared Postgres test database | O | `chat-dialect-matrix.ts` truncates shared tables per setup. Combine-10 reports failures with concurrent files and green individual runs. | O3 |
| UI1 Agent Plugins linked switch | U | `AgentPluginLinkedLock.tsx:24–32` now renders state, a lock and navigation. Check the owner's requested visible link and tooltip interaction live. | UI-P1 |
| UI2 Installed tab omits disabled plugins | F | `AgentPlugins.tsx:189,308` passes the complete installed list to the tab; verify switches in the next Plugins pass. | — |
| UI3 Sign-in password eye | F | `Login.tsx:46–49` uses `SecretInput`; `Login.unit.test.tsx:64` exercises the toggle. Desktop packaging remains a live check. | — |
| UI4 Answered choice loses its question | U | The owner observed a bare answer bubble. Reload and verify the persisted Jini chat transcript in the running admin. | UI-A1 |
| UI5 Mid-run user message renders in assistant turn | U | The owner observed wrong grouping, missing Copy and a misplaced run footer. Verify both live and reloaded transcripts. | UI-A2 |
| 155 Once-per-run approval for existing theme edits or activation | P | `tool-approval-policy.test.ts:80` pins an activation card. `theme/file-mutation-tools.ts:29–69` and `theme-write-file-overwrite-confirmation.test.ts:61–79` still allow direct reversible edits. The inspected paths lack a shared run grant for edits and activation. | — |

## READY-FOR-CODEX job

**Tovu · `codex/r62t-bugs-tovu` · base `0973a5fdc8` · T1 → T2 → T3 → T4 · ~5.0k executor tokens.** The relevant pushed changes are already in this base. T3 and T4 consume existing Jini merge-10 APIs. No Jini job meets the four-sheet minimum. Each sheet lists its full edit set. Existing imports and exports stay in place unless a sheet explicitly changes one.

### Job rules to copy into the brief

- Behaviour identical outside the named fix. API args `(required, optional = {})` for new functions only. Never remove, rename or change existing `_optional = {}` pads or the args rule. No re-export shells, new dependencies, `eslint-disable`, `@ts-ignore`, `as any` or `as never`. Functions ≤50 lines and complexity ≤10. A file over 500 lines goes in `COMMIT-PLAN.md`; continue.
- STOP the affected sheet and continue the others if a named declaration is missing, a cast is needed, either function limit is exceeded, or a production importer outside the sheet appears. Use `git grep -n -F '<symbol>' -- apps/ development/ packages/`. Test-only importers needing the same repoint are allowed and recorded in `REFRESH.md`.
- No other repo-wide scans. No tests, builds, installs, type-checks, linters or codebase-memory-mcp. `.git` read-only. Write the named failing test or identify the existing red first. Combine owns red, green and mutation execution. `COMMIT-PLAN.md` at repo root. Hooks are injected as props. Vendor code lives in Jini provider packages. Jini domain code stays independent of specific server frameworks. A lockfile change, new dependency or new Jini package goes to OPUS-CLOUD.
- Do exactly what each sheet names. No unnamed helpers, wrappers, adapters, ports, interfaces, types, generics, options, flags or layers. No speculative parameters, exports, pads, validation, guards, catches, defaults, retries or fallbacks. Move existing statements and comments verbatim if a sheet calls for a move. Add only the named tests and mutation. Add no comments unless explicitly named. Remove unrelated diff lines and record deletions in `COMMIT-PLAN.md`.
- Composition-deps gap 1 and the Jini API deprecation gate are dropped. Jini uses `jini-*` names. Record breaking changes on a `BREAKS:` line. `@tovu/sdk` stays in Tovu.

### T1 · Share the memory fixture's chat store · ~1.1k tokens

- **Red first.** Use the existing red `an accepted memory-mode answer reaches CLI launch through the site's attempt authority` at `W/server/runtime/composition/modules/__tests__/agent-daemon-core-rpc.integration.test.ts:33–63`. Preserve the assertions for the site locator, daemon-local map being empty, resumed executor input, and late capture refusal.
- **Edit only `fixture` at `:16–30` in that test file.** Save `createRouteDeps()` as `base`. Open `openChatDb({ filePath: ":memory:" })`, register `t.after(() => db.close())`, and obtain `const store = chatKernel({ store: db })`. In the existing `server` bag, after `...base` and before `...overrides`, set `chatHistory: createChatStoreFactory({ store })`, `chatRunLedger: createChatRunLedger({ store })`, and `agentSessions: createSqliteAgentSessionStore({ store, clock: base.clock })`.
- **Add imports** `import { openChatDb } from "#src/platform/db/sqlite/chat-db";`, `import { chatKernel } from "#src/platform/db/chat-kernel";`, and `import { createChatRunLedger, createChatStoreFactory, createSqliteAgentSessionStore } from "#src/assistant/index";`. Existing test imports at `:5–14` remain. No production edit, repoint, export or debt row.
- **Mutation.** Restore `agentSessions: base.agentSessions` alone. The site locator assertion should return `null` again. STOP if the shared store still cannot see the locator or the failure shifts to durable admission. No browser look owed.

### T2 · Page admin newsletter send logs · ~1.6k tokens

- **Red first.** Extend the existing HTTP case at `W/server/inbound/admin-http/routes/newsletter/__tests__/list-send-log.test.ts:108–128`. Use the current repo fixture with 101 zero-padded IDs in one campaign and retain the other-campaign and other-workspace rows. Assert the first 100 ordered rows and a usable `nextCursor`. Request that cursor, assert the final row and `nextCursor: null`. An exact-100 case can use the same fixture before inserting row 101. Mutation requests `limit` rows at the repo instead of `limit + 1`.
- **Edit only the handler at `W/server/inbound/admin-http/routes/newsletter/list-send-log.ts:11–27`.** Mirror its sibling `list-subscriptions.ts:20–31` for `parseListPageRequest({ value: req.query }, { defaultLimit: 100, maxLimit: 100 })`, the `{ data, nextCursor }` response, and the `ToolInputError` → 400 mapping. Decode the cursor as a single string ID, using the one-ID pattern in `W/features/newsletter/repo-subscribers.ts:120–134`. Pass that `afterId` and `limit + 1` to the existing `listByCampaign`. Use `pageFromOverfetch({ rows, limit, positionOf: row => [row.id] })`. Preserve the campaign lookup, authorization and raw row projection.
- **Add imports** `import { ToolInputError } from "@jini-ai/core";` and `import { decodeListCursor, pageFromOverfetch, parseListPageRequest } from "@jini-ai/core/list-page";`. The composition import at `W/server/runtime/composition/modules/newsletter.ts:11` and test import at `:14` stay. No package export, manifest or injection row. Record the additive HTTP field and cursor in `COMMIT-PLAN.md`.
- **STOP** if a production client requires an exact envelope or the cursor cannot be passed with the existing typed helpers. Combine owes a real HTTP check across both pages. Any admin pagination UI is a separate edit.

### T3 · Mint standard admin incident IDs · ~0.9k tokens

- **Red first.** In `W/server/inbound/shared/__tests__/unexpected-admin-escape-paths.unit.test.ts:34–51`, extend `forms pull gives its formatter the concrete explanation and correlated reference` with `assert.match` on the existing ID. Require `/^ERR-(?:[0-9A-F]{4}-){3}[0-9A-F]{4}$/`. Keep the reply, nested failure and log correlation assertions. Mutation restores the raw UUID at the response producer.
- **Edit `W/server/inbound/shared/admin-failure.ts:55,74` only**, plus those imports. Replace `import { randomUUID } from "node:crypto";` with `import { randomBytes } from "node:crypto";`. Add `import { mintToolErrorId } from "@jini-ai/core/errors/error-id";`. At both mint sites use `mintToolErrorId({ randomHex: ({ bytes }) => randomBytes(bytes).toString("hex") })`. Keep explicit supplied IDs and the existing `formatUserFacingError` precedence. There are zero importer repoints, package-export edits or manifest edits. The test exercises the registered forms route through its existing imports.
- **STOP** if the installed candidate lacks the existing subpath or formatting alters the generated ID. No debt row edit. Combine owes the forms HTTP case and related admin failure tests. The disk-space response and its incident routing remain a separate partial item.

### T4 · Keep stream-reader failures private · ~1.4k tokens

- **Red first.** In `W/server/__tests__/assistant-ag-ui-wire.golden.test.ts:71–92,186–197`, extend the existing stand-in with only `dropConnection?: true` on `Script`. For that case write one valid partial text frame, then destroy the response from the final write callback so the failing read follows the 200 headers. Add one authenticated `postRun` case with that script. Assert the partial text closes, exactly one `RUN_ERROR` is emitted, and its message is `The assistant’s response was interrupted. Send your request again.` Mutation restores the raw thrown message at the catch. STOP if the harness fails before the SSE response or the mutation stays green.
- **Edit only `drainAgUiStream` at `W/server/runtime/composition/modules/assistant-ag-ui.ts:286–307`.** Replace the catch's `RUN_ERROR` message with the exact approved sentence above. Keep the original error in the returned failed outcome for the existing tracker, and keep the event close order. The upstream terminal-frame writer is outside this sheet.
- **Imports and rows.** No new imports, repoints or exports. The test harness imports `createAssistantAgUiModule` at `:120`. In `COMMIT-PLAN.md`, identify the removed catch-message read for combine to reconcile with the existing error ledger. No manual ledger rewrite. After combine, check the admin chat interruption message with the real AG-UI reader.

## UI-CHROME specs

Run with Sonnet and Claude-in-Chrome on the owner's running admin. Reproduce on the current build before editing.

| Screen | Spec |
|---|---|
| **Agent Plugins → Installed** | **UI-P1.** Find a linked provider plugin. The row should show its state, a keyboard-focusable lock/link, an explanatory tooltip and a visible route to the provider's Installed row. Check hover, focus, Enter and click. The link should land on the matching provider. **UI-P3.** Open Installed on the affected site. If the generic toast returns, capture its error ID and the failing request. The notice should name the operation that failed while keeping the loaded list usable. |
| **Resource Dashboard** | **UI-R1.** Open a card's action menu using only the keyboard. Check Up/Down, Enter and Escape. Escape should close the menu and restore focus to its trigger. |
| **Media and shared admin chrome** | **UI-M1.** Inspect tab tags and dots and an upward-opening row menu. Match computed styles to actual `tab-bar-tag`, `tab-bar-dot`, `row-menu-popup-above` and the remaining combine-8 audit candidates. Check selected and unselected tabs and the last table row. Correct selectors only where live components establish the mismatch. |
| **Admin Assistant** | **UI-A1.** Answer a two-option choice. The transcript should show the question and selected answer together, immediately and after reload. **UI-A2.** Send a user message during a long turn. It should remain a distinct user message with Copy, while the assistant run footer stays with the assistant turn. Reopen the thread and check the same grouping. |

## Owner decisions

| ID | Question | Recommendation |
|---|---|---|
| Q1 · 1318 | Should `/api/federation/reload` still refresh the agent-daemon roster? | Retire the stale listener test if the live roster uses another refresh path. Restore it only if a caller still relies on this contract. |
| Q2 · 1360 | Did the failing effective-settings request include a nonempty `namespace`? | Keep the validated 400 for missing input. Use the exact failing URL or caller to triage a regression. |
| Q3 · 1456 | Should private repository backups refuse files with credential warnings? | Apply the hard refusal to warned files before the commit starts. Preserve the existing handling of redacted database content. |
| Q4 · C7-4 | Should existing saved Search and Mail credentials carry over automatically to the new labels? | Yes. Resolve legacy labels in Tovu and use Jini labels for new writes. |
| Q5 · C8-1 | Should sites published under the old GitHub manifest keep their manifest-based file ownership after upgrade? | Yes. Use a Tovu-owned cutover to seed `.jini/managed-files.json` from the old record before the next publish. Leave Jini's provider on `jini-*` names. |
| Q6 · C9-1 | Should both owner-export and public-share ZIPs refuse warned files, or should owner exports retain acknowledgement? | Keep the hard refusal for both delivery paths, remove the unreachable acknowledgement flow, and use clean fixtures for saved-key round trips. |

## Cloud and partial work

- **O1** Review the exact published Recharts tarball and check packaged rendering against its integrity map. **O2** Run the ACP matrix against the installed supported CLIs and record capability, resume, usage, unknown-request and vendor behavior separately. **O3** Run the real-Postgres dialect set with isolated databases or serially and record both the clean run and the concurrent failure witness.
- **155** needs a trusted run identifier and a defined theme target shared across the actual edit and activation paths. Before dispatch, pin a refusal that leaves both original bytes and the active theme intact, an approval that permits subsequent steps in the same run, and a fresh approval on a new run. The existing activation card and reversible-file tests are the starting points for that design.
- The 24 PARTIAL rows each state the missing evidence in the table. The highest-priority refreshes are the site-key re-seal path, credentialed redirect refusal, the two redaction reports, and the concurrency witnesses. T3 covers the incident ID portion of 1449; the disk refusal still needs a caller contract check. The source review could establish the named merge fixes and READY edit sets, while the unresolved rows need the specific follow-up evidence recorded above.
