# D5: chat over IPC (3 runs) [BLOCKED until daemon R7-G1 and R8b land]

Inherits `COMMON.md`. Survey step 5. Order: D5a -> D5b -> D5c.

## Why blocked, and what this plan does not redo

The survey's blocker ("Jini `daemon/http` is typed to Express") is owned by the daemon programme (`plan/daemon-untangle-design-2026-11-16`, `R7-ROUTES.md` and `R8-RUNTIME.md`, revision 2). Verified there and here:
- `apps/desktop/src/desktop-agent.ts` (506 lines) calls `registerDelegatedToolRoutes` and `registerToolCatalogRoutes` on its own Express app (its `express` import and adapter). Both files are in **R7-G1** ("JSON-only files, one pair per file": `tool-catalog`, ..., `delegated-tools`). After those two pairs the desktop agent mounts `ServerRoute[]` and **R7's Tovu commit, not this sheet**, removes Express from `desktop-agent.ts`.
- `desktop-agent.ts:276` calls `createAgentExecutor` with options **R8** deletes (R8 revision 2, section 12.4 lists this site). The daemon index names `desktop-agent.ts` a coordinator-serialized file shared by R7 and R8.
- So D5 **does not edit `desktop-agent.ts`** beyond import repoints, and starts only when `rg -n "from ['\"]express['\"]" apps/desktop/src -g '!*.test.*'` prints nothing and `express` is gone from `apps/desktop/package.json`. If it still prints: **STOP**.
- The survey's "`desktop-agent.ts:213-218` resolves `@jini-ai/core` from the daemon's location" hack: the reading tree has one import of the form `@jini-ai/core/dist/...` in desktop `src`. Removing it needs one deduplicated core (a packaging fact), not a code move: INDEX OD-7. Not in D5.

## Measured (reading tree)

| File (lines) | Generic? | Target |
|---|---|---|
| `renderer/workspace-chat-transport.ts` (454; 23 functions; in `size-debt.json`) implements Jini's `ChatTransport` (`chat/src/core/transport.ts:97`) over `{ invoke, subscribe }` | yes, except channel names | `@jini-ai/chat` new `./transports/bridge` (the package already has `./transports/http`, `./transports/fetch-sse`, `./transports/ag-ui`) |
| `renderer/use-workspace-chat-transport.hooks.ts` (80) | wiring | STAY |
| `contracts/workspace-chat.ts` (127): 8 channel names, start/reattach/event message types, two Tovu tool-name helpers | types yes; channel literals and `mcpToolNameForVerb`/`desktopVerbForAgentToolName` no | types move with the transport; rest STAY |
| `workspace-chat-ipc.ts` (215; 18 registrations) main-side serving of start/reattach/stop/status + inventory + conversations + working directory | the run-serving core yes | `@jini-ai/chat` new `./server/bridge-serving` (ports only); registrations and Tovu addressee rules STAY |
| `workspace-conversation-store.ts` (137) JSON-file conversation list | yes | check first against `@jini-ai/chat/store` + `./store/runtime`: if a file-backed or runtime store with the same contract exists, **use it** and delete this file |
| `renderer/runner-conversation-controller.ts` (393; 19), `renderer/use-runner-conversations.hooks.ts` (126), `renderer/persistable-messages.ts` (18) | mostly | compare with `chat/src/react/hooks/assistant-chats.ts` (`useAssistantChats({ port })`, `LastConversationStore`): likely an **adapter to the existing owner**, not a move |
| `desktop-agent*.ts`, `desktop-chat-main.ts`, `desktop-mcp-http.ts`, `sites-mcp-*.ts`, `desktop-host-signals.ts` | Tovu tools, policy, wiring | STAY |

Movable: about **1.1 to 1.5k** lines (454 + types about 70 + serving core about 120 + store 137 + controller 300 to 500, minus whatever an existing owner replaces). Survey: 1.5 to 1.9k.

---

## D5a: bridge transport to `@jini-ai/chat` (Jini + Tovu pair; ~220k; proof T, then E)

