import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MessageRow, clearExtEventRenderers, mcpUiSurfaceSlotKey, registerExtEventRenderer } from "@jini-ai/chat/react";
import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import { buildConfirmationSurface, type McpUiHostProps } from "@jini-ai/ui/mcp-ui";
import { OverflowAwareMcpUiSurfaceCard } from "../../OverflowAwareMcpUiSurfaceCard";

// Only the cross-origin iframe boundary is replaced; grouping, receipts, expiry and
// the dock wrapper use their production implementations. Surface script behavior is
// covered by Jini's confirmation tests, which execute the emitted document.
vi.mock("@jini-ai/ui/mcp-ui", async original => ({
  ...await original<typeof import("@jini-ai/ui/mcp-ui")>(),
  McpUiHost: ({ onToolCall, title }: McpUiHostProps) => <section aria-label={title}>
    <button onClick={() => void Promise.resolve(onToolCall?.({ name: "deployment_execute_static_publish", arguments: { decision: "confirm" } })).catch(() => {})}>Commit</button>
    <button onClick={() => void onToolCall?.({ name: "deployment_execute_static_publish", arguments: { decision: "cancel" } })}>Decline</button>
  </section>,
}));

const resource = buildConfirmationSurface({ uri: "ui://tovu/commit/approval-1", title: "Commit website?",
  confirm: { label: "Commit", toolName: "deployment_execute_static_publish", params: { decision: "confirm" } },
  cancel: { label: "Decline", toolName: "deployment_execute_static_publish", params: { decision: "cancel" } },
});
const pending: AgentEvent[] = [
  { kind: "tool_use", id: "commit", name: "deployment_execute_static_publish", input: {} },
  { kind: "ext", name: "mcp-ui", data: resource },
  { kind: "tool_use", id: "unrelated", name: "read_page", input: {} },
  { kind: "tool_result", toolUseId: "unrelated", content: "Done.", isError: false },
];
const message = (events = pending, runStatus: ChatMessage["runStatus"] = "running"): ChatMessage => ({ id: "run-row", role: "assistant", content: "", events, runStatus });
function setup(execute = vi.fn().mockResolvedValue({ delivered: true })) {
  registerExtEventRenderer({ name: "mcp-ui", renderer: props => <OverflowAwareMcpUiSurfaceCard {...props}
    sandboxProxyUrl={new URL("https://sandbox.test/proxy.html")} onToolCall={execute} /> }, { slotKey: mcpUiSurfaceSlotKey });
  return execute;
}
afterEach(() => clearExtEventRenderers());

it("keeps commit pending before a click despite an unrelated completed tool", () => {
  const execute = setup();
  const view = render(<MessageRow message={message()} runStreaming />);
  expect(screen.getByRole("region", { name: "Commit website?" })).toBeInTheDocument();
  expect(screen.getByText("Waiting for your answer above")).toBeInTheDocument();
  expect(view.container.querySelector(".mcpui-surface-card-closed")).toBeNull();
  expect(execute).not.toHaveBeenCalled();
});

it.each(["confirm", "cancel"])("delivery of %s closes waiting without manufacturing a commit result", async decision => {
  const execute = setup();
  const view = render(<MessageRow message={message()} runStreaming />);
  fireEvent.click(screen.getByRole("button", { name: decision === "confirm" ? "Commit" : "Decline" }));
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByText("Waiting for your answer above")).toBeNull());
  expect(execute.mock.calls[0][0].arguments).toEqual({ decision });
  expect(view.container.textContent).not.toContain("Website committed");
  const events: AgentEvent[] = [...pending, { kind: "tool_result", toolUseId: "commit",
    content: decision === "confirm" ? "Website committed" : '{"cancelled":true}', isError: false }];
  view.rerender(<MessageRow message={message(events, "succeeded")} />);
  expect(screen.queryByRole("region", { name: "Commit website?" })).toBeNull();
});

it.each(["expired", "failed"])("history replay of %s closes the original approval without executing", outcome => {
  const execute = setup();
  const events: AgentEvent[] = [...pending, { kind: "tool_result", toolUseId: "commit", content: outcome, isError: outcome === "failed" }];
  const view = render(<MessageRow message={message(JSON.parse(JSON.stringify(events)), "failed")} />);
  expect(screen.queryByRole("region", { name: "Commit website?" })).toBeNull();
  expect(view.container.querySelector(".mcpui-surface-card-closed")).not.toBeNull();
  expect(execute).not.toHaveBeenCalled();
});

it("keeps the approval available after delivery fails", async () => {
  const execute = setup(vi.fn().mockRejectedValue(new Error("delivery failed")));
  const view = render(<MessageRow message={message()} runStreaming />);
  fireEvent.click(screen.getByRole("button", { name: "Commit" }));
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("region", { name: "Commit website?" })).toBeInTheDocument();
  expect(screen.getByText("Waiting for your answer above")).toBeInTheDocument();
  expect(view.container.querySelector(".mcpui-surface-card-closed")).toBeNull();
});
