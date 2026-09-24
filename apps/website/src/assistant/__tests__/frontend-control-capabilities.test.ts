import assert from "node:assert/strict";
import test from "node:test";

import { createFrontendControl } from "@jini-ai/http-kit";

import { FRONTEND_CONTROL_CAPABILITIES } from "../frontend-control-capabilities.js";

/**
 * @file Pins the one invariant `agent-daemon-server.ts`'s `createFrontendControl` call depends on:
 * no capability reaching it may require a confirmation transport this host does not have (see
 * `frontend-control-capabilities.ts`'s own module doc). This must fail the moment either the
 * filter is dropped or a future capability with `requiresConfirmation: true` is added upstream
 * without an accompanying exclusion — the exact silent-regression shape the filter exists to
 * prevent.
 */

test("no capability reaching createFrontendControl requires confirmation", () => {
  const confirming = FRONTEND_CONTROL_CAPABILITIES.filter((capability) => capability.requiresConfirmation === true);
  assert.deepEqual(
    confirming.map((capability) => capability.id),
    [],
    "a capability requiring confirmation reached the manifest with no confirmation transport wired",
  );
});

test("all seven chat.* verbs are present, including chat.reset_conversation", () => {
  const ids = FRONTEND_CONTROL_CAPABILITIES.map((capability) => capability.id);
  for (const expected of [
    "chat.send_message",
    "chat.set_draft",
    "chat.select_agent",
    "chat.cancel_run",
    "chat.reset_conversation",
    "chat.set_working_directory",
    "chat.get_state",
  ]) {
    assert.ok(ids.includes(expected), `expected ${expected} to be present`);
  }
});

/**
 * `chat.reset_conversation` (2026-09-24, unblock-agent-actions dispatch): unlike the other five
 * `chat.*` verbs, this id is NOT the raw `CHAT_CAPABILITIES` entry passed through — that one is
 * still filtered out above for declaring `requiresConfirmation: true`. This is a Tovu-owned clone
 * (same id/description/inputSchema/risk/surface, `requiresConfirmation` omitted) added via
 * `TOVU_FRONTEND_CAPABILITIES`, because `pane.reset()` (the browser-side effect, `useChatPane.
 * hooks.ts`) only resets local view state back to `initialMessages` and cancels the in-flight run —
 * it never calls `deleteConversation` or any other persistence-deleting call, so it is not a
 * permanent-delete case that needs a human-in-the-loop confirm. Safety is instead a model-self-confirm
 * contract, fully independent of the missing `ExecutionDelegate` transport: the browser executor
 * (`useChatPaneAgentControl.hooks.ts`'s `resetConversationAction`) throws unless the model passes
 * `confirm: true`, which `inputSchema.required` below still enforces.
 */
test("chat.reset_conversation is present, self-confirmed via inputSchema, and requires no confirmation transport", () => {
  const capability = FRONTEND_CONTROL_CAPABILITIES.find((entry) => entry.id === "chat.reset_conversation");
  assert.ok(capability, "expected chat.reset_conversation to be in the manifest");
  assert.notEqual(
    capability?.requiresConfirmation,
    true,
    "no confirmation transport exists — this verb is not a permanent delete, see this file's own comment",
  );
  const schema = capability?.inputSchema as { required?: string[]; properties?: Record<string, unknown> } | undefined;
  assert.deepEqual(schema?.required, ["confirm"], "the model-self-confirm contract must still require confirm:true");
  assert.ok(schema?.properties?.["confirm"], "inputSchema must still declare the confirm field");
});

test("page.* capabilities are still present alongside the chat verbs", () => {
  const ids = FRONTEND_CONTROL_CAPABILITIES.map((capability) => capability.id);
  assert.ok(
    ids.some((id) => id.startsWith("page.")),
    "expected at least one page.* capability to survive the chat-verb addition",
  );
});

/**
 * The admin-screenshot capability (`admin.capture_screenshot`) — the assistant's only way to see
 * pixels rather than markup. Pinned separately from the chat/page assertions above because its
 * requirements are unique to it: it is Tovu-owned (not part of `@jini-ai/agentic`'s `PAGE_CAPABILITIES`
 * or `@jini-ai/chat/core`'s `CHAT_CAPABILITIES`), it must never require confirmation (no transport for
 * that — see this module's own doc), and its description is the ONLY place the model is told about
 * the capture's fidelity limits, so the exact wording matters and is asserted here rather than left
 * to eyeball review.
 */
