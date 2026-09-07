# Fix: a failed chat run persists `run_status='failed'`

- **Agent:** D (Programmer/Execution)
- **Date:** 2026-09-07
- **Branch:** `restructure/apps-website-phased`
- **Commits:** `7edb3dc1` (fix + RED-proven test), `87b031a4` (settlement guardrail test)
- **Status:** DONE. 12/12 new tests green; 324/324 across every consumer suite; `apps/admin` `tsc` clean; `eslint` 0 errors.

---

## 1. What was wrong, and what changed

`@jini-ai/daemon`'s `finish()` is the **only** event a terminal run emits — there is no separate
`error` frame for a failed run. `subscribeToRun`'s `end` listener reported every terminal frame
through `handlers.onDone`, so a run the daemon had already classified `failed` was recorded as
`run_status='succeeded'` with empty content.

`f682eff2` fixed the two *transport* causes additively and deliberately stopped short of this,
saying so in `assistant-transport.ts:214-219`. Leona ruled it in on 2026-09-07.

**Changed — `apps/admin/src/lib/assistant-transport.ts` only:**

| Unit | Change |
|---|---|
| `readTerminalOutcome` (new, private) | Shared parse of `RunEndPayload` → `{status, code, signal, resumable}`, extracted from `terminalOutcomeNotice`. Returns `null` on success/absent/malformed. |
| `terminalOutcomeNotice` | Body now delegates to `readTerminalOutcome`. **Output byte-identical.** Its doc paragraph claiming the persistence change was deliberately not made was rewritten — it would otherwise have become a false comment. |
| `terminalFailureError` (new, exported) | The `failed`-only reportable `Error`. `canceled` excluded on purpose. |
| `subscribeToRun`'s `end` listener | Calls `handlers.onError(failure)` **before** `finish()`. |

**Order is load-bearing.** `useRunStream`'s `onDone` is written as
`prev.status === 'error' ? prev.status : 'done'`, so error-then-finish both marks the run failed
**and** hands `onDone` the collected events — the persisted row keeps its own exit-code notice.
Swapping the two lines silently restores `succeeded`. This is documented in the code.

Nothing in `assistant-transport.ts` computes `runStatus`. Three pieces of `@jini-ai/chat` do:
`useRunStream` (`onError` → `'error'`), `useConversation` (`'error'` → `runStatus: 'failed'`),
`isTerminalRunStatus` (`'failed'` is terminal). That is why the certifying test drives the real
hooks rather than asserting a callback fired.

---

## 2. Consumer table — every reader of the column, verified BEFORE the writer changed

`failed` is already in `TERMINAL_RUN_STATUSES` (`@jini-ai/chat/core` `messages.ts:19`). **No
consumer branches only on `succeeded` in a way that could hang.** Nothing needed fixing.

| # | Reader | Location | Behaviour on `failed` |
|---|---|---|---|
| 1 | `isTerminalRunStatus` | `Jini/packages/chat/src/core/messages.ts:19` | **Terminal.** The predicate everything below depends on. |
| 2 | `shouldPublishOnMessagesChange` | `apps/admin/.../AssistantDock/hooks/AssistantDock.hooks.tsx:1090` | Terminal → publishes the settings + content refresh once. Same as `succeeded`. **No hang.** |
| 3 | `persistableMessages` | `apps/admin/src/lib/assistant-chats.ts:137` | Terminal → row **is** persisted. This is what makes the fix reach disk; it discards only still-streaming turns. |
| 4 | `persistableMessages` (desktop) | `apps/desktop/src/renderer/persistable-messages.ts:18` | Identical predicate. Agent B's tree — **not touched**, behaviour unchanged and correct. |
| 5 | `SiteAssistantWidget` | `apps/site-chat/src/SiteAssistantWidget.tsx:184` | Terminal → processes `client_directive` ext events. Unchanged class of behaviour. |
| 6 | `useConversation` | Jini `react/hooks/useConversation.ts:96-108` | `run.status 'error'` → `runStatus 'failed'`, stamps `endedAt`. |
| 7 | `useRunStream.onDone` | Jini `react/hooks/useRunStream.ts:130` | `prev.status === 'error' ? prev.status : 'done'` — **preserves** the failure. The seam the whole fix rests on. |
| 8 | `MessageList` | Jini `react/components/MessageList.tsx:124` | `runStreaming` false. Correct. |
| 9 | `MessageList` | Jini `react/components/MessageList.tsx:130` | `runSucceeded={false}` → `deriveToolStatus` renders a resultless tool card as `error` not `complete`. **Improvement** (an unfinished tool call stops claiming success). |
| 10 | `MessageRow` | Jini `react/components/MessageRow.tsx:105,126` | Thinking placeholder and `isRunInProgress` both false — action row shown normally. |
| 11 | `MessageRow` | Jini `react/components/MessageRow.tsx:356` | Renders `<div class="jini-message-error">This turn failed.</div>`. **New visible text.** |
| 12 | `MessageRow` | Jini `react/components/MessageRow.tsx:304` | `data-run-status="failed"` attribute. |
| 13 | Tovu route (writer sink) | `apps/website/src/server/runtime/composition/modules/assistant-chats.ts:150` | Pass-through. Validates **only** `role`; no status whitelist. |
| 14 | Jini chat-history store | `Jini/packages/sqlite/src/db/chat-history/store.ts:274-296` | Upserts `runStatus` **verbatim** into `ai_chat_messages.run_status` (`TEXT`, no CHECK). |
| 15 | Jini chat-history store read | same file, `:100`, `:231` | Pass-through back out. |

