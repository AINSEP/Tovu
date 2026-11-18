import { act, render, screen, within } from "@/__tests__/render-with-jini-kits";
import { describe, expect, it, vi } from "vitest";
import { executePageCapability, type FindElementsResult } from "@jini-ai/agentic/core";
import { createDomPageDriver } from "@jini-ai/agentic/dom";
import { Composer, ToolCard, useComposer, type ComposerProps } from "@jini-ai/chat/react";

/**
 * @file Chat's composer and tool card driven by the REAL agentic page driver and page reader.
 *
 * Chat's own tests prove the handles it publishes with a fake driver; whether the real
 * `createDomPageDriver` can fill the draft and the real `page.find_elements` capability can read a
 * collapsed tool call is a fact about this composition (chat + agentic), so it is held here beside
 * the other `*-agent-drive` tests. Moved verbatim from chat's `Composer.agent-handles.test.tsx` and
 * `ToolCard.long-chat-memory.test.tsx` (C-CHAT-DEPS S6).
 */

function Harness(props: Partial<Omit<ComposerProps, "composer" | "onSend">> & { onSend?: () => void }) {
  const composer = useComposer();
  return <Composer composer={composer} onSend={props.onSend ?? (() => {})} {...props} />;
}

describe("chat composer through the real page driver", () => {
  it("lets a scoped driver fill the ordinary draft while an outside root refuses send", async () => {
    const onSend = vi.fn();
    const { container } = render(<main data-agent-page="chat"><Harness agentHandle="assistant" onSend={onSend} /></main>);
    const driver = createDomPageDriver({ root: container, pages: { chat: { label: "Chat", navigate: () => {} } } });
    await act(async () => driver.fill({ handle: "assistant-draft", text: "Typed through driver" }));
    expect(screen.getByRole("textbox")).toHaveValue("Typed through driver");
    const restricted = document.createElement("main");
    document.body.append(restricted);
    try {
      const outside = createDomPageDriver({ root: restricted, pages: { chat: { label: "Chat", navigate: () => {} } } });
      await expect(outside.click({ handle: "assistant-send" })).rejects.toThrow('no element published as "assistant-send" on this page');
      expect(onSend).not.toHaveBeenCalled();
    } finally { restricted.remove(); }
    expect(within(container).getByRole("button", { name: "Send" })).toBeEnabled();
  });
});

describe("chat tool card through the real page reader", () => {
  it("lets the real page reader inspect a collapsed call and its live result without clicking", async () => {
    const use = { kind: "tool_use" as const, id: "reader", name: "page.fill", input: { element: "name-input" } };
    const { container, rerender } = render(<ToolCard use={use} runStreaming />);
    const driver = createDomPageDriver({ root: container, pages: {} });
    const read = async () => await executePageCapability({
      driver, capabilityId: "page.find_elements", input: { query: "tool-call-reader", withState: true },
    }) as FindElementsResult;

    const reader = container.querySelector(".op-card-reader-text")!;
    expect(reader).not.toHaveAttribute("hidden");
    expect(reader).toHaveClass("op-sr-prefix");
    expect(reader.closest(".accordion-collapsible")).toBeNull();
    const pending = await read();
    expect(pending.elements).toHaveLength(1);
    expect(pending.elements[0]!.state?.text).toContain("name-input");
    expect(pending.elements[0]!.state?.text).toContain("Waiting for the result or answer…");
    rerender(<ToolCard use={use} result={{ kind: "tool_result", toolUseId: "reader", content: "Saved Ada", isError: false }} runSucceeded />);
    const completed = await read();
    expect(completed.elements[0]!.state?.text).toContain("name-input");
    expect(completed.elements[0]!.state?.text).toContain("Saved Ada");
    expect(completed.elements[0]!.state?.text).not.toContain("Waiting for the result or answer…");
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelectorAll("pre")).toHaveLength(0);
  });
});
