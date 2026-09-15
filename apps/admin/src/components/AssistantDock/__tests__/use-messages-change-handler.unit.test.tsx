import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { ChatMessage } from "@jini-ai/chat/core";

import { useMessagesChangeHandler } from "../hooks/AssistantDock.hooks";
import { resetContentRefreshBus, subscribeToContentRefresh } from "@/lib/content-refresh-bus";
import { resetSettingsRefreshBus, subscribeToSettingsRefresh } from "@/lib/settings-refresh-bus";

/**
 * @file `useMessagesChangeHandler` — the one publisher that fires when an assistant run finishes.
 *
 * It has announced settings changes since the dock was built. The 2026-08-26 bug is that a run
 * which wrote *content* (`taxonomy_create_taxonomy`) announced nothing at all, so a content screen
 * open in the same tab stayed stale until the operator reloaded. This pins both announcements to
 * the same trigger, and pins the per-run dedup that keeps a streaming reply from publishing on
 * every delta.
 *
 * Both buses are the real modules, not fakes: what broke was the wiring between this hook and them.
 */

afterEach(() => {
  resetContentRefreshBus();
  resetSettingsRefreshBus();
});

/** A finished assistant turn — the exact shape `shouldPublishOnMessagesChange` treats as terminal. */
function settledAssistantMessage(id: string): ChatMessage {
  return { id, role: "assistant", content: "Done. Seasons is created.", runStatus: "succeeded" };
}

/** A run still in flight whose Nth tool call has just returned. */
function runningWithToolResults(id: string, count: number): ChatMessage {
  return {
    id,
    role: "assistant",
    content: "Creating the post…",
    runStatus: "running",
    events: Array.from({ length: count }, (_, i) => ({
      kind: "tool_result" as const,
      toolUseId: `t${i}`,
      content: "ok",
      isError: false,
    })),
  };
}

it("announces a content refresh when a run finishes, not only a settings refresh", () => {
  const content = vi.fn();
  const settings = vi.fn();
  subscribeToContentRefresh(content);
  subscribeToSettingsRefresh(settings);

  const { result } = renderHook(() => useMessagesChangeHandler({ chats: { onMessagesChange: vi.fn() } }));
  result.current([settledAssistantMessage("m1")]);

  // `null` scope, not a resource list: this publisher does not know what the run touched, and
  // saying so is more honest than guessing. See `content-refresh-bus.ts`'s own doc.
  expect(content).toHaveBeenCalledTimes(1);
  expect(content).toHaveBeenCalledWith(null);
  expect(settings).toHaveBeenCalledTimes(1);
});

it("publishes once per finished run, not once per streaming delta", () => {
  const content = vi.fn();
  subscribeToContentRefresh(content);

  const { result } = renderHook(() => useMessagesChangeHandler({ chats: { onMessagesChange: vi.fn() } }));

  // A reply still streaming is not terminal, so nothing is announced yet.
  result.current([{ id: "m1", role: "assistant", content: "Creat", runStatus: "running" }]);
  expect(content).not.toHaveBeenCalled();

  // The terminal message keeps arriving in later `onMessagesChange` calls after it settles;
  // without the per-run dedup this would invalidate every content cache on every one of them.
  result.current([settledAssistantMessage("m1")]);
  result.current([settledAssistantMessage("m1")]);
  expect(content).toHaveBeenCalledTimes(1);

  result.current([settledAssistantMessage("m1"), settledAssistantMessage("m2")]);
  expect(content).toHaveBeenCalledTimes(2);
});

it("still forwards the transcript to the chat store when the run is not terminal", () => {
  const onMessagesChange = vi.fn();
  const content = vi.fn();
  subscribeToContentRefresh(content);

  const { result } = renderHook(() => useMessagesChangeHandler({ chats: { onMessagesChange } }));
  const messages: ChatMessage[] = [{ id: "m1", role: "user", content: "make a Seasons taxonomy" }];
  result.current(messages);

  expect(onMessagesChange).toHaveBeenCalledWith(messages);
  expect(content).not.toHaveBeenCalled();
});

it("announces a content refresh as soon as a tool call returns, not only when the run ends", () => {
  const content = vi.fn();
  subscribeToContentRefresh(content);
  const { result } = renderHook(() => useMessagesChangeHandler({ chats: { onMessagesChange: vi.fn() } }));

  // The 2026-09-15 bug: `content_post_create` returned, and the assistant then navigated to Posts
  // and read the list — all inside one run. Nothing had been published yet, so the mounted list was
  // still showing what it fetched at mount.
  result.current([runningWithToolResults("m1", 1)]);

  expect(content).toHaveBeenCalledTimes(1);
  expect(content).toHaveBeenCalledWith(null);
});

it("announces once per returned tool call, not once per streaming delta", () => {
  const content = vi.fn();
  subscribeToContentRefresh(content);
  const { result } = renderHook(() => useMessagesChangeHandler({ chats: { onMessagesChange: vi.fn() } }));

  result.current([runningWithToolResults("m1", 1)]);
  result.current([runningWithToolResults("m1", 1)]); // text deltas, same tool results
  expect(content).toHaveBeenCalledTimes(1);

  result.current([runningWithToolResults("m1", 2)]);
  expect(content).toHaveBeenCalledTimes(2);
});

it("does not announce a settings refresh mid-run", () => {
  const settings = vi.fn();
  subscribeToSettingsRefresh(settings);
  const { result } = renderHook(() => useMessagesChangeHandler({ chats: { onMessagesChange: vi.fn() } }));

  result.current([runningWithToolResults("m1", 1)]);

  expect(settings).not.toHaveBeenCalled();
});

it("does not announce twice when the terminal delta also carries a new tool result", () => {
  const content = vi.fn();
  subscribeToContentRefresh(content);
  const { result } = renderHook(() => useMessagesChangeHandler({ chats: { onMessagesChange: vi.fn() } }));

  result.current([{ ...runningWithToolResults("m1", 1), runStatus: "succeeded" }]);

  expect(content).toHaveBeenCalledTimes(1);
});
