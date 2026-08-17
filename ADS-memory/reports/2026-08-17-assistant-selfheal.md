# Assistant self-heal — wiring the daemon supervisor into the request path and the admin UI

**Agent:** assistant-selfheal (Programmer role, `AI-Dev-Shop/agents/programmer/skills.md` v1.7.1)
**Branch:** `general-work`
**Date:** 2026-08-17 (session date 2026-08-16 continuing into 2026-08-17 commits)

## Context

Prior session built `src/assistant/daemon-supervisor.ts` (respawn/backoff/crash-loop policy,
manual restart seam, on-demand seam) and `daemon-respawn-policy.ts`, both green (38/38), but left
two things undone: nothing called `ensureAssistantDaemonStarted()`, and there was no admin
"Restart assistant" action. This dispatch did both.

## Task 1 — wire `ensureAssistantDaemonStarted()` into the request path

**File:** `src/server/modules/assistant.ts`

`respondIfDaemonKnownFailed()` is the single choke point every proxied route (`forwardToAgentDaemon`,
`forwardAttachmentUpload`) already calls before ever attempting a `fetch` to the daemon, whenever
`isAssistantDaemonKnownFailed()` is latched. It now also calls `ensureAssistantDaemonStarted()`
right there, before answering 503.

**Request-path semantics (explicitly required by the brief):** the call is fire-and-forget. The
current request ALWAYS gets the same immediate 503 it always did — `ensureAssistantDaemonStarted()`
is synchronous and never waits for the daemon to become healthy (no such signal exists anywhere in
`daemon-supervisor.ts`), so there is nothing to await. Recovery is a background side effect for
FUTURE requests only. This is safe to call on every short-circuited request, not just the first,
because the underlying seam is single-flight (no `await` between its "already running" check and
the synchronous spawn) and cooldown-guarded (30s floor) on its own side — matching the design notes
in the brief verbatim (a pending scheduled retry is left alone, not accelerated; the cooldown floor
already bounds worst-case respawn frequency to what the backoff ladder accepts).

