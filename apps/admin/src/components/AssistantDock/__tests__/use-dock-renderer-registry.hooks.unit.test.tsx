import { render, renderHook, screen } from "@testing-library/react";
import { isValidElement, StrictMode } from "react";
import { describe, expect, it } from "vitest";
import {
  getExtEventRenderer,
  registerExtEventRenderer,
  extEventSlot,
  MCP_UI_EXT_EVENT_NAME,
  MID_RUN_USER_MESSAGE_EXT_EVENT_NAME,
  MidRunUserMessage,
} from "@jini-ai/chat/react";
import { AgentFailureCard } from "../AgentFailureCard";
import { AGENT_FAILURE_EVENT } from "../agent-failure";
import { useDockRendererRegistry } from "../hooks/use-dock-renderer-registry.hooks";

const eventNames = [MCP_UI_EXT_EVENT_NAME, "a2ui", "slow_running", AGENT_FAILURE_EVENT, MID_RUN_USER_MESSAGE_EXT_EVENT_NAME];
const resource = (uri: string) => ({ type: "resource", resource: { uri, mimeType: "text/html", text: "<p>choice</p>" } });

describe("admin dock owned renderer lifecycle", () => {
  it("preserves ordinary transcript spacing and queued state in the real mid-run renderer", () => {
    const { result } = renderHook(() => useDockRendererRegistry());
    const renderer = result.current.registry.get({ name: MID_RUN_USER_MESSAGE_EXT_EVENT_NAME })!;
    const props = { name: MID_RUN_USER_MESSAGE_EXT_EVENT_NAME, runStreaming: true, runSucceeded: false,
      transcriptRow: true, runId: "active", events: [{ id: "steering", text: "Also update the footer.", deliveryState: "queued" }] };
    const { container, rerender } = render(<>{renderer(props)}</>);
    const bubble = container.querySelector('.jini-message-user');
    expect(bubble).not.toBeNull();
    expect(bubble).not.toHaveClass('jini-message-user--mid-run');
    expect(screen.getByText('Queued — read after the current step')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeInTheDocument();
    rerender(<>{renderer({ ...props, runStreaming: false, runSucceeded: true })}</>);
    expect(screen.queryByText('Queued — read after the current step')).not.toBeInTheDocument();
    expect(screen.getByText('Also update the footer.')).toBeInTheDocument();
  });

  it("keeps renderers and slot keys isolated from compatibility globals, including on import", () => {
    // Importing the hook must not register any dock behavior before it is mounted.
    for (const name of eventNames) expect(getExtEventRenderer({ name })).toBeUndefined();
    const globalRenderer = () => null;
    const unregisterGlobals = eventNames.map(name => registerExtEventRenderer({ name, renderer: globalRenderer }));
    try {
      const dock = renderHook(() => useDockRendererRegistry());
      for (const name of eventNames) {
        expect(dock.result.current.registry.get({ name })).toBeTypeOf("function");
        expect(getExtEventRenderer({ name })).toBe(globalRenderer);
      }
      expect(dock.result.current.registry.slot({ name: MCP_UI_EXT_EVENT_NAME, data: resource("ui://first") })).toBe("mcp-ui:ui://first");
      expect(dock.result.current.registry.slot({ name: MCP_UI_EXT_EVENT_NAME, data: resource("ui://second") })).toBe("mcp-ui:ui://second");
      expect(extEventSlot({ name: MCP_UI_EXT_EVENT_NAME, data: resource("ui://first") })).toBe("mcp-ui");
      expect(dock.result.current.registry.slot({ name: MID_RUN_USER_MESSAGE_EXT_EVENT_NAME, data: { id: "sent-1", text: "hello" } })).toBe(`${MID_RUN_USER_MESSAGE_EXT_EVENT_NAME}:sent-1`);
      expect(dock.result.current.registry.slot({ name: MID_RUN_USER_MESSAGE_EXT_EVENT_NAME, data: { id: "sent-2", text: "again" } })).toBe(`${MID_RUN_USER_MESSAGE_EXT_EVENT_NAME}:sent-2`);
      dock.unmount();
      for (const name of eventNames) expect(getExtEventRenderer({ name })).toBe(globalRenderer);
    } finally {
      unregisterGlobals.forEach(dispose => dispose());
    }
  });

  it("keeps one registry across rerenders and independent registries for simultaneous docks", () => {
    const first = renderHook(() => useDockRendererRegistry());
    const second = renderHook(() => useDockRendererRegistry());
    const firstRegistry = first.result.current.registry;
    const secondRegistry = second.result.current.registry;
    const firstRenderer = firstRegistry.get({ name: MCP_UI_EXT_EVENT_NAME });
    expect(secondRegistry).not.toBe(firstRegistry);
    first.rerender();
    expect(first.result.current.registry).toBe(firstRegistry);
    expect(firstRegistry.get({ name: MCP_UI_EXT_EVENT_NAME })).toBe(firstRenderer);
    first.unmount();
    for (const name of eventNames) {
      expect(firstRegistry.get({ name })).toBeUndefined();
      expect(secondRegistry.get({ name })).toBeTypeOf("function");
    }
    second.unmount();
    for (const name of eventNames) expect(secondRegistry.get({ name })).toBeUndefined();
  });

  it("restores every renderer after StrictMode cleanup replay and unregisters all on unmount", () => {
    const dock = renderHook(() => useDockRendererRegistry(), { wrapper: StrictMode });
    const registry = dock.result.current.registry;
    for (const name of eventNames) expect(registry.get({ name })).toBeTypeOf("function");
    dock.unmount();
    for (const name of eventNames) expect(registry.get({ name })).toBeUndefined();
    // Cleanup removes the slot-key registrations as well as their renderer callbacks.
    expect(registry.slot({ name: MCP_UI_EXT_EVENT_NAME, data: resource("ui://first") })).toBe("mcp-ui");
    expect(registry.slot({ name: MID_RUN_USER_MESSAGE_EXT_EVENT_NAME, data: { id: "sent-1" } })).toBe(MID_RUN_USER_MESSAGE_EXT_EVENT_NAME);
  });

  it("does not let a stale dock cleanup erase a replacement registration", () => {
    const dock = renderHook(() => useDockRendererRegistry());
    const registry = dock.result.current.registry;
    // A later registration may even reuse the callback, as during hot reload. Entry identity,
    // rather than callback identity, must decide which cleanup owns it.
    const renderer = registry.get({ name: "a2ui" })!;
    const unregisterReplacement = registry.register({ name: "a2ui", renderer });
    dock.unmount();
    expect(registry.get({ name: "a2ui" })).toBe(renderer);
    for (const name of eventNames.filter(name => name !== "a2ui")) expect(registry.get({ name })).toBeUndefined();
    unregisterReplacement();
    expect(registry.get({ name: "a2ui" })).toBeUndefined();
  });

  it("reuses Jini's mid-run bubble and the dock's failure card with their original props", () => {
    const { result } = renderHook(() => useDockRendererRegistry());
    const props = { name: "ext", events: [{ id: "sent-1", text: "hello" }], runStreaming: false, runSucceeded: true, runId: "run-1" };
    const bubble = result.current.registry.get({ name: MID_RUN_USER_MESSAGE_EXT_EVENT_NAME })!(props);
    expect(isValidElement(bubble)).toBe(true);
    if (!isValidElement<{ events: unknown[] }>(bubble)) throw new Error("mid-run renderer did not return an element");
    expect(bubble.type).toBe(MidRunUserMessage);
    expect(bubble.props.events).toBe(props.events);
    const failure = result.current.registry.get({ name: AGENT_FAILURE_EVENT })!(props);
    expect(isValidElement(failure)).toBe(true);
    if (!isValidElement<typeof props>(failure)) throw new Error("failure renderer did not return an element");
    expect(failure.type).toBe(AgentFailureCard);
    expect(failure.props).toEqual(props);
  });
});
