import { afterEach, expect, test, vi } from "vitest";

import {
  contentRefreshApplies,
  publishContentRefresh,
  resetContentRefreshBus,
  subscribeToContentRefresh,
} from "../content-refresh-bus";

/**
 * @file The bus between "content changed elsewhere" and the mounted content screens.
 *
 * Same failure modes worth pinning as `settings-refresh-bus.test.ts` — a listener that outlives its
 * component, one broken subscriber taking the rest down, a subscriber added mid-publish — plus the
 * one this bus adds: `contentRefreshApplies`, where reading `null` as "matches nothing" would
 * silently drop every notification from the assistant-run publisher, which never narrows its scope.
 */

afterEach(() => resetContentRefreshBus());

test("delivers to every subscriber", () => {
  const seen: string[] = [];
  subscribeToContentRefresh(() => seen.push("a"));
  subscribeToContentRefresh(() => seen.push("b"));

  publishContentRefresh();

  expect(seen).toEqual(["a", "b"]);
});

test("passes resources through, and normalizes 'no information' to null", () => {
  const scopes: unknown[] = [];
  subscribeToContentRefresh((scope) => scopes.push(scope));

  publishContentRefresh(["taxonomy"]);
  publishContentRefresh();
  // An empty array means the publisher knew of no resources, which is not the same as "only these
  // zero" — it must not be mistaken for a scope that matches nothing, or the refresh is dropped.
  publishContentRefresh([]);

  expect(scopes).toEqual([["taxonomy"], null, null]);
});

test("unsubscribing stops delivery", () => {
  const listener = vi.fn();
  const dispose = subscribeToContentRefresh(listener);

  publishContentRefresh();
  dispose();
  publishContentRefresh();

  expect(listener).toHaveBeenCalledTimes(1);
});

test("one throwing subscriber does not suppress the others", () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const survivor = vi.fn();

  subscribeToContentRefresh(() => {
    throw new Error("taxonomy screen blew up");
  });
  subscribeToContentRefresh(survivor);

  expect(() => publishContentRefresh()).not.toThrow();
  expect(survivor).toHaveBeenCalledTimes(1);
  expect(errors).toHaveBeenCalledTimes(1);

  errors.mockRestore();
});

test("a subscriber added during a publish does not receive that same publish", () => {
  const seen: string[] = [];
  subscribeToContentRefresh(() => {
    seen.push("first");
    subscribeToContentRefresh(() => seen.push("late"));
  });

  publishContentRefresh();

  // Publishing iterates a snapshot rather than the live Set. Without that this is an infinite
  // loop, not a subtle ordering question.
  expect(seen).toEqual(["first"]);

  publishContentRefresh();
  expect(seen).toEqual(["first", "first", "late"]);
});

test("contentRefreshApplies treats an unknown scope as 'refresh everything'", () => {
  // The assistant-run publisher never narrows, so this branch carries every same-tab refresh.
  expect(contentRefreshApplies(null, "taxonomy")).toBe(true);
  expect(contentRefreshApplies(["taxonomy"], "taxonomy")).toBe(true);
  expect(contentRefreshApplies(["posts", "taxonomy"], "taxonomy")).toBe(true);
  expect(contentRefreshApplies(["posts"], "taxonomy")).toBe(false);
  expect(contentRefreshApplies([], "taxonomy")).toBe(false);
});
