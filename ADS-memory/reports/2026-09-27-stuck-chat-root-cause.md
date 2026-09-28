# Stuck admin chat: root causes (2026-09-27)

Evidence: the daemon event streams for runs a5a36afa, bbd0bc92 and 53622092, plus the chat.db rows of conversations a3e9543e, 302462cd and 64ba5248 (read-only).

## Ranked by how often a real user hits it

1. **PROVEN, fixed. A second card in the same run renders out of sight.** In `Jini/packages/chat/src/react/message-blocks.ts` (old lines 110-117), every `mcp-ui` ext event in a message shared ONE slot, placed at the FIRST card. Run a5a36afa showed the Supabase Connect card (event 26), then choice 1 (event 70), then "A new database costs $10 a month" (event 87). Card 3 was drawn next to the Connect card, above ~15 tool rows and two paragraphs. The user saw only the spinning `assistant_ask_choice` row at the bottom. The run then waited the full 5-minute idle TTL (`DEFAULT_SURFACE_IDLE_TTL_MS`, `apps/website/src/contracts/core/tool-surface-exchanges.ts:130`), returned "expired", and ended at 21:53:44.
   The same code keyed `ExtEventErrorBoundary` on `name:events.length`, so each new card also remounted every earlier card's iframe. This covers every held-open MCP-UI card: ask_choice, the agent_plugin_connect Connect card and the database_transfer_run card. Any of them fails the same way whenever it is not the first card in the turn.
2. **PROVEN, fixed. Sending while a run finishes, or interrupting it, leaves the old turn stuck at `running` forever and loses its answer.** `useConversation.sendMessage` and `retry` wrote `setMessagesState([...messagesRef.current, ...])`. `messagesRef` holds the last render's snapshot. `useChatPane`'s queued-prompt flush effect runs in the same commit as the reconcile effect that marks the old turn terminal, so the snapshot overwrote that terminal update. The host persists only terminal turns (`apps/admin/src/lib/assistant-chats.ts:145`), so the row stays as the `running` stub with no content.
   Live instance: bbd0bc92 is `cancelled` in the daemon but `running` in chat.db (a3e9543e position 3). There are also 10 older `running` rows in the middle of conversations dating back to 09-15.
3. **PROVEN, not fixed (needs a design call). Saved chat state depends on a browser staying connected (FINDING A).** Only the browser writes chat rows. Nothing server-side ever finalizes one: `persistableMessages` and `persistRunStub` are client-only, and the daemon-event to chat-event translation exists only in `apps/admin/src/lib/assistant-transport.ts:117`.
   If the tab is still open, or is reopened while the daemon still holds the run, reattach heals the row. The daemon keeps runs in memory only, though. After any API/daemon restart (every commit under apps/website), GET /api/runs/eb73452e returns 404, so reopening 302462cd or 64ba5248 marks them "run forgotten" (failed) and loses their successful answers.
   Writing only the status server-side would make things worse, because it would stop reattach. The real fix is a server-side finalizer in the daemon process that owns the translation, or a durable run event log.
4. **SUSPECTED. An interrupted send starts the next run before the old CLI exits.** Run 53622092 started at 21:55:42.255, before bbd0bc92 ended at .637, and failed in 2 ms with code null. That is a pre-spawn `failBeforeSpawn` path (`@jini-ai/daemon/src/agent-executor.ts:3865`) whose reason reaches only the server log. The user sees "Run failed" and has to resend.
5. **By design, weak UX.** When nobody answers a card, the run waits 5 minutes with only a spinner, then continues with "did not respond". The expired card stays on screen looking answerable.

Other lifecycle events, from reading the code:
- **Dismiss:** `__dismissed` settles the card as "cancelled" and the run continues. No hang.
- **Panel close/reopen, reload, new tab:** the stub row, then reattach, then the daemon replays the card. This works while the daemon holds the run.
- **Daemon restart mid-wait:** the run dies and the client gets a 404 and shows "failed". The card stays visible but dead.

## Fixes
- Jini `2f531174` (repo /Users/la/Programming/Jini, branch general-work):
  - ext renderers now take an optional `slotKey`. `mcpUiSurfaceSlotKey` keys each card by its `ui://` URI, so each card renders where it arrived and only remounts itself.
  - `sendMessage` and `retry` now use functional state updates.
  - The changed `dist/react` files were copied from a scratch build. `dist/core` is untouched, so the API did not restart.
- Tovu: `apps/admin/src/components/AssistantDock/AssistantDock.tsx` passes `{ slotKey: mcpUiSurfaceSlotKey }`.

## Tests (RED then GREEN; `cd Jini/packages/chat && npx vitest run <file>`)
- `useChatPane.test.tsx`: "keeps the finished turn succeeded…" and "marks the interrupted turn canceled…". RED: expected 'succeeded' / 'canceled', received 'running'.
- `message-blocks.test.ts`: "gives each keyed surface its own slot…" and "keeps one slot per name…". RED: `ext undefined`.
- `MessageRow.test.tsx`: "renders a keyed surface at its own position…". RED: surface not found.
- `McpUiSurfaceCard.test.tsx`: "keys each MCP-UI resource into its own slot by URI". Written after the fix.
- GREEN: all 6 affected files pass (120 tests), and `tsc --noEmit` passes for Jini chat and Tovu admin.
- Live UI check at localhost:5173 in a fresh tab: Card one, then a tool search and a sentence, then Card two. Card two rendered last, under its own tool row, and was answerable. The row persisted as `succeeded`. Screenshots: `ADS-memory/.local-artifacts/stuck-chat-2026-09-27/`.
