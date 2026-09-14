# Wiring a caller for `reattach()` — 2026-09-11

Skill loaded: `AI-Dev-Shop/agents/programmer/skills.md` (confirmed at dispatch start).

Dispatch: wire a caller for `useRunStream.reattach()` (`Jini/packages/chat`), which is fully
implemented, fully tested, and had zero production callers — see
`ADS-memory/reports/2026-09-11-ask-choice-render-trace.md` for the incident this exists to fix.

## Summary of what actually shipped

Two parts, split by an explicit STOP/resume with the team lead:

- **Part B (Tovu, shipped and verified):** a one-time durable "this run is in flight" stub write, so
  a non-terminal run's `runId` exists somewhere outside the live browser tab that started it.
- **Part A (Jini, written and unit-tested against source, deliberately UNBUILT):** the actual
  mount-time `reattach()` caller in `useConversation.ts`, held back from a dist rebuild because
  `Jini/packages/chat` is a published package symlinked into `apps/admin`'s `node_modules`, and a
  rebuild flaps the Tovu API mid-run while the owner is actively testing chat.

## Why the trace's proposed trigger did not work as stated

The trace's recommendation — "on mount, if the last message carries a non-terminal `runId`, call
`reattach(runId)`" — could not fire, because that `runId` never existed anywhere reachable at mount:

1. **Never persisted.** `apps/admin/src/lib/assistant-chats.ts`'s `persistableMessages` (pre-existing,
   lines ~145-149) filters durable writes to `role === "user" || isTerminalRunStatus(runStatus)` —
   deliberately, to avoid a database write per streamed token (see that function's own module doc).
   A `queued`/`running` assistant message was never durably written at all.
2. **No in-memory fallback either.** `use-assistant-chats.hooks.ts`'s `select` always calls
   `port.loadMessages(id)` — a network GET — never a local cache. A same-tab conversation-switch-and-
   back re-fetches from the DB and finds exactly what (1) says: nothing.
3. **`reattach()` wasn't even forwarded through the public API.** `useConversation.ts`/
   `useChatPane.hooks.ts` only ever called `run.start()` (`sendMessage`/`retry`); `reattach` was
   reachable only from inside `useRunStream` itself, with no host-visible hook into it at all.

Verified independently (fresh grep, 2026-09-11): `grep -rn "\.reattach(" Jini/packages/chat/src
apps/admin/src` → only the definition and tests, matching the original trace's own finding.

## Part B — the stub write (shipped)

**Files changed:**

- `apps/admin/src/lib/assistant-chats.ts` — added `activeRunStub(messages)`, a pure O(1) function:
  the last message, if it is a non-terminal assistant turn carrying a `runId`, else `null`. Sibling
  to the existing `persistableMessages`, which is left completely unchanged.
- `apps/admin/src/hooks/use-assistant-chats.hooks.ts` — added `runStubWrittenRef` (a SEPARATE
  dedup map from the existing `writtenRef`) and `persistRunStub` (a sibling to the existing
  `persistUserTurn`), wired into both branches of `onMessagesChange` (the already-active-conversation
  branch and the lazy-adoption branch).

**Why a separate dedup set, not reusing `writtenRef`:** `writtenRef` means "this exact settled
payload is durable (or in flight)". If the stub write had shared it, the FIRST delta (empty content,
no `runId` yet, `runStatus: 'queued'`) would mark the id written before there was even anything to
capture, and — because `flush`'s own dedup only checks "has this id ever been queued", not "was the
LATEST payload queued" — the real terminal write (the one with the actual reply) would then be
skipped forever. Verified this risk directly with a test (`use-assistant-chats.run-stub.unit.test.ts`,
"lets the terminal write land afterward and overwrite the stub in place") before trusting the design.

**Why the stub and the terminal write converge on one row rather than two:** verified at the actual
persistence layer, not assumed. `PUT /messages/:id` → `ChatHistoryStore.appendMessage` →
`Jini/packages/sqlite/src/db/chat-history/store.ts:271-285` — a genuine
`INSERT ... ON CONFLICT(id) DO UPDATE SET content=excluded.content, run_id=excluded.run_id,
run_status=excluded.run_status, ...`. The message id is the true idempotency key; a stub row's later
terminal overwrite is one `UPDATE`, not a second row.

