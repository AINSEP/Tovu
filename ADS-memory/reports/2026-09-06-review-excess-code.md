# Review: excess and dead code in the 2026-09-06 commits

- Reviewer: Refactor agent (read-only; no source edited)
- Scope: the 97 commits dated 2026-09-06 (`git log --since="2026-09-06 00:00" --until="2026-09-07 00:00"`), reviewed as the code stands at HEAD `a9f84cdc`. 186 unique paths; the 86 non-test `.ts/.tsx` source files under `apps/` were also run through the repo's own eslint config.
- Working tree was live during the review (another agent had uncommitted edits in `assistant-byok.ts` and `posts/rules.ts`). Every line reference below is to HEAD unless it says otherwise.
- Labels: **CONFIRMED** = I read the code and the defect is certain. **PLAUSIBLE** = looks wrong, not fully proven.

## Ranked findings

### 1. HIGH — CONFIRMED — A `[DEBUG]` console.error is committed at HEAD

`apps/website/src/server/runtime/composition/modules/assistant-byok.ts:95`

```ts
console.error("[DEBUG] contentDbPath=", routeDeps.contentDbPath, "TOVU_DB=", process.env.TOVU_DB);
```

- Introduced by `2cd019cd`, whose subject is "drop the Connection header on HTTP/2 SSE streams". That commit also carries an unrelated behavior change to `resolveToolAttemptAuditSink` (path resolution moved from `defaultContentDbPath()` to `routeDeps.contentDbPath`) that the subject does not mention.
- Runs inside `createAssistantByokModule`, i.e. on every `createApp()`. `app.ts` is imported by 192 test files (`grep -rl composition/app --include='*.test.ts'`), so every test run prints it.
- The working tree has an **uncommitted** edit by another agent that removes the line and wraps the sink lazily. It has not landed; HEAD still ships it.

Fix: land the removal on its own. The audit-sink path change deserves its own commit subject.

### 2. MEDIUM — CONFIRMED — SEO "clear via null" landed in two of three arms; the admin UI still cannot clear anything

Commit `eb10f5de` made `null` mean "remove this override" in the server chokepoint (`apps/website/src/features/seo/write-service.ts:172-185`) and the agent-tool schema (`features/seo/agent-tools.ts`). The admin UI arm was not updated, and it still exhibits the exact bug the fix's own header describes (`write-service.ts:23-30`: an empty-string override silently suppresses the site default).

Per-entry overrides:
- `apps/admin/src/lib/api.ts:927-945` `SeoEntryOverridesPatch` has no `null` anywhere. Its comment "Mirrors `SeoExtFields`" is now stale — the server accepts `SeoExtFieldsPatch` (`features/seo/types.ts:186`).
- `apps/admin/src/features/seo/Seo.tsx:244-327` — every text input is `onChange={(e) => setField("title", e.target.value)}`. Emptying a box stores `""` in `touched` (`hooks/use-seo-entry-panel.hooks.ts:74-76`) and `save()` PUTs it (`:84`).
- Server: `validateStringLikeFields` accepts `""` (`write-service.ts:95-101`), `applyOverridesPatch` stores it (`:180-182`), and resolution uses `??` (`features/seo/seo.ts:209,210,233,234,251,252`), so `""` beats the template/default.

Site defaults form (same family):
- `apps/admin/src/features/seo/Seo.hooks.tsx:175-179` `optionalFormString` returns `undefined` for an emptied box; its comment says "an empty box means 'no site default'". That is false: `setSeoSettings` is a merge (`features/seo/settings.ts` `buildScalarWrites` does `if (raw === undefined) continue;`), so an emptied box means **unchanged**. The server does accept `null` to clear `defaultDescription`/`defaultOgImage`/`twitterSite` (`settings.ts:49-51,222`); the form never sends it (`Seo.hooks.tsx:192-194`).

Fix: widen the admin patch types to `| null`; in the entry panel map an emptied text input to `null` (not `""`); in `optionalFormString` return `null` for blank (not `undefined`); correct both comments. Add a hook test: empty the title, save, assert the PUT body carries `title: null`.

### 3. MEDIUM-LOW — CONFIRMED — Standing-draft autosave: identical helpers and an identical banner duplicated across `pages` and `posts`

- `apps/admin/src/features/pages/rules.ts:292-303` and `apps/admin/src/features/posts/rules.ts:104-118`: `isAutosaveDraftStale` and `pageAutosaveBannerMessage`/`postAutosaveBannerMessage` are byte-identical (verified by extracting both bodies).
- `apps/admin/src/features/pages/PageEditor.tsx` `PageAutosaveRecoveryBanner` and `apps/admin/src/features/posts/PostEditor.tsx:694-735` `PostAutosaveRecoveryBanner` are identical except the `t()` wrapper and the `page-`/`post-` handle prefix. The posts copy's own doc says "Mirrors `features/pages/PageEditor.tsx`'s identical `PageAutosaveRecoveryBanner`".
- The stated justification (`posts/rules.ts:102-103`, "kept feature-local rather than shared, same 'no cross-feature import' boundary") does not hold: that boundary forbids `posts` importing `pages`, not importing `@/hooks` or `@/lib` — and both files already import `@/hooks/use-standing-draft-autosave.hooks` and `@/lib/format-timestamp`, which is exactly where the shared version belongs. The hook file was deliberately written feature-agnostic for this reason.

