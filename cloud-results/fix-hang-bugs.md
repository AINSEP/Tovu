# fix-hang-bugs (branch fix/hang-bugs, from origin/integ/wave-b)

Setup: Node 24.11, Jini `pnpm install --frozen-lockfile` + `pnpm -r --no-bail build` (several packages report
test-file type errors that predate this work but still emit `dist`), Tovu `npm ci` (root + apps/admin). Local Jini
packages were symlinked over `node_modules/@jini-ai/*` in Tovu root and apps/admin (the registry 0.7.0 copy lacks
`@jini-ai/core/agent-handles`). Not committed. No clean baseline on the unmodified tree was recorded.
Baseline fact: 96 of 99 tests in `PageEditor.unit` + `PageEditor.interactive-flush.unit` already fail with
"@jini-ai/admin screens need <AdminKitProvider>" (linked Jini admin vs. test setup); unrelated to this work.

## Finding: most of the listed hang class is ALREADY fixed on integ/wave-b
`apps/website/src/server/inbound/shared/async-route.ts` (`asyncRoute`, commits 84c4a9c0/ed2874d7) already forwards
rejections to `next(err)` and is applied to ~22 route files, including dev-auth `/auth/me` (:767) and
`/auth/me/password-status` (:829), newsletter-confirm (:18), settings/events (:363), both OAuth callbacks, theme-preview-refresh.
An AST scan of every `app/router.<verb>(…, async …)` in apps/website/src (non-test) found no async handler with a missing
try or an await before the try. It did flag these, left as is because each has a catch that answers and no reproducible hang:
- admin-http/routes/posts/delete.ts:72, posts/update.ts:138 (id lookup try/catch, then a second try covering the work)
- named-function handlers: commerce/purchase.ts:177 `read`, posts/template-preview.ts:236, agent-plugins/install.ts:127 (whole body in try),
  site/comments-submit.ts:119 (forwards `handler` rejection to next)
Not done: wrapping those five in `asyncRoute` (would change handler-extraction in direct-call tests; no failing test possible).
The typed lint `no-misused-promises` run was not done (no typed lint config in the repo); the AST scan replaced it.

## Fixes (test-first)
| # | Site | RED | GREEN | Mutation |
|---|------|-----|-------|----------|
| 1 | Tovu `settings/events.ts` `readHeadOrEndStream` (post-writeHead head read now ends the stream with one plain-words `event: error`, raw cause only in the log). Test: `settings/__tests__/events-head-rejection.unit.test.ts` | client got `fetch failed: other side closed`, no event | 12/12 in events-head-rejection + events.unit | event write disabled -> new test fails; restored |
| 2 | Jini `ui` panel-kit `use-standing-draft-autosave.hooks.ts` `clearStandingDraft(_, { keepOnFailure })`: banner/local copy/stale gate stay until the server confirms. Test in `use-standing-draft-autosave.hooks.test.tsx` | 2 failed (banner cleared on refused/failed discard) | 23/23 | always-settle -> 2 fail; restored |
| 3 | Tovu admin `use-post-editor.hooks.ts` `discardRecoveredDraft` (PostEditor.tsx banner via controller) uses keepOnFailure + plain error "Could not discard the recovered draft…" | `recoverableDraft` was null after failure | pass | option removed -> fail; restored |
| 4 | Tovu admin `use-page-editor.hooks.ts` `discardRecoveredDraft` (PageEditor banner) same | same | 127/127 in use-page-editor.unit | option removed -> fail; restored |
| 5 | Tovu admin `use-post-editor.hooks.ts` drag-drop and paste upload (`uploadDroppedFile` onError, `handleFileDrop/Paste`, `formatUploadFailureMessage`, wired via FileHandler to the editor's `error` line: names the file and the cause) | both new tests failed (no onError call; `error` null) | 97/97 in use-post-editor.hooks.unit | `onError?.()` removed -> both fail; restored |

## Not reproducible / already safe (regression test added where cheap)
- Jini `core/src/settings/express/http.ts` `wrap()`: `resolvePrincipal` already catches a ready/resolver rejection and returns 401 (existing test settings-http.test.ts:97). No change.
- Jini `diagnostics` `tracker.metric()`: the observability port is always wrapped by `combineObservabilityPorts`, whose `metric` catches sync and async failures (fanout.ts:113). Added `tracker-metric-rejection.unit.test.ts` (passes before and after; no unhandled rejection, one warning). No code change.
- Desktop `main/index.ts` before-quit: already has the `.catch` after `desktopAgentService.shutdown` and still drains pending teardowns (:1130-1140). No change.

## Left
- Tovu admin must depend on a Jini release containing `keepOnFailure` (patch changeset `.changeset/standing-draft-discard-keep-on-failure.md`); until then the posts/pages hooks do not typecheck against registry 0.7.0.
- `tsc` for admin reports `discardStandingDraft: () => Promise<void>` vs `Promise<{discarded}>` at use-post-editor.hooks.ts:1030 and use-page-editor.hooks.ts:1136; this mismatch predates these edits. Not fixed.
- i18n keys for the two new admin messages are English-only (fallback to key).
- Full admin suite not run (time); ran posts + pages dirs: only the baseline AdminKitProvider failures.