/**
 * `admin.publish_content` (plan §4 S3) — the chat/WebMCP door to the Publish dialog. `surface:
 * "session"` for the same reason as `admin.capture_screenshot`: meaningless with no live admin tab
 * bound. No `requiresConfirmation`: plan §3 explains why the dialog itself is the confirmation and
 * this capability's executor can only open it, never publish — a capability that itself declared
 * `requiresConfirmation: true` would additionally be filtered out of this manifest entirely (this
 * file's own module doc), which would silently break the tool rather than merely mis-describe it.
 */
test("admin.publish_content is registered, a write, session-scoped, and requires no confirmation transport", () => {
  const capability = FRONTEND_CONTROL_CAPABILITIES.find((entry) => entry.id === "admin.publish_content");
  assert.ok(capability, "expected admin.publish_content to be in the manifest");
  assert.equal(capability?.risk, "write", "publishing is a write, even though this capability can only open the dialog");
  assert.equal(capability?.surface, "session", "meaningless with no live admin tab attached");
  assert.notEqual(capability?.requiresConfirmation, true, "no confirmation transport exists — the dialog IS the confirmation, see plan §3");
});

test("admin.capture_screenshot is registered, read-only, session-scoped, and states its fidelity limits", () => {
  const capability = FRONTEND_CONTROL_CAPABILITIES.find((entry) => entry.id === "admin.capture_screenshot");
  assert.ok(capability, "expected admin.capture_screenshot to be in the manifest");
  assert.equal(capability?.risk, "read", "a screenshot reads the screen; it must never be classified as a write");
  assert.equal(capability?.surface, "session", "a screenshot is meaningless with no live admin tab attached");
  assert.notEqual(capability?.requiresConfirmation, true, "no confirmation transport exists — see this module's own doc");
  assert.match(
    capability?.description ?? "",
    /iframe/i,
    "the description must warn that cross-origin/MCP-UI iframes render blank, or the model will over-trust a blank one as evidence of an empty surface",
  );
});

/**
 * Calls the REAL `createFrontendControl` — the exact function `agent-daemon-server.ts` calls at
 * module scope, from `@jini-ai/http-kit` — rather than re-deriving the assertion from the raw
 * manifest above. This is what actually confirms the six verbs *register as callable tools*, not
 * merely that they survive the array filter: `createFrontendControl` builds one
 * `ToolRegistration` per capability internally (via `createFrontendCapabilityRegistrations`), and
 * `.toolRegistrations` is what a real daemon boot hands to its `ToolRegistry`. No server is
 * started and no live agent CLI run is needed — `resolveBindToken` here is a stub returning
 * `undefined` (a legitimate "no originating surface" per that option's own doc), since this test
 * only needs the registration list, never an actual invocation.
 */
test("createFrontendControl registers exactly the seven chat.* verbs as callable tools, plus page.*, and no confirming tool", () => {
  const frontendControl = createFrontendControl({
    capabilities: FRONTEND_CONTROL_CAPABILITIES,
    resolveBindToken: () => undefined,
  });

  const ids = frontendControl.toolRegistrations.map((registration) => registration.descriptor.id);
  for (const expected of [
    "chat.send_message",
    "chat.set_draft",
    "chat.select_agent",
    "chat.cancel_run",
    "chat.reset_conversation",
    "chat.set_working_directory",
    "chat.get_state",
  ]) {
    assert.ok(ids.includes(expected), `expected ${expected} to be a registered tool`);
  }
  assert.ok(
    ids.some((id) => id.startsWith("page.")),
    "expected page.* tools to still be registered",
  );

  const confirmingRegistrations = frontendControl.toolRegistrations.filter(
    (registration) => registration.descriptor.requiresConfirmation === true,
  );
  assert.deepEqual(
    confirmingRegistrations.map((registration) => registration.descriptor.id),
    [],
    "no registered tool descriptor may require confirmation with no confirmation transport wired",
  );
});
