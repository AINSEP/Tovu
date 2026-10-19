import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefObject } from "react";
import type { ChatPaneComposerHandle } from "@jini-ai/chat/react";

import { resetAssistantDockBus, subscribeToAssistantDockRequests } from "../assistant-dock-bus";
import { requestAssistantPrompt, resetAssistantPromptBus, useAssistantPromptRequests } from "../assistant-prompt-bus";

/**
 * @file The drafted-request hand-off: a screen queues text, the dock opens, and the composer gets
 * the text once its handle exists. The text is only ever inserted, never sent.
 */

function handleRef(handle: Partial<ChatPaneComposerHandle> | null): RefObject<ChatPaneComposerHandle | null> {
  return { current: handle as ChatPaneComposerHandle | null };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  resetAssistantPromptBus();
  resetAssistantDockBus();
});

describe("assistant prompt bus", () => {
  it("opens the dock and inserts the text into a mounted composer", () => {
    const opens: boolean[] = [];
    subscribeToAssistantDockRequests((open) => opens.push(open));
    const insertText = vi.fn();
    renderHook(() => useAssistantPromptRequests(handleRef({ insertText })));
    requestAssistantPrompt("Import https://example.com");
    expect(opens).toEqual([true]);
    expect(insertText).toHaveBeenCalledExactlyOnceWith("Import https://example.com");
  });

  it("delivers a request queued before the dock mounted", () => {
    requestAssistantPrompt("queued");
    const insertText = vi.fn();
    renderHook(() => useAssistantPromptRequests(handleRef({ insertText })));
    expect(insertText).toHaveBeenCalledExactlyOnceWith("queued");
  });

  it("waits for the composer handle while the pane mounts", () => {
    const ref = handleRef(null);
    renderHook(() => useAssistantPromptRequests(ref));
    requestAssistantPrompt("later");
    const insertText = vi.fn();
    vi.advanceTimersByTime(250);
    ref.current = { insertText } as unknown as ChatPaneComposerHandle;
    vi.advanceTimersByTime(100);
    expect(insertText).toHaveBeenCalledExactlyOnceWith("later");
  });

  it("keeps the request for the next mount when the handle never appears, and a newer one replaces it", () => {
    const first = renderHook(() => useAssistantPromptRequests(handleRef(null)));
    requestAssistantPrompt("old");
    requestAssistantPrompt("new");
    vi.advanceTimersByTime(10_000);
    first.unmount();
    const insertText = vi.fn();
    renderHook(() => useAssistantPromptRequests(handleRef({ insertText })));
    expect(insertText).toHaveBeenCalledExactlyOnceWith("new");
  });

  it("does nothing with no request queued", () => {
    const insertText = vi.fn();
    renderHook(() => useAssistantPromptRequests(handleRef({ insertText })));
    vi.advanceTimersByTime(1_000);
    expect(insertText).not.toHaveBeenCalled();
  });
});
