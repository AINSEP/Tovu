# Handoff: tovu-d6 → tovu-c4 (2026-09-07)

Received via cross-session message. Verbatim transfer package, persisted before any action.

Branch: `restructure/apps-website-phased`. Nothing mid-flight; all three subagents stopped.

## 1. Current state
External audit of the last two days (base `24c71a5be3bb0668acbe1ff6a614f888baefeb7f` → HEAD) by
Codex GPT-6-Astra, killed by quota before finishing. Left 21 unverified CLAIMS. tovu-d6 dispatched
3 Opus subagents to verify-then-fix. 22 commits landed. Two agents never delivered a final report.

## 2. Uncommitted (shared tree — whole pathspec list)
3 tracked files, all MODIFIED, all in the suite that hangs (§7):

```
apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts
apps/website/src/cli/__tests__/integration/serve-command-boot-lifecycle.integration.test.ts
apps/website/src/cli/__tests__/integration/serve-command-plugin-sdk-resolver.integration.test.ts
```

Untracked and NOT tovu-d6's (pre-existing): `development/scripts/check-jini-registry-drift.mjs`,
`apps/website/src/cli/__tests__/integration/zzz-debug-cr-r04-2.test.ts`,
`ADS-memory/reports/2026-09-0[56]-*.md`.
New untracked dir from its run: `apps/website/src/cli/__tests__/helpers/`. Nothing stashed.

## 3. Subagents — all STOPPED, nothing to adopt
- **FixDesktop** — completed all 10 claims, 9 commits, reported in full. Idle cleanly.
- **FixWebsite** — TaskStopped by tovu-d6. Commits landed but NEVER REPORTED.
- **FixAdmin** — TaskStopped on owner's instruction. Commits landed but NEVER REPORTED.

## 4. Artifact paths
`ADS-memory/.local-artifacts/external-audit/runs/2026-09-07-codex-astra/`
— `partial-{website,admin,rest}.md` are the salvaged Astra narration (the only surviving audit
output; no final JSON, runs died at `turn.failed` on quota). Also `prompt-*.txt`, `commits.txt`,
`files-*.txt`. No report doc was written — the handoff message IS the report.

## 5. Remaining worklist

### A. Never touched — no commit exists
1. **MCP drift detection drops a still-live connection** when its saved config has been deleted
   (`apps/admin`, MCP settings). Confirmed zero commits.
2. **Stale-settlement race sweep of hooks added in this window** — setState-after-unmount,
   out-of-order responses overwriting newer state, missing `useEffect` cleanup, missing `key=`.
   Zero commits. (`fa54c24d` says "stale" but is AAD CAS, unrelated.)

### B. Ambiguous — needs a decision
3. **Slug/UUID collision** (`28f46bbb`) is TEST-ONLY: 123 lines added, 0 source lines. Either the
   collision was already prevented and the agent pinned it, or it is a live bug never fixed.
   FixWebsite never reported — genuinely unknown. Settle by reading the test plus the id-or-slug
   resolution order in `features/widgets/resolver-service.ts` and `routes/media/original.ts`.

### C. New problems found today, NOT in the Astra report
4. **Chat assistant has no page-copy tool and no site-page navigation tool.** Registry has full CRUD
   for posts (`content_post_*`) and themes (`theme_*`), but pages have only `page_action` — which
   drives the ADMIN SPA, not site content. Repo-wide the only copy primitive is
   `sites_duplicate_site` (whole site). This is why "copy Landing sample — xai and name it
   'Landing Page'" failed. The error text "is not a published page" (from `@jini-ai/agentic`'s
   page-executor) is misleading — site pages are never in that namespace.
5. **`serve-command*.integration.test.ts` hangs 3-for-3** on this machine (§7). Quarantine or fix.
6. **`higgsfield` MCP refuses 9 tools** as `not-in-operator-allowlist` (`show_characters`,
   `tiktok_*`); only `generate_image` and `reveal_generation` admitted. Refusals reach ONLY the
   daemon log — the assistant never sees them. Allowlist is read at daemon START.