**Why it does not touch the failed-row preservation policy:** `persistableMessages` and `flush` are
untouched. A failed run's terminal row is written by the exact same, already-tested path it always
was; the stub write only ADDS one earlier row under the same id, which the terminal write then
overwrites in place.

**Tests (RED confirmed before implementation, then GREEN):**

- `apps/admin/src/lib/__tests__/assistant-chats.unit.test.ts` — 9 new cases for `activeRunStub`
  (empty transcript, user-only, no runId yet, terminal x3, non-terminal x2, stale-non-last-message).
- `apps/admin/src/hooks/__tests__/use-assistant-chats.run-stub.unit.test.ts` (new file) — 5 cases:
  first-delta durable write; exactly-once across repeated deltas (not once per token); terminal write
  overwrites the stub in place (one row, not two); lazy-adoption branch also writes the stub; a
  transient failure is retried by the next delta rather than left permanently missing.

**Evidence, fresh, this session:**

- `cd apps/admin && npx vitest run src/hooks src/lib src/components/__tests__` → **1780/1780 passed**
  (rc=0; baseline before this change was 1766/1766 per the team lead's own verification, +14 = the
  9 + 5 new cases above).
- `cd apps/admin && npx tsc --noEmit` → rc=0, clean (baseline zero preserved).
- `cd apps/admin && npx eslint <4 changed files>` → 0 errors, 5 pre-existing warnings (verified
  unchanged by diffing occurrence counts against `git show HEAD:<file>` — 4 `sonarjs/no-nested-incdec`
  hits on pre-existing `= ++ref.current` lines elsewhere in the file, 1 `sonarjs/no-duplicate-string`
  on a pre-existing `"same-origin"` literal count that did not change). 0 new warnings.
