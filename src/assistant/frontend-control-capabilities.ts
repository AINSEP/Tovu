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
 */
import { PAGE_CAPABILITIES, type CapabilityDef } from "@jini-ai/agentic";
import { CHAT_CAPABILITIES } from "@jini-ai/chat/core";

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
];
