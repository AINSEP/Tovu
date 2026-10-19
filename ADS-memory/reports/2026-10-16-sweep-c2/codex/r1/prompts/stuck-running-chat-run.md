# A chat run stays run_status='running' forever when the server restarts mid-run

Repos: Tovu (/Users/la/Programming/Tovu, cwd) and Jini (/Users/la/Programming/Jini) — Jini is
READ-ONLY for you tonight (another agent is editing Jini packages/core and packages/chat).

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state
(no stash/checkout/reset). Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:`
+ `ROOT CAUSE:` (3-6 lines with file:line). REUSE before you write. Smallest change. Move "why"
comments with code, never delete them. Do NOT edit non-test files under apps/website/src/assistant/**,
apps/website/src/server/runtime/composition/**, or anything in Jini. If the right fix lives there,
write the exact patch (unified diff) under NOT DONE instead of applying it.

## Bug
Switching the served site in the local dev setup restarts the server process (tsx watch / site
switch). A chat run that was in flight at that moment keeps its assistant row in the site's
chat.db `ai_chat_messages` with `run_status='running'` forever. The UI then shows the turn as still
running and nothing ever settles it.

## Look for the existing sweep FIRST
There is already durable-run recovery: Jini `packages/chat/src/server/durable-runs/recover.ts`
(treats queued/running as non-terminal), `durable-runs/accept.ts`, and the run finalizer
`packages/chat/src/server/run-finalizer/entry.ts` (`settleInterrupted`). Find:
1. Where (if anywhere) Tovu calls the durable-run recovery / finalizer on boot for the SERVED site's
   chat store (grep apps/website/src for recover/settleInterrupted/run-finalizer and the composition
   root that boots chat).
2. Why a row left 'running' by a killed process is not settled on the next boot: not called at all?
   called only for the first site and not after a site switch? called for runs whose daemon run id
   still exists only? `recoveryCount` limit? principal mismatch?
Report the answer as ROOT CAUSE.

## Fix
Smallest change in an allowed file that makes the next boot (including a boot after a site switch)
mark such orphaned rows interrupted/failed through the EXISTING settle path (same terminal status and
text the finalizer uses for interrupted runs), so the UI settles. Do not invent a new status value.
RED test: a unit/integration test with the existing DI fakes that seeds a 'running' assistant row
with no live run behind it, boots (or calls the boot hook), and asserts the row ends terminal. It
must FAIL on current code. If the fix must live in a forbidden file, still write the RED test (it may
stay red) and put the patch under NOT DONE.