- `development/scripts/check-admin-complexity-drift.ts` → 8 new violations reported, **none** in
  either file I changed (all 8 are in `features/media`, `features/observability`, `features/pages`,
  `features/plugins`, `features/themes` — other agents' in-flight work, e.g. `media-order-by-ui`).

## Part A — the Jini-side reattach caller (written, unit-tested, NOT built)

**File changed:** `Jini/packages/chat/src/react/hooks/useConversation.ts` — added a mount-only
`useEffect` (`[]` deps): reads the mount-time snapshot of `options.initialMessages`'s last message;
if it is a non-terminal assistant turn carrying both `runId` and `runStatus`, sets
`activeAssistantIdRef.current` to that message's id (so the existing reconciliation effect,
`applyRunToAssistantMessage`, doesn't no-op on its `if (!assistantId) return` guard) and calls
`run.reattach(runId, initialEvents)`, reusing `useRunStream`'s existing generation/AbortController
guard — no new double-subscription-prevention mechanism was added, because one already exists and is
already tested.

**Why gated on `runStatus !== undefined` too, not just non-terminal:** a message carrying a `runId`
with no `runStatus` at all has no positive evidence of an in-flight run — `useConversation`'s own
reconciliation always writes both fields together, so the combination only arises from data this hook
did not itself produce. Treated as nothing to reattach to rather than assumed non-terminal.

**Known limitation inherited, not introduced:** for a BYOK run, `assistant-transport.ts`'s
`reattachRun` already answers `handlers.onDone([])` unconditionally (module doc: "no separate
EventSource/reattach... reporting the run as simply over is the honest answer — there is no way to
resume it"). That is pre-existing, deliberate behavior in a branch this change does not touch; this
effect is simply the first thing that will ever actually call it via `reattach()`'s host path. Whether
a BYOK stub's seeded content survives the immediate `onDone([])` (it does not — `onDone` replaces
`events` outright) is a product question for that branch's own owner, not something this change
redesigns.

**Tests added, RED verified, then GREEN** (source-level only, via `vitest run` — no `tsc -p
tsconfig.json` composite build, no `pnpm build`, nothing touching `dist/`):

Added to `Jini/packages/chat/src/react/hooks/__tests__/useConversation.test.ts` (6 new cases in a
`describe('mount-time reattach of an interrupted run', ...)` block):
- reattaches automatically when `initialMessages`'s last message is a non-terminal assistant run with
  a `runId` (asserts `transport.reattachCalls`, that `transport.calls`/`startRun` was NOT hit, and
  that a subsequent `transport.emit(...)` lands on the SAME message id the seed named)
- seeds state from the stub's own `events` before any new event arrives (no empty-pane flash)
- does NOT reattach when the last message's run is already terminal (`succeeded`/`failed`/`canceled`)
- does NOT reattach when there is no `runId`, no `runStatus`, an empty transcript, or the last
  message is a user turn
- reattach only fires once per mount even across re-renders
- a rejected `reattachRun` marks the message `failed` with the real error (recoverable via the
  existing `retry()`, unchanged)

**RED verified rigorously, not assumed:** temporarily commented out the `void run.reattach(...)` call
(kept `activeAssistantIdRef.current = last.id` in place) and reran just this suite — the 4 tests that
depend on reattach actually firing failed (`expected [] to have a length of 1 but got +0`, etc.); the
4 negative-case tests correctly stayed green throughout, since they assert absence. Restored the real
call, reran, back to 23/23. This is the same discipline the dispatch's "what would this still pass
under?" rule asks for, applied to code I could not build — proving the tests would have caught the
bug before trusting them to guard the fix.

**Evidence, fresh, this session (all source-level, no build):**
- `cd Jini/packages/chat && npx vitest run src/react/hooks/__tests__/useConversation.test.ts` →
  **23/23 passed**, rc=0.
- `cd Jini/packages/chat && npx vitest run` (whole package, regression check) → **74 files, 1181
  tests, all passed**, rc=0.
- `cd Jini/packages/chat && npx tsc -p tsconfig.json --noEmit` → rc=0, clean (type-check only, no
  emit — confirmed this does not write to `dist/` before running it).
- `cd Jini && npx eslint packages/chat/src/react/hooks/useConversation.ts
  packages/chat/src/react/hooks/__tests__/useConversation.test.ts` → 0 errors, 1 pre-existing warning
  (an already-ineffective `eslint-disable-next-line` on the pre-existing reconciliation effect,
  unrelated to this change — confirmed via `git diff` that line was untouched, just shifted).
- `cd Jini && git status --short` → only `packages/chat/src/react/hooks/useConversation.ts` and its
  test file changed by this work; no `dist/` files appear, confirming no build ran.

**Explicitly NOT run:** `npm run build` / `pnpm build` / `tsc -p tsconfig.json` (without `--noEmit`)
inside `Jini/packages/chat` — any of these write to `dist/`, which `node_modules/@jini-ai/chat` in
Tovu symlinks to, and the team lead's instruction was to hold this until the owner's own testing
window allows a rebuild.

**Status: unbuilt and therefore untested end-to-end against real Tovu admin.** Source-level unit
tests pass (including a rigorous RED/GREEN check), the full package suite has no regressions, and
`tsc --noEmit` is clean — but nothing has verified this actually fixes the real browser-facing bug
until `Jini/packages/chat` is rebuilt and Tovu's `node_modules` symlink picks up the new `dist/`. That
step is explicitly the owner's call per the team lead.

## Open items for whoever resumes this

1. Owner approves a `Jini/packages/chat` rebuild (`pnpm build` or equivalent) at a time that does not
   interrupt a live chat session.
2. After rebuild, re-verify end-to-end in the real admin: start a Local CLI run, kill the browser
   subscription (close/reopen the tab, or navigate away and back), confirm the pane resumes streaming
   instead of staying frozen, and confirm a 404'd reattach (simulate a daemon restart) lands the
   message in `runStatus: 'failed'` with a real, retriable error rather than a silent hang.
3. The BYOK-reattach content-loss limitation noted above is pre-existing and out of this change's
   scope, but worth a follow-up ticket if BYOK's stub-then-reattach UX ends up mattering in practice.
