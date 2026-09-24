/**
 * @file The capability manifest handed to `agent-daemon-server.ts`'s `createFrontendControl` —
 * split out from that file (rather than inlined at the call site) because it is pure data with no
 * side effects, unlike the rest of that module, which binds a real server and real DB connections
 * on import. Keeping it here lets a unit test assert the filter below without paying for any of
 * that.
 *
 * `PAGE_CAPABILITIES` (`@jini-ai/agentic`) is the existing, already-wired `page.*` verb set.
 * `CHAT_CAPABILITIES` (`@jini-ai/chat/core`) is the seven `chat.*` verbs a chat pane supports —
 * concatenated in here for the first time, filtered as below.
 *
 * ## Why `chat.reset_conversation` is excluded, and why the filter is on the PROPERTY
 *
 * There is no human-confirmation transport wired in this host. `createToolExecutor` is built with
 * NO `ExecutionDelegate` (`agent-daemon-server.ts`), so a capability with `requiresConfirmation:
 * true` parks its execution on a promise only `resumeConfirmation` can settle — and nothing calls
 * it. The park is unbounded, not merely slow: `descriptor.timeoutMs`'s timer is armed only AFTER
 * the confirmation await resolves, so a parked confirming call would hang forever rather than time
 * out. `src/assistant/pending-confirmations.ts`'s own module doc records the identical reasoning
 * for why a bare `requiresConfirmation` boolean is "not a weaker version of this mechanism; it is a
 * hang." Jini's own build-time guard for the equivalent CMS-tool case
 * (`ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT`, `@jini-ai/cms`'s `registration-kit.ts`)
 * throws rather than let a confirmation-requiring tool be wired at all, for the same reason.
 *
 * Of `CHAT_CAPABILITIES`'s seven verbs, exactly one — `chat.reset_conversation` — declares
 * `requiresConfirmation: true`. The filter below excludes it by that property, deliberately NOT by
 * id (`c.id !== 'chat.reset_conversation'`): an id-based exclusion only ever knows about the
 * confirming verb that exists today. The moment anyone adds a new `requiresConfirmation: true`
 * capability to this manifest, an id-based filter has no way to know about it and it sails through
 * unfiltered, parking unbounded exactly like `chat.reset_conversation` would have — with nothing in
 * a future diff to flag it. Filtering on `requiresConfirmation` instead is self-maintaining: any
 * confirming capability, present or future, stays excluded automatically until a real confirmation
 * transport exists. This is a deferral of that one verb, not a judgement that confirmation is
 * unnecessary — see the module docs above for why it cannot be safely wired today.
 *
 * ## A risk to know about even for the six verbs that ARE wired
 *
 * `chat.send_message` lets the agent inject a message into the chat pane as if the user had typed
 * it and pressed send — the agent prompting itself, not a human. Not destructive and not blocking
 * this change, but worth naming here since it's the kind of thing the next reader of this file
 * needs to already know rather than rediscover.
 *
 * ## `admin.capture_screenshot` — Tovu-owned, not from either Jini vocabulary
 *
 * Added 2026-08-30 so the assistant can see the admin's OWN rendered pixels rather than only DOM
 * structure (`page.find_elements`) — the gap that forced an operator to screenshot-and-paste by
 * hand. It is not part of `PAGE_CAPABILITIES` or `CHAT_CAPABILITIES` because it is not generic chat/
 * page vocabulary; it belongs to Tovu the way `TOVU_FRONTEND_CAPABILITIES` below is scoped.
 *
 * The browser side (`apps/admin/src/App.hooks.tsx`'s `useAgentPageBridge`) claims it through
 * `createFrontendSessionBridge`'s `executors` map, keyed by the `"admin."` prefix — the SAME
 * extension point this file's header describes `chat.*`/`page.*` using, just exercised for the
 * first time by a Tovu-native verb instead of a Jini one. `apps/admin/src/lib/agent-screenshot.ts`
 * is the executor; its own module doc has the capture design (in-page `html2canvas-pro` rasterization,
 * chosen over a native OS screen-share permission prompt or a server-side headless-Chromium
 * re-render — see that file for why) and the full list of what it cannot see.
 *
 * `risk: 'read'` and `surface: 'session'`: it changes nothing and is meaningless with no live admin
 * tab bound to the run, exactly like `page.find_elements`. It carries no `requiresConfirmation` — it
 * would be filtered out below if it did, same as every other capability in this file.
 *
 * ## `admin.publish_content` — the chat/WebMCP door to the Publish dialog
 *
 * Added 2026-09-24 (plan §4 S3, `publish-criteria-tool-webmcp-plan-2026-09-24.md`) so chat and,
 * later, Chrome's WebMCP agent can open the admin's Publish dialog pre-filled with what to publish
 * or overwrite. `risk: 'write'` (publishing writes to the site) but still no `requiresConfirmation`:
 * the executor behind this id (`apps/admin/src/App.hooks.tsx`'s `buildAdminCapabilityExecutors`) can
 * only call `requestPublish`, never `confirmPublish`/`executePublish` — the dialog itself is the
 * confirmation, and only a person's own click on its Publish button can write anything. See that
 * plan's §3 for the full gate (why the Publish button carries no agent handle, and what that does
 * and does not cover).
 *
 * ## `chat.reset_conversation` — a Tovu-owned CLONE, not the filtered-out Jini entry
 *
 * Added 2026-09-24 (unblock-agent-actions dispatch, item 2). The raw `CHAT_CAPABILITIES` entry for
 * this id is still excluded by the `requiresConfirmation !== true` filter above — that has not
 * changed. `TOVU_FRONTEND_CAPABILITIES` below instead carries a Tovu-owned clone of the SAME
 * descriptor (identical id/description/inputSchema/risk/surface), with `requiresConfirmation`
 * omitted so it is not caught by that filter.
 *
 * This is safe without the missing confirmation transport because the actual effect is not a
 * permanent delete: the browser-side executor (Jini's `packages/chat/src/react/features/chat-pane/
 * hooks/useChatPane.hooks.ts`, `reset()`) only resets in-memory view state back to
 * `initialMessages` and cancels the in-flight run — it never calls `deleteConversation` or any
 * other persistence-deleting API, so no stored conversation row or message is destroyed. Contrast
 * this with `redirects_tombstone`/`content_post_delete`, which DO need the held-open MCP-UI
 * confirmation exchange because they mutate durable state irreversibly without one.
 *
 * Safety instead comes from a model-self-confirm contract that is fully independent of the missing
 * `ExecutionDelegate` transport: the capability's own `inputSchema` still requires a `confirm:
 * boolean` field (copied verbatim from the Jini entry, not weakened here), and the executor
 * (`useChatPaneAgentControl.hooks.ts`'s `resetConversationAction` -> `requireConfirmation`) throws
 * unless the model actually passes `confirm: true`. That check is already fully implemented
 * upstream and does not depend on this host's confirmation-transport gap at all.
 */