7. **Broken media embed**: `[widgets] resolveHtmlPageEmbeds: unresolved "media" reference — missing
   or invalid "id"/"variant" in data-embed-config`, workspace `workspace-local`.
8. **738 rows of chat history invisible**: 157 `ai_chats` + 562 `ai_chat_messages` +
   19 `assistant_agent_sessions` still in `content.db`; the assistant reads only `chat.db`.
   Migration script `development/scripts/split-chat-data-into-chat-db.ts` — safe to run NOW (its
   same-file data-loss bug was fixed today in `12c539d6`), but dry-run and back up both DBs first.
9. **Redacted 500s are undiagnosable in the UI.** `@jini-ai/http-kit`'s `adapter.js:81-85` catches,
   sends the real error to a sink via `console.error` only, and returns bare `INTERNAL_ERROR` with a
   `requestId`. Repo already has a test documenting this trap for media-import
   (`tool-registrations.media-import-egress-refusal.integration.test.ts:22`); Page Navigate is the
   same class, unfixed.

## 6. VERIFIED vs UNVERIFIED

### Verified by tovu-d6, by execution, not by report
- **Stored XSS is FIXED.** `parseMediaHtmlAttributes("data-x><svg/onload=alert(1)")` now returns
  `error: {reason:"disallowed-name"}`; pre-fix it returned `error: null` and `render.ts:641`
  interpolated the name raw. Commit `5fb17200`.
- AAD CAS predicate present in ALL SIX `backfill-*-aad.ts` scripts (each file checked, not the report).
- `delete webPreferences.preload` has 0 occurrences; `main.cjs:414` assigns via `applyGuestWebPreferences`.
- Root `npx tsc -p tsconfig.json --noEmit` exits 0.
- `apps/desktop` declares `tsx ^4.19.3`, byte-identical to root; root lockfile untouched.
- Migration pin removed — the AAD fixture now reads `_journal.json` instead of a hardcoded tag.
- `development/scripts` tests: 15 passing across the two files it ran itself.

### UNVERIFIED — do not inherit as truth
- **Everything FixWebsite claims.** Its test suite hung three times for over an hour; no
  proven-by-test vs proven-by-code-reading split was ever delivered. Commits `c85e2e38`, `63b8ab7c`,
  `ebe760d8`, `f208e5c8`, `ed10c0b7`, `28f46bbb` exist and look plausible — `c85e2e38` does contain a
  real 55-line source change to `media-rendition.ts` plus an 88-line test — but none were run.
- **Everything FixAdmin claims** (`e8a81a61`, `e5394b55`, `48b91af5`, `08884738`, `807e94e1`,
  `958fdd65`). Never reported.
- FixDesktop's report was detailed and its spot-checks held every time one was tested, but its full
  suites were not re-run.
- The Astra claims themselves were only ever claims — a peer audit that died mid-run. Treat any
  unfixed one as unconfirmed.

## 7. In-flight / will-break warnings
- **Dev server is UP and healthy**, started by the owner:
  `node development/scripts/dev.mjs > /tmp/tovu-dev.log 2>&1 &`. API 200 on :3000, Vite 200 on :5173,
  one daemon tree on `127.0.0.1:52555`. **Keep the log redirect** — the owner cannot see the console,
  and `@jini-ai/http-kit` writes real stack traces only to stdout.
- **`serve-command*.integration.test.ts` HANGS — do not run it.** Three consecutive invocations sat at
  0.0% CPU state S (one for 64 minutes). They orphan `tovu serve` children that break the live dev
  server and agent daemon; duplicate daemons then serve stale tool calls — that is what broke the
  owner's chat mid-session. **Trigger: passing multiple files to one `node --test` invocation.**
  Cost about an hour.
- Saves to `apps/website/src` kill and respawn the agent daemon; saves to `apps/admin/src` full-reload
  the admin and DESTROY a live chat run. Check whether the owner is using chat before writing.
- The harness BLOCKS `kill` for the assistant. Process cleanup must be run by the owner with
  `! kill ...`. Do not route it through a subagent.