Fix: one `isAutosaveDraftStale` + `autosaveBannerMessage` in `hooks/use-standing-draft-autosave.hooks.ts` (or `lib/`), one `AutosaveRecoveryBanner` in `components/` taking `handlePrefix` and an optional `t`. Two-site clone, so not mandatory — but this one has the same exported name in two modules and a wrong justification attached.

### 4. LOW — CONFIRMED — Dead code left behind by today's rewrites

a. `apps/website/src/features/identity/boot-session-token.ts:118-120` — `isBootSessionTokenArmed` is exported and has zero callers anywhere in `apps/` or `development/` (the test exercises the factory's `store.isArmed()`, not this module-level wrapper). Delete.

b. `apps/desktop/src/desktop-auth.cjs:42-45` — `DESKTOP_OWNER_USERNAME = "admin"`. Commit `15548bef` removed it from `module.exports` but left the constant and a comment ("The owner account this shell seeds and logs in as … Must stay Tovu's own default owner username") describing a seeding flow the same file's header says was removed entirely. Delete both.

c. `apps/website/src/platform/site-dir/repair-site.ts:214-216` — `planRepairSite` is a wrapper that only forwards to the private `planSiteRepair`. Rename the private function to the public name and drop the wrapper.

d. Desktop bridge surface exposed but never called by any renderer file (`grep -rE '\b<name>\b' apps/desktop/src/renderer`, excluding the interface file itself):
   - `startProject` / `stopProject`: `preload.mts:77-78`, `runner-api.ts:25-26`, stubs at `runner-ipc-stubs.cjs:46-47`, channel constants `contracts/project.ts:69-70`. Main-process code says they are never needed under the N-window model (`project-ipc.cjs:8-11`). Dead across four layers — delete all four (the stub test parses the contract source, so it needs the same edit).
   - `openProjectExternal`: `preload.mts:80-81`, `runner-api.ts:30`, with a **real, tested handler** at `project-ipc.cjs:147,196`. Nothing calls it. This is the repo's dominant pattern (correct primitive, unwired sink). **PLAUSIBLE unbuilt** — Tovu-Runner's "open in browser" card action was probably not ported. Decide: port the affordance or delete the handler.

### 5. LOW — CONFIRMED — Comments that are false as of today

a. `apps/website/src/server/inbound/admin-http/admin-dev-proxy.ts:64-66` — says HTTP/2 is "now possible … once `index.ts`'s listener negotiates `h2`". `apps/website/src/index.ts:304-331` records that the HTTP/2 attempt was tried and reverted the same day. The hop-by-hop stripping itself is correct RFC 7230 hygiene — keep the code, rewrite the comment.

b. `apps/website/src/platform/site-dir/repair-site.ts:71` — "The four ways … refuse" introduces a union of five members (`:73-79`).

c. `apps/desktop/main.cjs:302` — error text "or unset `TOVU_DESKTOP_UI` to launch a site instead". Since the fleet UI became the default (`fleetUiRequested`, `:149-156`), unsetting that var changes nothing; the user has to set `TOVU_DESKTOP_SITE_DIR` or `TOVU_DESKTOP_URL`.

d. `apps/desktop/src/runner-ipc-stubs.cjs:98` — "(20, fixed — 25 total minus the 5 real handlers)". The frozen list at `:39-67` has 21 entries (3+2+5+4+1+6).

e. `apps/admin/src/features/seo/Seo.hooks.tsx:175-177` — see finding 2 (empty box does not mean "no site default").

f. `apps/admin/src/lib/api.ts:927` — "Mirrors `SeoExtFields`" — see finding 2.

g. Five `// eslint-disable-next-line …` comments that do nothing because the config sets `noInlineConfig` (eslint reports each as a no-op): `apps/admin/src/hooks/use-standing-draft-autosave.hooks.ts:136`, `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:713`, `apps/website/src/cli/commands/serve.ts:282,286`, `apps/admin/src/lib/widget-embed-extension.tsx:130`. Remove them; they claim to suppress a rule and don't.

### 6. LOW — CONFIRMED — Excess: the HTTP/2 `Connection` guard, copy-pasted four times

`site-assistant.ts:148`, `assistant-byok.ts:188`, `assistant-ag-ui.ts:412` (all under `apps/website/src/server/runtime/composition/modules/`) and `apps/website/src/server/inbound/admin-http/routes/settings/events.ts:117` each carry

```ts
...(req.httpVersionMajor < 2 ? { connection: "keep-alive" } : {}),
```

plus the same three-line comment. Every one of those comments states that omitting the header "changes nothing observable for an HTTP/1.1 client" (keep-alive is the 1.1 default). So the conditional exists only to preserve a header that is redundant on HTTP/1.1 and illegal on HTTP/2 — and this server is HTTP/1.1-only after the revert. The simplest correct code is to delete the header at all four sites; only an HTTP/1.0 client would observe a difference, and none of this server's clients speak 1.0. If the header is kept, one shared `sseOpenHeaders(req)` helper replaces the four copies.

### 7. INFO — Complexity gate is clean; two pre-existing warnings in touched files

`npx eslint --no-error-on-unmatched-pattern <86 touched non-test files>` with the repo's `eslint.config.mjs` (which applies the 9/9 `error` block to `apps/admin/src`): **0 errors, 61 warnings**. `Seo.tsx:221` `SeoEntryPanel` at cyclomatic 25 is pre-existing and registered in `development/scripts/admin-complexity-debt.json`. The `a9f84cdc` PageEditor refactor's claim (10 -> 4) holds under this invocation.

Warnings worth acting on in files touched today (both pre-existing):
- `apps/admin/src/features/source-control/ProvidersTab.tsx:100` — dead store `const translate = …` (never read; since 2026-08-16).
- `apps/admin/src/components/AssistantDock/AssistantDock.tsx:592-596` — commented-out `suggestions={[…]}` prop (since 2026-08-06).

### 8. LOW, by design — UNBUILT, not dead: the ported desktop fleet renderer has no backend for its chat half

The renderer calls 16 bridge methods (`chatStart`, `chatReattach`, `chatDetach`, `chatStop`, `chatStatus`, `saveChatAttachment`, `listConversations`, `createConversation`, `renameConversation`, `deleteConversation`, `saveConversationMessage`, `onChatEvent`, `onNavigate`, `createProject`, `deleteProject`, `openProjectWindow`). All but the last three resolve to `apps/desktop/src/runner-ipc-stubs.cjs` handlers that throw `RUNNER_MAIN_NOT_PORTED` (`:101-108`). `renderer/App.hooks.ts` (1025 lines), `renderer/fleet-chat-transport.ts` (422), `renderer/chat-attachments.ts`, `renderer/persistable-messages.ts` and `contracts/fleet-*.ts` therefore ship a UI whose primary panel throws on first use. The stubs file documents this as phase 2 (`:5-7`). Classification: **unbuilt feature**, correctly labelled — not a deletion candidate, but the shipped-default front page (`a53c80df`) now leads straight into it.

## Unreachable branch (standing rule)

`apps/website/src/server/inbound/assistant/agent-daemon-server.ts:391-408` — the `else` arm that logs "`media_promote_chat_attachment` not registered: `media_upload_asset` is not wired". Reachable only if the first-party contributor registry (`installFirstPartyToolContributors`) stops installing the media domain. That is a registry/framework contract, not something provable locally -> **KEEP**. It is module top-level code, so it cannot be direct-invocation tested as written; extract the registration into a function if a test is wanted.

## Checked and found wired (no finding)

- Optimistic concurrency on `updatePost` (`be45461e`): admin hook passes `post?.version` (`use-post-editor.hooks.ts:852,871` -> `:815`), `api.ts:2042` forwards it, `routes/posts/update.ts:72` parses it, `post.ts:952` asserts it. End-to-end.
- Standing-draft autosave route is registered (`modules/content.ts:88`) and both editor ports implement the three methods (`page-editor-dependencies.hooks.ts:28-30`, `post-editor-dependencies.hooks.ts:21-23`). Memory and SQLite repos both implement the three port methods; there is no third `PostRepoPort` adapter.
- Both chat-attachment tools are registered in `agent-daemon-server.ts:395-422`; `AttachmentStore.listPendingForOwner` exists in the Jini checkout (`node_modules/@jini-ai/http-kit/src/attachments.ts:309`).
- Boot token: minted (`serve.ts:281-283`), parsed and redacted by the shell (`tovu-server.cjs:34-58`), redeemed (`dev-auth.ts:402-438`, `desktop-auth.cjs:123-156`). The one dead piece is 4a.
- `repairSite`/`readAppliedSchemaIdentity`: wired from `development/scripts/repair-site.ts` and `content-db-schema-guard.ts`.
- `format-timestamp.ts`: 18 importers.

## Not reviewed

- Bodies of `apps/desktop/src/renderer/App.tsx`, `App.hooks.ts`, `fleet-chat-transport.ts`, `CreateWebsiteOnboarding.tsx`, `ProjectGrid.tsx` (only their IPC surface was mapped); `tovu-server.cjs`, `site-dir-store.cjs`, `project-ipc.cjs` beyond its header; the 225-line `cbb727db` restore diff.
- The ~40 `agentHandle`-tagging commits' `.tsx` diffs beyond the eslint pass.
- `post.ts` beyond the OCC/autosave symbols; `use-page-editor.hooks.ts` beyond the autosave wiring; `schema.ts`/migration `0058` beyond confirming the column exists.
- The three landing-page design commits (`f66ef907`, `b3f613a6`, `5178eea5`), all docs-only commits, and all test files.
- No tests were run, no Playwright/Chrome, no installs, no server restarts (per dispatch rules).
