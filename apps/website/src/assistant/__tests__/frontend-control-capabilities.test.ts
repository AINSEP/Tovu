import assert from "node:assert/strict";
import test from "node:test";

import { createFrontendControl } from "@jini-ai/http-kit";

import { ADMIN_SHOW_SITE_PAGE_CAPABILITY_ID, FRONTEND_CONTROL_CAPABILITIES } from "../frontend-control-capabilities.js";

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
 * The admin-screenshot capability (`admin.capture_screenshot`) — the assistant's only way to see
 * pixels rather than markup. Pinned separately from the chat/page assertions above because its
 * requirements are unique to it: it is Tovu-owned (not part of `@jini-ai/agentic`'s `PAGE_CAPABILITIES`
 * or `@jini-ai/chat/core`'s `CHAT_CAPABILITIES`), it must never require confirmation (no transport for
 * that — see this module's own doc), and its description is the ONLY place the model is told about
 * the capture's fidelity limits, so the exact wording matters and is asserted here rather than left
 * to eyeball review.
 */
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
 * `admin.show_site_page` — puts one route of the live published site on the operator's screen (a
 * same-origin iframe overlay in the admin SPA; see `2026-09-15-view-site-tool-PLAN.md`). Pinned
 * separately from `admin.capture_screenshot` above because its requirements differ in the ways that
 * matter most: it is `risk: 'write'` (it changes what the operator is looking at, unlike a
 * screenshot, which changes nothing), and its description must tell the model about
 * `fetch_published_page` for visitor-truth questions rather than duplicating that tool's job.
 */
test("admin.show_site_page is registered, write-classified, session-scoped, requires no confirmation, and points at fetch_published_page for visitor truth", () => {
  const capability = FRONTEND_CONTROL_CAPABILITIES.find((entry) => entry.id === ADMIN_SHOW_SITE_PAGE_CAPABILITY_ID);
  assert.ok(capability, "expected admin.show_site_page to be in the manifest");
  assert.equal(capability?.risk, "write", "it puts something on the operator's screen — not a no-op read");
  assert.equal(capability?.surface, "session", "it is meaningless with no live admin tab attached");
  assert.notEqual(capability?.requiresConfirmation, true, "no confirmation transport exists — see this module's own doc");
  assert.match(
    capability?.description ?? "",
    /fetch_published_page/,
    "the description must point the model at fetch_published_page for what a VISITOR receives",
  );
  assert.match(
    capability?.description ?? "",
    /404/,
    "the description must say a 404 is a reported RESULT, not an error",
  );
  assert.deepEqual(
    capability?.inputSchema,
    {
      type: "object",
      properties: {
        path: { type: "string", description: "A root-relative path on THIS site, e.g. '/' or '/blog/hello'." },
      },
      required: ["path"],
      additionalProperties: false,
    },
    "the input schema must require 'path' and forbid unknown properties",
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
  assert.ok(ids.includes(ADMIN_SHOW_SITE_PAGE_CAPABILITY_ID), "expected admin.show_site_page to be a registered tool");

  const confirmingRegistrations = frontendControl.toolRegistrations.filter(
    (registration) => registration.descriptor.requiresConfirmation === true,
  );
  assert.deepEqual(
    confirmingRegistrations.map((registration) => registration.descriptor.id),
    [],
    "no registered tool descriptor may require confirmation with no confirmation transport wired",
  );
});
