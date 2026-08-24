/**
 * SAMPLE / PROTOTYPE — not wired into the running app, not built or type-checked against a
 * real `node_modules` (no `npm install` was run for this exercise; `@ag-ui/client` and
 * `@copilotkit/react-core` are NOT installed anywhere in this repo). Read `spec.md` in this
 * same folder first, especially §6 item 1 before assuming the hook choice below is settled.
 *
 * Shows a Tovu-styled chat pane consuming the canary AG-UI route sketched in
 * `backend-agui-adapter.sample.ts`, structured as a plausible drop-in alternative to
 * `apps/admin/src/components/AssistantDock/AssistantDock.tsx` when
 * `executionConfig.mode === "agui"` (spec.md §5, step 3).
 *
 * DELIBERATE CHOICE, flagged loudly: this uses `useAgent` + `useCopilotKit` from
 * "@copilotkit/react-core/v2" (https://docs.copilotkit.ai/reference/hooks/useAgent),
 * NOT the todo's originally-named `useCopilotChatHeadless_c`. That hook is confirmed to be
 * an Early Access **Premium** feature gated behind a `publicLicenseKey` from Copilot Cloud
 * (https://docs.copilotkit.ai/premium/headless-ui) — a licensing dependency the todo's own
 * stated rationale ("AG-UI is a stable PUBLIC protocol... worth having over a hand-rolled
 * one") doesn't obviously sign up for. `useAgent`/`useCopilotKit` appear to be ordinary,
 * non-premium v2 hooks that give the same low-level control (own message rendering, own
 * styling, no prebuilt chat UI) without that dependency. If the owner is fine paying for
 * CopilotKit Cloud, `useCopilotChatHeadless_c` is a strict upgrade over this file (adds
 * built-in suggestions, generative-UI slots, interrupt handling) — see spec.md §6 item 1.
 */
import { useCallback, useMemo, useRef, useState } from "react";

// Verify these two import paths against the installed package version before this becomes
// real code — confirmed via docs during this research pass, but a protocol/SDK this young
// moves fast (see spec.md's own citations).
import { HttpAgent } from "@ag-ui/client";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";

// Not real Tovu imports — named here to show what a real version would reuse rather than
// reinvent. `../../styles/assistant.css` already themes the existing dock; a real AG-UI
// pane would want the same visual language, not a second design system.
// import "../../styles/assistant.css";
// import { useWiredAdminLocale } from "../../hooks/use-admin-locale.hooks";

/**
 * One AG-UI `AbstractAgent` message, per https://docs.ag-ui.com/concepts/agents and the
 * `addMessage`/`runAgent` example on https://www.npmjs.com/package/@ag-ui/client. Shape
 * confirmed for `role`/`content`/`id`; the full real type likely carries more (tool-call
 * refs, etc.) — this is the minimal slice this sample renders.
 */
interface AgUiMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
}

/**
 * Builds the `HttpAgent` instance that points at Tovu's own canary route
 * (`POST /api/admin/v1/assistant/agui-turn`, see the backend sample and spec.md §5 step 1)
 * instead of a hosted CopilotKit runtime. Constructor shape (`{url, headers}`) confirmed via
 * https://docs.ag-ui.com/sdk/js/client/http-agent.
 *
 * `credentials: "same-origin"`-equivalent behavior for a plain `fetch`-based client isn't
 * confirmed from the docs fetched during this research pass — `HttpAgent` may need an
 * explicit cookie/credentials option to carry the admin session the way every other request
 * in `assistant-transport.ts` does with `credentials: "same-origin"`. Verify before this
 * becomes real code; a version that silently drops the session cookie would 401 on Tovu's
 * `requireAdminSession` gate with no obvious symptom in the AG-UI event stream itself.
 */
function createTovuAgUiAgent(): HttpAgent {
  return new HttpAgent({
    url: "/api/admin/v1/assistant/agui-turn",
    // headers: {} — no bearer token needed; Tovu's admin session is a cookie, matching
    // every other request `assistant-transport.ts` makes with `credentials: "same-origin"`.
    // Whether `HttpAgent` sends cookies by default for a same-origin URL is exactly the
    // thing flagged as unverified above.
  });
}

/**
 * Tovu-styled chat pane for the AG-UI canary path. Structural sibling to
 * `AssistantDock.tsx`'s `<ChatPane>` usage — same idea (composer + transcript + header), but
 * built from scratch against `AbstractAgent`'s own message/tool-call model instead of
 * `chat-core`'s `ChatMessage`/`AgentEvent`, since the two are structurally different (see
 * spec.md §5 step 3 for why this is a parallel component, not a prop swap on the existing
 * one).
 *
 * Deliberately does NOT attempt A2UI/MCP-UI surface rendering, attachments, the Local-CLI
 * agent/model picker, or working-directory display — none of that exists on this path yet
 * (spec.md §4).
 */