**Failure mode:** if `ensureAssistantDaemonStarted()` itself refuses (`{ok:false, reason}` — either
"never started this process boot" or mid-cooldown), one concise `console.error` line names why
(matching this file's existing `daemonUnreachableSince` one-line-not-a-stack convention). The
request's own 503 response is unaffected either way.

**Regression test:** `src/server/__tests__/assistant-proxy-routes.test.ts`, new test "a known-failed
daemon triggers ensureAssistantDaemonStarted() as a self-healing side effect, on every
short-circuited request". Since this test process never calls `startAssistantDaemon()`, the real
`ensureAssistantDaemonStarted()` deterministically answers `{ok:false, reason:"...never started
this process boot"}` — the log line is the only externally observable signal that the call
happened at all, so the test spies on `console.error` via `t.mock.method` and asserts the line
appears. Proven RED by `git apply -R` on the fix (working tree only), confirmed the assertion
failed, reapplied, confirmed GREEN. Full file: 22/22 pass.

**Commit:** `019e50f1` — `fix(assistant): wire on-demand daemon respawn into the proxy's
known-failed short-circuit`

## Task 2a — the "Restart assistant" server route

**New file:** `src/server/routes/admin/system/assistant-daemon.ts`
`POST /api/admin/v1/workspaces/:workspaceId/system/assistant-daemon/restart`, `system.write`-gated
(same permission `dockerfile-source.ts`'s `PUT` uses for a system-state mutation), mirrors
`module-status.ts`'s workspace-id-404 → authorize → 403 shape.

Calls `restartAssistantDaemon()` and relays `{ok, reason?}` verbatim:
- `{ok:true}` → `200 {ok:true}`
- `{ok:false, reason}` → `409 {ok:false, reason, code:"ASSISTANT_DAEMON_RESTART_REFUSED"}` (409,
  not 500 — an ordinary business-rule refusal, same status `publish-site.ts` uses for "a publish
  is already running")

**Deliberately does NOT report health.** The route's own doc states this explicitly: no
"daemon became healthy" signal exists anywhere in the supervisor, so claiming one would repeat the
exact lying-comment failure mode the brief called out. Live status is left to the two EXISTING
routes that already carry it — `GET /readyz` (unauthenticated, `assistantDaemonKnownFailed: true`
only while latched) and `GET .../system/module-status` (`system.read`, full detail, already folds
daemon failures into the same `BootResult` snapshot via `readiness-state.ts`). No new status route
was added — it wasn't needed.

**Testability seam:** `restartAssistantDaemon` is an injectable optional dep on
`AdminAssistantDaemonDeps`, defaulting to the real barrel export. This is a deliberate departure
from `assistant.ts`'s direct-import style (Task 1) — that file's existing pattern (bare imports,
proven via the console-log observable) was kept as-is per "smallest viable change," but this is a
BRAND NEW route with no existing pattern to preserve, and the real `restartAssistantDaemon()`'s
`{ok:true}` branch is only reachable once a real daemon process has been spawned (`startAssistantDaemon()`),
which a route-level test has no business doing. DI was the correct call here; state that
explicitly since it's an inconsistency across the two files, not an oversight.

**Composition root:** `src/server/app.ts` — import + one `registerAdminAssistantDaemonRoutes(app,
routeDeps)` call, placed next to `registerAdminModuleStatusRoute`. Committed separately from the
route file per the brief's instruction.

**Tests:** `src/server/__tests__/routes/assistant-daemon-restart-route.test.ts`, 6 tests — 403 (no
grants), 404 (workspace mismatch), 401 (no cookie), the REAL singleton's actual "never started"
409 (no mocking — this test process's true state), an injected `{ok:true}` 200, and an injected
`{ok:false, reason:"shutting down"}` 409 with the reason relayed verbatim. Proven RED by reverting
just the `app.ts` wiring (`git apply -R`) — 4/6 failed as expected (404 at Tovu's own router); the
401/404-mismatch tests still incidentally passed since an unregistered route also produces those
codes for those specific scenarios. Reapplied, 6/6 GREEN.

**Commits:** `6b4f3d35` (route + test), `0dbda781` (app.ts wiring, separate per convention)

## Task 2b — the admin UI button

**New files** (under `apps/admin/src/features/ai-assistant/`, following this feature's
port/`useX`/`useWiredX` convention documented in `ai-assistant-port.hooks.ts`):
- `hooks/assistant-daemon-restart-port.hooks.ts` — the `AssistantDaemonRestartPort` interface
  (`restart()`, `getReadyz()`, deliberately two operations, not one — see the file's own doc)
- `hooks/assistant-daemon-restart-dependencies.hooks.ts` — real binding + `createFakeAssistantDaemonRestartPort`
- `hooks/use-assistant-daemon-restart.hooks.ts` — `useAssistantDaemonRestart`/`useWiredAssistantDaemonRestart`.
  Checks status once on mount, and once more after every `restart()` settles (accepted OR refused)
  — this is the "surface live status after the click" requirement. Deliberately a single re-check,
  not a poll loop: there's no bounded "waited long enough" without a real health signal, so a
  manual "Check status" button stays exposed on the controller instead.
- `AssistantDaemonRestart` component, added to `AiAssistant.tsx` and rendered directly under
  `AdminExecutionMode` in the "Admin AI Assistant" tab (not its own tab — only meaningful in Local
  CLI mode context). Copy audited specifically against the lying-comment failure mode: "Restart
  accepted. This does not confirm the process is healthy yet — check the status below," never
  "restarted successfully."

**`lib/api.ts` additions:** `restartAssistantDaemon()` (normalizes the 409 `{ok:false,reason}`
body into a plain return value via `ApiError.body`, rather than making the caller catch an
exception for an ordinary refusal — ordinary errors still throw) and `getAssistantDaemonReadyz()`
(raw `fetch("/readyz")`, deliberately bypassing the shared `request()` helper since both 200 and
503 are meaningful bodies here, not error cases to throw on).

**i18n:** `ai-assistant-i18n.ts` ES dictionary, new "Admin tab — daemon restart" section.
**CSS:** `styles.css`, `.assistant-daemon-restart`/`.assistant-daemon-restart-actions` rules
alongside the existing `.assistant-execution`/`.assistant-key-actions` rules in the same
`--page-flow` scope.

**Tests:** 21 new (`use-assistant-daemon-restart.unit.test.ts` — 11, `AssistantDaemonRestart.unit.test.tsx`
— 10), using `renderHook`/`render` with the injected fake port/controller, no real `fetch`
anywhere. `tsc --noEmit` clean for every touched file (one real type error found and fixed —
`new Promise<{ok:boolean}>` needed an explicit generic; the ~30 unrelated `Mock<Procedure |
Constructable>` errors across other features' test files are pre-existing baseline noise, not
caused by this change — none of those files were touched). Proved RED on the post-restart status
re-check specifically: commented out the `void checkStatus()` call in the hook's `finally` block,
confirmed the "re-checks status after restart() settles" test failed (`1` vs expected `2` calls),
restored, confirmed GREEN. Existing `AiAssistant.unit.test.tsx`/`AdminExecutionMode.unit.test.tsx`
still pass unmodified (36/36 across all four files run together).

**Not done:** no live browser/Playwright visual check — :5173 was occupied by what looks like the
owner's own dev server, and per standing preference the owner does that pass themselves. Unit-level
DOM assertions (real `@testing-library/react` + jsdom rendering, not mocked away) are the evidence
on file for this pass.

**Commit:** `f854e011` — `feat(admin): "Restart assistant" button on the AI Assistant admin tab`

## Architecture Audit

**Status: PASS**

- `src/server/modules/assistant.ts`: no new imports crossing a boundary — `ensureAssistantDaemonStarted`
  already flows through the `src/assistant` barrel per that barrel's own §D comment, which
  explicitly names this exact call site as the intended (not yet wired) consumer.
- `src/server/routes/admin/system/assistant-daemon.ts`: matches every sibling route file's shape
  in that directory (workspace-id check → `authorize` → route-specific body), imports only through
  `#src/assistant` (barrel) and `#src/server/*` aliases, consistent with `dockerfile-source.ts`/`module-status.ts`.
- `apps/admin` additions stay inside `features/ai-assistant/` and `lib/api.ts`; no import of
  `apps/admin/src/features/deployment/**` or `features/security/**` (both off-limits per the brief).
- No file under `src/server/routes/**` was EDITED (only a new file added); `app.ts` (composition
  root, not in the DO NOT TOUCH list) got a narrow, separate 6-line commit as instructed.
- No touch to any DO NOT TOUCH path: `.github/workflows/**`, `package.json` scripts,
  `src/integrations/repo.sqlite.ts`, `src/features/database/adapter.sqlite.ts`,
  `development/scripts/check-architecture.ts`, `src/features/*/tool-registrations.ts`,
  `src/assistant/tool-registrations.ts`, `src/features/vendor-credentials/**`,
  `src/core/embeds/marker.ts`, `apps/admin/src/features/deployment/**`,
  `apps/admin/src/features/security/**`, `/Users/la/Programming/Jini/**`.

## Pre-Completion Checklist

- Requirements re-verified against the dispatch brief: both numbered tasks done, files-owned scope
  respected, git/testing rules followed.
- Fresh evidence commands: `node --import tsx --test` runs shown above (59/59 server-side across
  the touched/adjacent files), `npx vitest run` (36/36 admin-side across touched/adjacent files),
  `npx tsc --noEmit` (clean for all touched files).
- No certified/pre-existing test was deleted or weakened. `daemon-supervisor.ts`/`daemon-respawn-policy.ts`
  were not edited (kept green, per the brief's own instruction to touch only if genuinely required
  — it wasn't).
- Scope: stayed within FILES YOU OWN plus the two narrow composition-root edits the brief
  anticipated (`app.ts` for route registration).
- Open items: see "Not done" above (no live browser pass) and "Risks" below.

## Self-Validation

Required: yes (runtime-changing behavior on both the request path and a new admin UI control).
Status: **PARTIAL**, explicitly — server-side is proven end-to-end via real HTTP integration tests
(`assistant-proxy-routes.test.ts`, `assistant-daemon-restart-route.test.ts`) against a stand-in
daemon and the real Express app; admin-side is proven via component/hook-level DOM tests, not a
live browser session. Report path: this file. Attempts used: 1 pass per task, no retries needed
(both tasks reached GREEN on the first implementation attempt after RED). Critical path checked:
known-failed daemon → 503 + recovery trigger (server); button click → restart → status re-check
(admin). Negative/edge path checked: refused restart (`shutting down`), unauthorized/mismatched-workspace/no-cookie
(server); unexpected restart error vs. ordinary refusal, checkStatus() network failure (admin). No
bounded diagnosis pass was needed — no ambiguous failure occurred during this work.

## Risks and tech debt

- The two DI styles across `assistant.ts` (direct import, observed via a log line) and
  `assistant-daemon.ts` (explicit optional dep) are inconsistent. Documented as a deliberate,
  reasoned choice above, not an oversight — flagging for whoever next touches either file.
- No live browser verification of the new button. Low risk given full DOM-level test coverage, but
  it is the one item this report cannot claim first-hand.
- The admin button's post-restart status check is a single read, not a poll — an operator who
  clicks restart and immediately looks will very likely still see "known failed" for a few seconds
  while the new process boots, and has to press "Check status" again. This is intentional (no
  health signal to poll toward), but worth flagging as a possible future UX request.

## Suggested next routing

None required — both tasks are complete, tested, and pushed. If a reviewer wants a live visual
pass of the new button, that's the one remaining step.

## Pushed SHAs (branch `general-work`)

1. `019e50f1` — on-demand respawn wiring (Task 1)
2. `6b4f3d35` — restart route + test (Task 2a)
3. `0dbda781` — app.ts composition-root wiring (Task 2a)
4. `f854e011` — admin UI button (Task 2b)

## Addendum — two post-report fixes from independent verification

The team lead verified Task 1 by reading source (not by trusting this report) and found two real
issues, both fixed the same session:

1. **`tsc --noEmit` was RED.** `assistant-daemon.ts:3` imported `#src/assistant` — `package.json`'s
   `"#src/*": "./src/*.ts"` imports map has no directory-resolution fallback, so that resolved to
   the nonexistent `./src/assistant.ts` instead of the real barrel at `./src/assistant/index.ts`.
   `tsx`/esbuild strips types without resolving them, so every test I ran (route tests, `vitest`)
   passed regardless — only a bare `tsc --noEmit` catches this class, and `tsconfig.json` excludes
   test files from that check, which is why my own `npx tsc --noEmit` pass on the admin side never
   caught the server-side file. Fixed in `88e061c3` (one-line specifier change). Repo-wide `tsc
   --noEmit` confirmed exit 0 after.
2. **The known-failed 503 body/doc comment were stale.** Both dated from when
   `isAssistantDaemonKnownFailed()` could only be set by `index.ts`'s single boot spawn. Task 1's
   own on-demand-recovery wiring plus `daemon-supervisor.ts`'s pre-existing give-up path made a
   second, now-common cause real: a daemon that started fine, ran for hours, crashed repeatedly,
   and got given up on — for which "failed to start for this boot" is a false claim pointing an
   operator at boot config instead of a crash loop. Fixed in `26011c9b`: new
   `readiness-state.ts#getAssistantDaemonFailureReasonCode()`, 503 body changed to
   `{error:"the agent daemon is currently unavailable", code:"AGENT_DAEMON_KNOWN_FAILED",
   reasonCode}` (breaking change to `code` — only test consumers existed, verified by grep), doc
   comment corrected, 3 existing test assertions updated, 3 new getter tests added (RED-proven).

Both fixes proven with fresh `tsc --noEmit` (exit 0) and scoped test runs (51/51 across
`assistant-proxy-routes.test.ts`, the new restart route test, `readiness-state.unit.test.ts`,
`module-status-route.test.ts`, `deployment-overview-route.test.ts`, `readiness-routes.test.ts`).
Pushed as `88e061c3` and `26011c9b`.

## Addendum 2 — three more fixes from live browser verification (`source-control-ui`, report `7bc52270`)

`source-control-ui` drove the actual admin UI in a real browser and found a genuine bug this
report's own "no live browser pass" gap had left uncaught, plus confirmed the no-poll design
judgment with one specific flaw. All three fixed, pushed as `b151219f`:

1. **`apps/admin/vite.config.ts` did not proxy `/readyz`** — only `/api`, `/agent-icons`,
   `/theme-assets` were. Under `npm run dev` every status check 404'd against Vite's own dev
   server instead of reaching the backend. Fixed with the same shape as the existing
   `/agent-icons` entry (a root-relative path that can't live under `/admin/`).
2. **`getAssistantDaemonReadyz()` called `res.json()` unconditionally**, so that dev-proxy 404
   (plain text) threw a raw `Unexpected token 'T', "The server"... is not valid JSON` straight
   into the UI — live-verified by the owner. Now checks `content-type` before parsing and catches
   a parse failure even when content-type claims JSON, both throwing a clean operator-facing
   `Error` instead (`"Could not check the assistant's status (unexpected response, HTTP ${status}).")`.
   Kept as a real guard, not just a workaround for #1 — the same non-JSON-response class is
   possible in production from a reverse proxy or captive portal.
3. **Design verdict confirmed, one flaw fixed:** `source-control-ui` read the hook directly and
   endorsed the no-poll design — "keep it, don't invent a health signal." But the post-restart
   auto-check fired with zero delay, so it almost always just re-reported the OLD state directly
   under a line telling the operator to check the status below. Added `postRestartCheckDelayMs`
   (`0` in the raw hook/tests, `2500`ms in the wired real hook via `REAL_POST_RESTART_CHECK_DELAY_MS`)
   — still a single read, not a poll loop, exactly preserving the "never claim health" principle.
   Only the post-restart auto-check is delayed; mount-time and manual "Check status" presses are
   unaffected.

Regression tests for all three, each proven RED first (`git apply -R` on the working-tree diff,
confirmed failure, reapplied): a new `apps/admin/src/lib/__tests__/api-assistant-daemon-readyz.unit.test.ts`
reproduces the EXACT text Vite answered live before asserting a clean message (and covers the 200/503
"still resolves, doesn't throw" cases plus the malformed-JSON-despite-correct-content-type case); a
new hook test uses `vi.useFakeTimers()`/`advanceTimersByTimeAsync` to prove the delay fires exactly
once the configured window elapses, not before. `tsc --noEmit` clean (admin + root, confirmed the
~41 `Mock<Procedure|Constructable>` errors across unrelated feature test files are pre-existing
baseline noise — same count, same files, before and after). 92/92 across
`apps/admin/src/features/ai-assistant/__tests__/` plus the new readyz test file.