```
id: D5a-bridge-transport
new:  packages/chat/src/transports/bridge.ts (+ split files so each is <= 500 lines / functions <= 50; the source is 454 lines with 23 functions: measure with the ratchet before moving and split along its real seams: subscription bookkeeping, event decoding, run control)
      export "./transports/bridge" (jini.entries: universal; it must not import React, Node or electron)
tovu: renderer/workspace-chat-transport.ts deleted; use-workspace-chat-transport.hooks.ts binds { invoke, subscribe } from runner-api.ts and the 8 channel names
```
- The port is exactly D1a's preload shape: `{ invoke(r: { channel, args }), subscribe(r: { channel, listener }) }` plus `channels: { start, reattach, stop, status, event, ... }` supplied by the host. The transport never names a channel.
- **Lesson 14 and 18 (streaming and cancellation), each a test that fails on the named break:** events for a run arrive on one push channel shared by every run: the transport must drop an event whose run or subscription id is not its own (two concurrent runs, interleaved events); after `stopRun` resolves no further event reaches the consumer even if the main side sends one late; unsubscribe removes the listener (fake `subscribe` counts live listeners: 0 after close, after error, after stop); a reattach replays from the cursor without duplicating the event at the cursor; `subscriptionRandomPart` takes its entropy as an injected port (it does today: `SubscriptionEntropy`): pin it in tests.
- `ChatTransport` is a Jini contract (exempt from object-args conversion in the desktop-args plan): its method signatures are not changed.
- Existing tests (`rg -l "workspace-chat-transport" apps/desktop/src -g '*.test.*'`) move and are converted; count reported. Delete the `size-debt.json` key.
Proof E: desktop chat: send, stream, stop mid-stream, close and reopen the pane during a run (reattach), two sites chatting at once.

## D5b: serving side and conversation store (Jini + Tovu pair; ~200k; proof T, then E and **P**)

1. **Store owner check first.** Read `packages/chat/package.json` exports `./store`, `./store/runtime`, `./store/legacy` and the `ConversationStore` type the desktop already imports from `@jini-ai/chat/core`. If one of them persists a conversation list to a host-supplied key-value or file port with the same list/rename/delete/save-message contract: bind it and delete `workspace-conversation-store.ts`. Otherwise move the file to `packages/chat/src/store/json-file.ts` taking a durable-JSON port (chat may not import platform) and `titleFrom` as is. The reading tree shows a type drift here already (`desktop-agent.ts` lines near 482 to 487: Jini's `ConversationStore`/`AgentExecutor` types gained members): resolve against the **current** types and report each added member and what the desktop now passes.
2. Serving core: from `workspace-chat-ipc.ts` take the functions that turn a start/reattach/stop/status request into calls on a run lifecycle and push events to a sink (`EventSink`), as `createBridgeChatServing(required: { runs; store; sink }, optional)` in `packages/chat/src/server/bridge-serving.ts`. The 18 `ipcMain` registrations (through D1a's kit), `addresseeForStart`, the inventory and working-directory channels stay in Tovu.
3. **Security (class: IPC sender trust; cross-run access).** The serving core takes an opaque `sender` key per request and sends events only to the sink bound to the sender that started or reattached the run; a reattach from another sender for a run it does not own is refused. Tests: sender B cannot reattach or stop sender A's run; a destroyed sender's sink is removed and later events are dropped, not thrown. The trusted-sender check itself stays in the registration (D1b2).
Proof P: `npm run smoke:packaged-chat` (the packaged-chat gate) on macOS; E as D5a.

## D5c: conversation controller onto the existing chat hooks (Jini + Tovu pair; ~180k; proof T, then E; UI: review by Opus)

Compare `runner-conversation-controller.ts` state machine (list, select, create, rename, delete, persist messages, remember last) with `useAssistantChats`/`AssistantChatsPort` and `createLastConversationStore`. Write the comparison table (state, transition, who persists, error surface) into the report **before** editing. Outcomes: (a) the existing hook covers it: write a `AssistantChatsPort` adapter over the desktop bridge in Tovu, delete the controller, keep Tovu's tests as adapter tests; (b) it covers part: move only the missing transitions into chat as options of the existing hook, never a second controller; (c) contracts differ in a user-visible way (for example which conversation is selected after a delete): **STOP** and report the differences for an owner decision. Hooks are injected (S2).