export function AgUiAssistantDock(): JSX.Element {
  // One `HttpAgent` instance for the pane's lifetime — recreating it on every render would
  // drop in-flight runs, same reasoning `AssistantDock.tsx` gives for memoizing its own
  // `transport` (`useMemo(() => createTovuAssistantTransport(...), [])`).
  const agentRef = useRef<HttpAgent | null>(null);
  if (!agentRef.current) agentRef.current = createTovuAgUiAgent();

  // `useAgent` subscribes this component to the agent's own message/running-state changes
  // and triggers a re-render on each — confirmed shape: `{ agent, isReady }`, where `agent`
  // is the same `AbstractAgent` instance, now with live `.messages`/`.isRunning`/
  // `.toolCalls` (https://docs.copilotkit.ai/reference/hooks/useAgent).
  const { agent, isReady } = useAgent({ agent: agentRef.current } as never);
  // `as never` above: the real `UseAgentProps` shape (does it take an agent INSTANCE, or an
  // agent NAME resolved through a `<CopilotKit>` provider's registry?) wasn't confirmed from
  // the docs fetched during this research pass — flagged rather than guessed. If `useAgent`
  // turns out to resolve agents by name through a provider (the more common CopilotKit
  // pattern), `createTovuAgUiAgent()`'s instance would need to be registered on a
  // `<CopilotKit agents={{ tovu: agentRef.current }}>` provider wrapping this component
  // instead of passed directly here. Verify at implementation time.

  // `useCopilotKit` exposes the imperative `runAgent`/`stopAgent` pair
  // (https://docs.copilotkit.ai/reference/hooks/useAgent's neighboring `useCopilotKit`
  // mention) — this is what actually sends a turn, as opposed to `useAgent`'s read-only
  // subscription.
  const { copilotkit } = useCopilotKit();

  const [draft, setDraft] = useState("");

  const messages = (agent.messages ?? []) as AgUiMessage[];

  /**
   * Sends one user turn. Mirrors `@ag-ui/client`'s documented two-step flow
   * (https://www.npmjs.com/package/@ag-ui/client): `addMessage` stages the message locally
   * (no network call yet — the docs are explicit that it "adds a user message to a
   * client-side array" and is only sent when a run starts), then `copilotkit.runAgent(...)`
   * is what actually opens the request to Tovu's canary route and starts streaming AG-UI
   * events back.
   */
  const sendMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text || !isReady || agent.isRunning) return;
    setDraft("");

    agent.addMessage({
      id: `msg_${Date.now()}`,
      role: "user",
      content: text,
    } as never); // `as never`: exact `Message` shape `addMessage` expects (extra required
    // fields beyond id/role/content?) wasn't confirmed from the docs fetched during this
    // research pass — verify against `@ag-ui/core`'s real `Message` type before this compiles.

    await copilotkit.runAgent({ agent: agentRef.current! } as never);
    // Same `as never` caveat: `runAgent`'s exact parameter shape (does it take `{agent}`, or
    // is `agent` implicit from `useAgent`'s own subscription?) is inferred from the two
    // separate doc snippets cited above, not from one confirmed end-to-end example. This is
    // exactly the kind of seam to prove against a real `npm install` before trusting it.
  }, [agent, copilotkit, draft, isReady]);

  const handleComposerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage],
  );

  // Tool-call rendering: `agent.toolCalls` is mentioned in the `useAgent` docs example
  // (console.log("Tool calls:", agent.toolCalls)) but its per-call shape (does each entry
  // carry both the TOOL_CALL_START args AND the eventual TOOL_CALL_RESULT content, or are
  // those two still separate?) wasn't confirmed. Rendered here as an inert placeholder list
  // rather than guessed at in detail.
  const toolCalls = useMemo(() => (agent as { toolCalls?: unknown[] }).toolCalls ?? [], [agent]);

  return (
    <div className="jini-chat-pane" aria-label="Assistant (AG-UI canary)">
      <div className="jini-chat-pane__header">
        <div className="jini-chat-pane__heading">
          <span className="jini-chat-pane__eyebrow">Workspace chat — AG-UI canary</span>
          <h2 className="jini-chat-pane__title">Tovu assistant</h2>
        </div>
        {!isReady && <span aria-live="polite">Connecting…</span>}
      </div>

      <div className="jini-chat-pane__messages" role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="jini-chat-pane__empty">Ask the assistant to do something…</p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`jini-chat-pane__message jini-chat-pane__message--${message.role}`}
          >
            {message.content}
          </div>
        ))}

        {/* Placeholder only — see the caveat above `toolCalls` for why this isn't a real
            tool-call card the way `AssistantDock.tsx`'s `ChatPane` renders `tool_use`/
            `tool_result` events today. */}
        {toolCalls.length > 0 && (
          <div className="jini-chat-pane__tool-calls" aria-label="Tool calls">
            {toolCalls.length} tool call(s) this turn — rendering not designed in this sample.
          </div>
        )}

        {agent.isRunning && <div aria-live="polite">Thinking…</div>}
      </div>

      <div className="jini-chat-pane__composer">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Ask the assistant to do something…"
          disabled={!isReady}
        />
        <button type="button" onClick={() => void sendMessage()} disabled={!isReady || agent.isRunning || !draft.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
