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

test("all six safe chat.* verbs are present, and chat.reset_conversation is not", () => {
  const ids = FRONTEND_CONTROL_CAPABILITIES.map((capability) => capability.id);
  for (const expected of [
    "chat.send_message",
    "chat.set_draft",
    "chat.select_agent",
    "chat.cancel_run",
    "chat.set_working_directory",
    "chat.get_state",
  ]) {
    assert.ok(ids.includes(expected), `expected ${expected} to be present`);
  }
  assert.ok(!ids.includes("chat.reset_conversation"), "chat.reset_conversation must stay excluded");
});

test("page.* capabilities are still present alongside the chat verbs", () => {
  const ids = FRONTEND_CONTROL_CAPABILITIES.map((capability) => capability.id);
  assert.ok(
    ids.some((id) => id.startsWith("page.")),
    "expected at least one page.* capability to survive the chat-verb addition",
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
test("createFrontendControl registers exactly the six safe chat.* verbs as callable tools, plus page.*, and no confirming tool", () => {
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
    "chat.set_working_directory",
    "chat.get_state",
  ]) {
    assert.ok(ids.includes(expected), `expected ${expected} to be a registered tool`);
  }
  assert.ok(!ids.includes("chat.reset_conversation"), "chat.reset_conversation must not be a registered tool");
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
