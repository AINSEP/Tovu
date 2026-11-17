# N4: the assistant pane in the admin shell

## Revision 2 corrections (authoritative; they replace the steps they name)

**Judge 8:** remove `useInvalidate()`. Entity screens hold per-mount state and reload only when `load` or `scope`
changes (`packages/admin/src/react/entities/use-entity-read.ts:7-21`). Use the refresh seam from
`GA-admin-entity-seams.md`: the composition root holds a counter, bumps it when a run settles, and passes it as
`refreshToken`. N5 asserts the list updates with no focus change and no click.

**Judge 9:** "required props only" cannot send: `ChatPane` starts with no agents and refuses to send without a
selected one. Bind explicitly: `agents` from a new same-origin NOTES route that proxies the daemon's agent list
(add it to N3's proxy allow-list and tests), an initial selection, and for N5 a **scripted agent** entry that is
selectable in the browser. Test: send is disabled with an empty inventory and enabled after the inventory loads.

**Judge 17:** bind the chat i18n provider at the composition root (`packages/chat/src/react/hooks/context.ts:24-49`);
test that an unbound render is detected (documented failure or visible key), and that a fake `useT` output reaches the pane.

**Judge 3:** pass NOTES' `resolveRunInput` (see G7) and test it against the real daemon parser.

---

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/notes-n4-chat`. Touches `examples/notes-web/**` only.
Prerequisites: N2, N3 and **G7** merged (`@jini-ai/chat/transports/daemon-runs` exists). Estimate: ~90k Sonnet.

## Preflight (STOP rules)

```sh
node -e 'const j=require("./packages/chat/package.json");console.log(!!j.exports["./transports/daemon-runs"])'   # must print true
rg -c "from '@jini-ai/ui" packages/chat/src/react -g '!**/__tests__/**' | awk -F: '{s+=$2} END {print s}'        # > 0 today (planner saw 10)
rg -n "ChatKitProvider|useChatKit" packages/chat/src/react -g '!**/__tests__/**' | head
```

- First line `false` -> STOP (G7 not landed).
- If a chat kit provider now exists (C-CHAT-DEPS landed): bind it in `src/shared/kit/chat-kit.ts` the same
  way N2 bound `AdminKit` (real implementations for used slots, `unbound*` for the rest, `satisfies`), and say
  so in the report. If its required slots cannot be bound from `@jini-ai/ui*`, STOP and report the slots.

## Inventory

```sh
sed -n 205,300p packages/chat/src/react/features/chat-pane/types.ts   # ChatPaneProps
sed -n 60,182p examples/reference-web/src/App.tsx                     # the minimal ChatPane mount
sed -n 38,50p packages/admin/src/react/shell/types.ts                 # slots.assistant: { content, label, open }
rg -n "on[A-Z]\w+\??:" packages/chat/src/react/features/chat-pane/types.ts | head -30   # run-finished callback?
```

## Files

| File | Content |
|---|---|
| `src/features/assistant/transport.ts` | `createDaemonRunsTransport({ baseUrl: '', fetch })` from `@jini-ai/chat/transports/daemon-runs` (same origin; the notes server proxies). One module-level instance, created once. |
| `src/features/assistant/AssistantPane.tsx` | `<ChatPane transport={…} …required props only />`. Initial message explains what the assistant can do with notes. |
| `src/features/assistant/use-assistant-pane.ts` | open/closed state persisted with an injected `Storage` (default `window.localStorage`, wrapped in try/catch); returns `{ open, toggle }`. |
| `src/features/assistant/index.ts` | named exports. |
| `src/pages/notes/NotesAdmin.tsx` | pass `slots.assistant = { content: <AssistantPane/>, label: 'Assistant', open }` and a topbar toggle button (`aria-expanded`, `aria-controls`). |
| `src/shared/styles.css` | import `@jini-ai/chat/react/styles/reference.css`; pane width, mobile = full-width overlay. |

Refresh after the assistant writes: if `ChatPaneProps` has a run-finished/status callback, call the kit's
`useInvalidate()` for the entity queries from it. If it has none, refetch on window focus and add a
"Refresh" action in the list header, and report the missing callback as a new gap (owner `@jini-ai/chat`).

## Tests first (vitest + jsdom; a fake `ChatTransport` object implementing the port)

| # | Test | Must fail when |
|---|---|---|
| T1 | `AssistantPane.test.tsx`: typing a prompt and sending calls `transport.startRun` once with that prompt; a scripted `onEvent`/handlers sequence renders the assistant text; `stopRun` is called by the stop control with the run id. | transport is not passed or handlers are dropped |
| T2 | `use-assistant-pane.test.ts`: toggle persists; a `Storage` fake that throws on `getItem`/`setItem` still yields a working toggle (three throwing fakes per AP11 are not needed: one throwing `Error`, one throwing a string). | storage access is unguarded |
| T3 | `NotesAdmin.assistant.test.tsx`: the toggle sets `aria-expanded`; the pane stays mounted while closed (assert the transport's `reattachRun`/status calls are not repeated on reopen); after a scripted run finishes, the entity list is re-read (port `list` call count +1). | the refresh hook is missing or the pane remounts on toggle |

## Steps

1. T2 -> hook. 2. T1 -> pane + transport. 3. T3 -> shell wiring + refresh. 4. Styles + README. Commit each.

## Acceptance

Example-web gates. With notes-app running (`node src/main.ts --web ../notes-web/dist`) and **any** detected
agent CLI, a manual prompt "create a note titled Hello" creates the note; if no agent CLI is installed, say
so: the scripted proof is N5's job. Screenshots (desktop + 390px, pane open) attached if a browser exists.

## Not verified by the planner

`ChatPaneProps` required fields; whether ChatPane needs an agent-inventory endpoint through the proxy (if
it calls a path outside N3's allow-list, add that exact path to the allow-list in `notes-app`, with a proxy
test, and list it in the report).
