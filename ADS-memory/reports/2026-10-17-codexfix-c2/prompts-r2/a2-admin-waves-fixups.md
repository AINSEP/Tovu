# Follow-up: admin boot-waves fix — 3 failing test files + 2 trims

Persona: Programmer (read /Users/la/Programming/Tovu/AI-Dev-Shop/agents/programmer/skills.md Role section).
Repo: Tovu (/Users/la/Programming/Tovu), apps/admin. You (an earlier Codex run) made the uncommitted
boot-waves change in apps/admin/src (report: ADS-memory/reports/2026-10-17-codexfix-c2/out-r1/a-admin-settings-waves.md;
see `git diff -- apps/admin/src` plus untracked lib/admin-boot-scope.ts,
__tests__/app-boot-request-volume.test.tsx, __tests__/admin-boot-readers.test.tsx).
Ignore apps/admin/src/features/sites/__tests__/AllSitesTab.unit.test.tsx and the apps/admin/src/features/plugins/*
and styles.css diffs: another lane owns those; do not touch them.

RULES: do NOT run tests, typecheck, builds or servers. Do NOT commit or touch git state. Report
`CHANGED FILES:` + `NOT DONE:`. Smallest change. Move "why" comments with code, never delete them.
Fix production code, not the assertions, unless the assertion pinned behaviour your change
intentionally and correctly altered — then say which assertion and why in your report.

Our named-file run: 60 files, 3 failed (25 tests). Fix these:

## 1. components/__tests__/AssistantDock.hooks.unit.test.tsx — 23 tests
Every `useExecutionConfig` / "dock picks under StrictMode" test fails with:
```
Error: Fetch-query hooks require FetchQueryProvider
 ❯ useCachedLoader .../Jini/packages/ui/src/features/panel-kit/fetch-query/binding.react.tsx:26:99
 ❯ Module.useExecutionConfig src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:176:24
 ❯ src/components/__tests__/AssistantDock.hooks.unit.test.tsx:215:41
```
Production always mounts under main.tsx's FetchQueryProvider, so wrap these renderHook calls in a
provider (the existing helper `@/__tests__/fetch-query-provider.test-helper`, a fresh provider per
test), keeping every assertion. If an assertion then fails by design of the cache (e.g. a StrictMode
stale-read test), make production satisfy the original intent; explain anything you changed.

## 2. components/AssistantDock/__tests__/fqfix-daemon-online.unit.test.tsx — REVERT the daemonOnline change
```
FAIL > probes localhost outside an offline query gate and shares only the pending transport
AssertionError: expected +0 to be 1   (fqfix-daemon-online.unit.test.tsx:25)
```
The health probe must still reach the local daemon when the browser is offline, and only share the
PENDING request (the test expects a 2nd call after settle). Restore the original `readDaemonOnline`
+ `pendingHealth` ref implementation of `daemonOnline` in `useRuntimeAccess` (and its original doc
comment) exactly as at HEAD. Then in `__tests__/app-boot-request-volume.test.tsx` set the
`/api/agents` expectation to the real boot count with a one-line comment why (list + the health
probe the chat pane runs on mount), if the health probe fires during boot.

## 3. lib/__tests__/shared-stream-adapters.unit.test.ts — first-open skip swallows a resumed source's open
```
FAIL > shared settings EventSource adapter > fallback releases its source after 30s hidden and resumes its cursor without changing native retries
AssertionError: expected [ [ 'seo' ] ] to deeply equal [ [ 'seo' ], undefined ]   (line 61)
```
In that test the first source received a settings frame (cursor "12") but never emitted `open`; the
replacement source's `open` must still publish. In `lib/settings-events.ts` skip only an open that
arrives before ANY frame/open has been seen on this subscription (e.g. `if (opened || cursor) publishSettings()`),
so boot's first attach stays quiet while every reconnect/resume still re-reads. Keep the comment explaining why.

## 4. Trim (not needed for the waves)
Revert the principal-scoped agents placeholder: `lib/assistant-agents-snapshot.ts` and its test
`lib/__tests__/assistant-agents-snapshot.unit.test.ts` back to HEAD, and drop the `principalId`
plumbing that only fed it in AssistantDock.hooks.tsx (`recordAgents`/`replaceAgents`/`rescanAgentsInto`
options, `readAgentsSnapshot({ principalId })` calls, `useLocalCliSelection`'s principalId). Keep the
principal-scoped QUERY keys (those guard the now long-lived cache across logins).
If any of your round-1 tests (admin-boot-readers.test.tsx) asserted the placeholder isolation, remove that case only.