**Deliberately excluded, with reason.** `Jini/packages/sqlite/src/db/agent-sessions/agent-sessions.ts:154`
(`AND (run_status = 'succeeded' OR id = ?)`) *does* branch only on `succeeded` — but it reads the
`messages` / `project_conversations` tables (Open Design's schema), **not** `ai_chat_messages`.
Same for `projects.ts` and `conversations.ts`. Tovu's chat history lives in `ai_chats` /
`ai_chat_messages` (`apps/website/src/platform/db/sqlite/chat-db.ts`). Not on this path.

**No website-side writer exists.** `grep runStatus apps/website/src` returns only the unrelated
comments feature (`runStatusChangedHooks`). The browser transport is the sole classifier.

### Every route that writes this column

| Route | Before | After |
|---|---|---|
| **Local CLI / daemon** (`subscribeToRun`) | **BROKEN** — `end` frame with `status:'failed'` → `onDone` → `succeeded` | Fixed |
| **BYOK** (`handleByokFrame`) | Already correct — the server emits `sse(res,"error",…)` **then** `sse(res,"end",…)` (`assistant-byok.ts:418-419`), so `onError` precedes `onDone`. Same ordering the fix now gives the daemon path. | Unchanged |
| **AG-UI** (`handleAgUiEvent`) | Already correct — `RUN_ERROR` (non-`abort`) → `onError:243`; the Observable's `complete` → `finish()` → `onDone`. | Unchanged |

Corroboration: `chat.db` already holds `failed|1` and `canceled|1` rows, written by the two paths
that were already correct. The column has always accepted these values.

---

## 3. RED output (the proof)

Run before the fix, `apps/admin/src/lib/__tests__/assistant-transport.run-status.unit.test.ts`:

```
FAIL > what a dead run writes down (real useConversation, no mocks on the status path)
     > a run the daemon classified as failed is persisted as run_status='failed', not 'succeeded'
AssertionError: expected 'succeeded' to be 'failed' // Object.is equality

Expected: "failed"
Received: "succeeded"
 ❯ src/lib/__tests__/assistant-transport.run-status.unit.test.ts:180:33

FAIL > subscribeToRun — a daemon-classified failure reaches onError
     > a failed end frame reports the failure through onError BEFORE settling the run
AssertionError: expected [] to have a length of 1 but got +0

Test Files  1 failed (1)
     Tests  6 failed | 5 passed (11)
```

The 5 that passed were the negative controls (succeeded stays succeeded; canceled is not a failure;
a normal turn reports no error) — they exist to catch a blanket downgrade, and correctly passed both
before and after.

**"What would this test still pass under?"** — asserting `isTerminalRunStatus(assistant.runStatus)`
would have passed under the bug (`succeeded` is terminal too), as would asserting
`persistableMessages(...).length`. The assertion is therefore the exact string `toBe("failed")`.
There is **no `vi.mock` on the status path**: the test builds the real transport, renders the real
`useConversation`, drives a real `end` frame through a `FakeEventSource` (jsdom has no native
`EventSource`), and reads the value that `saveMessage` PUTs.

## 4. Exact test paths and commands

```bash
# apps/admin tests run FROM apps/admin (the inverse of apps/website)
cd /Users/la/Programming/Tovu/apps/admin
env -u TOVU_ADMIN_PASSWORD npx vitest run src/lib/__tests__/assistant-transport.run-status.unit.test.ts
# -> Test Files 1 passed (1) | Tests 12 passed (12)
```

Regression sweep — one process, twelve exact paths, every consumer suite:

```bash
cd /Users/la/Programming/Tovu/apps/admin
env -u TOVU_ADMIN_PASSWORD npx vitest run \
  src/lib/__tests__/assistant-transport.a2ui.test.ts \
  src/lib/__tests__/assistant-transport.ag-ui.unit.test.ts \
  src/lib/__tests__/assistant-transport.byok.unit.test.ts \
  src/lib/__tests__/assistant-transport.daemon.unit.test.ts \
  src/lib/__tests__/assistant-transport.run-death.unit.test.ts \
  src/lib/__tests__/assistant-transport.run-status.unit.test.ts \
  src/lib/__tests__/assistant-transport.transcript.test.ts \
  src/lib/__tests__/assistant-transport.translate.unit.test.ts \
  src/lib/__tests__/assistant-chats.unit.test.ts \
  src/components/AssistantDock/__tests__/AssistantDock.hooks.unit.test.tsx \
  src/components/AssistantDock/__tests__/use-messages-change-handler.unit.test.tsx \
  src/components/__tests__/AssistantDock.hooks.unit.test.tsx
# -> Test Files 12 passed (12) | Tests 324 passed (324)
```

Static gates:

```bash
cd /Users/la/Programming/Tovu/apps/admin && npx tsc --noEmit          # rc=0, ZERO errors
cd /Users/la/Programming/Tovu && npx eslint apps/admin/src/lib/assistant-transport.ts \
    apps/admin/src/lib/__tests__/assistant-transport.run-status.unit.test.ts   # rc=0, 0 errors
```

### Correction to an inherited premise

The dispatch stated `apps/admin` `tsc` has a **baseline of 31 pre-existing errors**. That is
**stale**: `npx tsc --noEmit` from `apps/admin` currently exits 0 with an empty output. Verified the
run was real, not a no-op — `tsconfig.json`'s `include: ["src", ...]` covers `src/**/__tests__`, and
`--listFiles` confirms the new test file is in the program. The gate is therefore
**zero errors, not 31**; anyone treating 31 as the floor would miss real regressions.

## 5. Migration question — answered: NO migration

Read-only counts, 2026-09-07 (`sqlite3 "file:<path>?mode=ro"` — neither DB opened writable):

| DB | `run_status='succeeded'` AND empty content | full histogram |
|---|---|---|
| `sites/tovu-com/chat.db` (**live**) | **2** of 61 | `(null) 33 · succeeded 26 · failed 1 · canceled 1` |
| `sites/tovu-com/content.db` (pre-split legacy copy) | **6** of 562 | `(null) 298 · succeeded 228 · canceled 27 · failed 9` |

The 2 live rows are exactly the ones named in the prior investigation (`2a5fbd7d…`, `f38e1666…`).

**Left as-is, deliberately.** After the fact nothing distinguishes a genuine chat death from a
successful turn that happened to answer with nothing — a migration could only guess, and guessing
would replace one wrong record with a differently wrong one. Going-forward correctness is the goal.
The reasoning is recorded in `terminalFailureError`'s own doc so it is not re-litigated.

## 6. User-visible changes

1. **A failed run now shows `This turn failed.`** under the message (`MessageRow.tsx:356`, a
   pre-existing renderer that simply never had a `failed` status to react to on this path).
2. **Resultless tool cards on a failed run render as `error`, not `complete`**
   (`MessageList.tsx:130` → `deriveToolStatus`). An unfinished tool call stops claiming success.
3. **The stored row changes**: a dead run is `run_status='failed'` with its exit-code notice in
   `events_json`, instead of `succeeded` with empty content. This is the point of the change.
4. **A normal turn is byte-identical** — `terminalOutcomeNotice`/`terminalFailureError` both return
   `null` for `succeeded`, asserted by two negative-control tests.
5. **A canceled run is unchanged** — still not marked `failed`, asserted by its own test.

## 7. Risks / open items

- **Ordering fragility.** `onError`-before-`finish()` is required and non-obvious. Guarded by a
  test ("BEFORE settling the run") and by a comment at the call site, but a refactor that reorders
  those two lines would silently restore `succeeded`. This is the main thing a reviewer should hold.
- **Not tested end-to-end against a live daemon.** The certifying test exercises the real hook chain
  and the real transport over a synthetic `end` frame whose shape is taken from
  `@jini-ai/protocol`'s `RunEndPayload`. A live run producing a genuinely different payload shape is
  the residual risk; it is small (the shape is typed and the prior investigation read it off the
  wire) but it is not zero.
- **Untouched, flagged for whoever owns Jini:** `agent-sessions.ts:154`'s
  `run_status = 'succeeded'` filter means an Open-Design-schema session-resume would skip a failed
  turn. Not Tovu's path today, not in scope, but it is the one place a `succeeded`-only branch
  exists on any `run_status` column.

## 8. Scope confirmation

Touched **only** `apps/admin/src/lib/assistant-transport.ts` and one new test file under
`apps/admin/src/lib/__tests__/`. Did **not** touch `apps/desktop/` (Agent B),
`apps/website/src/features/post|seo/**` or `server/inbound/admin-http/routes/pages/**` (Agent A), or
`apps/website/src/assistant/mcp-federation/**` and the admin deployment/MCP files (Agent C).
`git status --porcelain -- apps/admin/src` was empty before editing, so no other agent's work was
overwritten. No `git add -A`, no `git stash`, no tree reverts.
