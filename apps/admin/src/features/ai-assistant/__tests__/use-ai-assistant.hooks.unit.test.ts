import { afterEach, describe, expect, it } from "vitest";

import { navigateToAiAssistantTab, resolveAiAssistantRequestedTabId } from "../hooks/use-ai-assistant.hooks";

/**
 * @file `resolveAiAssistantRequestedTabId`/`navigateToAiAssistantTab` — the `?tab=` deep-linking
 * derivation and URL-sync handler `AiAssistant.tsx` used to define inline in its own component body.
 * Moved here (2026-09-03 relocation pass, moving derived-logic computations out of `.tsx` files and
 * into their hooks). Before this file, both were reachable only through a full `<AiAssistant />`
 * render (`AiAssistant.unit.test.tsx`'s "?tab= deep linking" describe block) — that suite still
 * covers the end-to-end wiring; this file adds direct coverage of the two units themselves.
 */

afterEach(() => {
  // `navigateToAiAssistantTab` drives real `history.replaceState` — reset between tests so one
  // test's navigation can't leak a `?tab=` into the next, same convention `AiAssistant.unit.test.tsx`
  // already uses for the identical reason.
  window.history.replaceState(null, "", "/");
});

describe("resolveAiAssistantRequestedTabId", () => {
  it("passes through a tabId that names a real tab", () => {
    expect(resolveAiAssistantRequestedTabId("admin")).toBe("admin");
    expect(resolveAiAssistantRequestedTabId("visitor")).toBe("visitor");
    expect(resolveAiAssistantRequestedTabId("roadmap")).toBe("roadmap");
  });

  it("falls back to undefined for null (no ?tab= at all)", () => {
    expect(resolveAiAssistantRequestedTabId(null)).toBeUndefined();
  });

  it("falls back to undefined for undefined", () => {
    expect(resolveAiAssistantRequestedTabId(undefined)).toBeUndefined();
  });

  it("falls back to undefined for an id naming no real tab (typo, stale link)", () => {
    expect(resolveAiAssistantRequestedTabId("not-a-real-tab")).toBeUndefined();
  });

  it("falls back to undefined for an empty string", () => {
    expect(resolveAiAssistantRequestedTabId("")).toBeUndefined();
  });
});

describe("navigateToAiAssistantTab", () => {
  it("writes the tab id into ?tab= via a replace, not a push", () => {
    const initialLength = window.history.length;
    navigateToAiAssistantTab("admin");
    expect(window.location.search).toBe("?tab=admin");
    // A `replace`, not a `push` — no new history entry was created.
    expect(window.history.length).toBe(initialLength);
  });
});