import { PAGE_CAPABILITIES, type CapabilityDef } from "@jini-ai/agentic";
import { CHAT_CAPABILITIES } from "@jini-ai/chat/core";
import { PUBLISH_CONTENT_CAPABILITY } from "../features/publish-content/ui/criteria.js";

/**
 * Tovu-native capabilities that reach the admin's own browser tab through the same frontend-session
 * channel as `page.*`/`chat.*`, but describe verbs neither Jini vocabulary knows about. See this
 * file's header ("`admin.capture_screenshot` — Tovu-owned, not from either Jini vocabulary") for why
 * this lives here rather than being folded into an upstream package.
 */
const TOVU_FRONTEND_CAPABILITIES: readonly CapabilityDef[] = [
  {
    id: "admin.capture_screenshot",
    description:
      "Captures a picture of what the operator's admin browser tab actually looks like RIGHT NOW — " +
      "current scroll position, open panels, in-progress edits — as a real image, not a description. " +
      "Use this whenever a request is about how something LOOKS (cramped, misaligned, overlapping, " +
      "clipped, ugly, 'does this look right') rather than what the markup contains; page.find_elements " +
      "only reports DOM structure and cannot answer a visual question. " +
      "FIDELITY LIMITS, read before trusting what is or is not in the image: this is an in-page " +
      "rasterization of the admin's main content area (not the assistant panel itself), not a real " +
      "screen capture. Cross-origin iframes render as BLANK space — this includes every MCP-UI surface " +
      "the assistant itself has rendered, so a blank rectangle where a rendered UI card should be is " +
      "NOT evidence that nothing is there. Cross-origin images without permissive CORS headers, " +
      "<canvas>/WebGL content, and <video> frames may also render blank or wrong. Only what is " +
      "currently visible within that content area is captured — content scrolled out of view is not " +
      "included. Capture can fail or be refused if the admin tab is not currently attached, or if the " +
      "rendered view is too large to encode within this tool's size budget; either case is reported as " +
      "a text explanation rather than a partial or corrupted image.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    risk: "read",
    surface: "session",
  },
  // `as const`-typed in criteria.ts (see that file's own header for why); assigned here by
  // reference into this array's `CapabilityDef[]` element type, where ordinary structural
  // assignability applies rather than a fresh object literal's excess-property check.
  PUBLISH_CONTENT_CAPABILITY,
  // Tovu-owned clone of `@jini-ai/chat/core`'s `chat.reset_conversation` CHAT_CAPABILITIES entry —
  // see this file's own header ("`chat.reset_conversation` — a Tovu-owned CLONE") for why this
  // duplicates rather than re-exports that entry, and why omitting `requiresConfirmation` here is
  // safe. Keep description/inputSchema/risk/surface in sync with the Jini source if it changes.
  {
    id: "chat.reset_conversation",
    description:
      "DESTRUCTIVE. Clear the conversation back to its initial messages and reset the composer, " +
      "discarding the visible transcript and cancelling any in-flight run. Requires explicit confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          description: "Must be true. Acknowledges that the current conversation will be discarded.",
        },
      },
      required: ["confirm"],
      additionalProperties: false,
    },
    risk: "write",
    surface: "session",
  },
];

/**
 * The full set of capabilities `createFrontendControl` gates and exposes to a run's agent —
 * `page.*` plus every `chat.*` verb except the one that requires a confirmation transport this
 * host does not have.
 *
 * @complexity O(n) once at module load (array concat + filter over `CHAT_CAPABILITIES`'s fixed
 * seven entries); O(1) thereafter, since the result is a module-level constant.
 * @overallScore 100
 */
export const FRONTEND_CONTROL_CAPABILITIES: readonly CapabilityDef[] = [
  ...PAGE_CAPABILITIES,
  ...CHAT_CAPABILITIES.filter((capability) => capability.requiresConfirmation !== true),
  ...TOVU_FRONTEND_CAPABILITIES,
];
