import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { WorkspaceRedirect } from "../WorkspaceRedirect";
import { currentRoutePath } from "@/lib/router";

const originalUrl = window.location.href;
afterEach(() => { window.history.replaceState(null, "", originalUrl); });

// F2.1/F2.4: real consumer, effect and router, assert the browser's resulting URL/history.
// Author Checklist: no mocks; non-default initial URL; StrictMode exercises actual effect replay.
it("replaces the retired workspace URL with the Settings workspace tab without adding a history entry", () => {
  // Mutation: omit { replace: true }; the final URL is right but history length grows.
  window.history.replaceState(null, "", "/admin/workspace?old=1#stale");
  const length = window.history.length;
  const { container, rerender } = render(<StrictMode><WorkspaceRedirect /></StrictMode>);
  expect(container.innerHTML).toBe("");
  expect(window.location.pathname).toBe("/admin/settings");
  expect(window.location.search).toBe("?tab=workspace");
  expect(window.location.hash).toBe("");
  expect(currentRoutePath()).toBe("/settings");
  expect(window.history.length).toBe(length);
  window.history.replaceState(null, "", "/admin/pages");
  rerender(<StrictMode><WorkspaceRedirect /></StrictMode>);
  expect(window.location.pathname).toBe("/admin/pages");
  expect(window.history.length).toBe(length);
});