## 8. Operational notes
Shared git index across agents — explicit paths, unique commit-message files, never `git add -A`,
never bare `git stash`. `timeout` does not exist on macOS. Never `2>/dev/null`.
Trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## 9. Cutover status
tovu-d6 is standing by, NOT stood down, awaiting the owner's word.

---

# Addendum: dispatch-ready worklist (tovu-d6, 2026-09-07)

tovu-d6 keeps ownership of nothing. Three additions to §5:

- **10. Chat assistant prompt contradicts itself.** Run `af801f5f`: assistant said its admin-assistant
  framing forbids Bash while the bypass-permissions reminder prefers it; `Bash` IS in its 40-tool grant.
  Prompt-assembly bug. Evidence in `events_json` of that run in `sites/tovu-com/chat.db`.
- **11. Fate of the 3 uncommitted files + untracked `helpers/` dir.** FixWebsite's orphaned WIP from a
  suite that never ran to completion. Commit or revert — do not leave straddling.
  `helpers/remove-fixture-tree.ts` may be a real extraction worth keeping.
- **12. Astra claim 21 CLOSED, do not re-dispatch.** Desktop E2E title claim was NOT-A-BUG:
  `page.title()` returns `document.title`, not the native window title; `main.cjs:342` only pins the
  BrowserWindow title. Verified by FixDesktop.

## Priority
1. Re-verify 12 unreported commits · 2. C5 serve-command hang · 3. B3 slug/UUID · 4. A1 MCP drift ·
5. C7 media embed · 6. A2 settlement sweep · 7. C4 page tool gap · 8. C9 redacted 500s ·
9. #10 prompt contradiction · 10. C6 higgsfield allowlist (blocked on Leona).
Cut nothing. **C8 (738-row chat migration) must NOT go to an agent** — mutates a live 44MB `content.db`.

## Parallel batches
- **Batch 1 (concurrent, no overlap):** V-WEB, V-ADMIN, C5-investigation.
- **Batch 2 (after 1):** B3 + C7 **serialized with each other** (both land in
  `features/widgets/resolver-service.ts`); C9 safe alongside.
- **Batch 3 (needs Leona's go-ahead):** A1 then A2 — both write `apps/admin/src`, they COLLIDE, and
  writing there full-reloads admin and DESTROYS a live chat run.
- **Never parallel:** C8.

## Unsafe to hand an agent
Running `serve-command*` in any form; any process kill or dev-server restart (harness blocks `kill`;
routing it to a subagent is permission laundering); writing `apps/admin/src` while chat may be open; C8.

## Re-verification packet (2 items, split by runner)
```
c85e2e38  apps/website/src/server/__tests__/media-rendition-gating-bypass.test.ts
63b8ab7c  apps/website/src/platform/site-dir/__tests__/integration/duplicate-site.integration.test.ts
ebe760d8  apps/website/src/cli/__tests__/unit/serve-site-dir-pin.unit.test.ts
f208e5c8  apps/website/src/platform/site-dir/__tests__/unit/site-registry.unit.test.ts
ed10c0b7  apps/website/src/contracts/core/events/__tests__/outbox-worker.test.ts
28f46bbb  apps/website/src/server/__tests__/media-slug-uuid-collision.test.ts
e8a81a61  apps/admin/src/features/pages/__tests__/{PageEditor.unit.test.tsx,rules.unit.test.ts,use-page-editor.unit.test.ts}
e5394b55  apps/admin/src/features/pages/__tests__/Pages.unit.test.tsx
48b91af5  apps/admin/src/hooks/__tests__/use-standing-draft-autosave.unit.test.ts + apps/admin/src/lib/__tests__/api-autosave-keepalive.unit.test.ts
958fdd65  apps/admin/src/features/collections/__tests__/CollectionEntries.unit.test.tsx
08884738  NO TEST — i18n: assert all 27 keys exist in all 21 locales
807e94e1  NO TEST — doc-only: confirm the corrected claim is now true
```
Done = pass/fail per commit PLUS "would this test still pass with the bug reintroduced?"
Caveat from tovu-d6: distrust is procedural (agents stopped before reporting), not suspicion. Expect mostly greens.
