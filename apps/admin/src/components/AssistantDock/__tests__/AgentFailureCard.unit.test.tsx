import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useContext } from "react";
import { afterEach, expect, it } from "vitest";
import { JiniChatProvider, MessageRow, registerExtEventRenderer, type ChatPaneAgent, type ChatPaneAgentSelection } from "@jini-ai/chat/react";
import type { AgentEvent, ChatMessage, ChatTransport } from "@jini-ai/chat/core";
import fixture from "./fixtures/gemini-position-9";
import { AgentFailureCard } from "../AgentFailureCard";
import { FailureSurfaceContext, useAgentFailureCard, useAgentFailureSurface } from "../AgentFailureCard.hooks";
import { AGENT_FAILURE_EVENT, GENERIC_AGENT_FAILURE, type FailureAgent } from "../agent-failure";

afterEach(cleanup);
const reason = "IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals. To continue using Gemini, please migrate to the Antigravity suite of products: https://antigravity.google";

function mount({ agents, events = fixture as AgentEvent[], agentId = "gemini" }: {
  agents: readonly FailureAgent[]; events?: AgentEvent[]; agentId?: string;
}) {
  let starts = 0;
  const selections: ChatPaneAgentSelection[] = [];
  const modes: string[] = [];
  const transport: ChatTransport = { async startRun() { starts++; return { runId: "run" }; },
    async reattachRun() {}, async stopRun() {}, async fetchRunStatus() { return null; } };
  const runtimeAccess = { async listAgents(): Promise<readonly ChatPaneAgent[]> { return agents; },
    async rescanAgents(): Promise<readonly ChatPaneAgent[]> { return agents; }, async daemonOnline() { return true; } };
  const initialMessages: ChatMessage[] = [{ id: "nine", role: "assistant", content: "", agentId, events, runStatus: "failed" }];
  let surface: ReturnType<typeof useAgentFailureSurface>;
  const onSelectionChange = (selection: ChatPaneAgentSelection) => selections.push(selection);
  const onExecutionModeChange = (mode: "local" | "api") => modes.push(mode);
  const unregister = registerExtEventRenderer({ name: AGENT_FAILURE_EVENT, renderer: props => <AgentFailureCard {...props} /> });
  function Harness() {
    surface = useAgentFailureSurface({ transport, runtimeAccess, initialMessages, onSelectionChange, onExecutionModeChange }, {});
    return <JiniChatProvider transport={surface.transport}>
      <FailureSurfaceContext.Provider value={surface.actions}>
        <MessageRow message={surface.initialMessages![0]!} />
      </FailureSurfaceContext.Provider>
    </JiniChatProvider>;
  }
  render(<Harness />);
  return { selections, modes, starts: () => starts, unregister,
    load: () => act(async () => { await surface.runtimeAccess.listAgents(); }) };
}

it("renders the exact reason, hint and full stderr disclosure in Jini's real message renderer", async () => {
  const h = mount({ agents: [{ id: "antigravity", name: "Antigravity", available: true }] });
  try {
    expect(screen.getByText(reason).textContent).toBe(reason);
    expect(screen.getByText("Google ended free sign-in for Gemini CLI. Switch to Antigravity, or set Gemini CLI to use an API key.").textContent)
      .toBe("Google ended free sign-in for Gemini CLI. Switch to Antigravity, or set Gemini CLI to use an API key.");
    expect(screen.getByText("Show details").closest("details")?.open).toBe(false);
    expect(screen.getByText("Show details").closest("details")?.querySelector("pre")?.textContent)
      .toBe((fixture as AgentEvent[]).filter(event => event.kind === "raw").map(event => event.line).join("\n").trim());
    expect(screen.queryByRole("button", { name: "Switch to Antigravity" })).toBeNull();
    await h.load();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Antigravity" }));
    expect(h.selections).toEqual([{ agentId: "antigravity" }]);
    expect(h.modes).toEqual(["local"]);
    expect(h.starts()).toBe(0);
  } finally { h.unregister(); }
});

it.each([false, undefined])("does not offer an unavailable or unconfirmed alternative (%s)", async available => {
  const h = mount({ agents: [{ id: "antigravity", name: "Antigravity", available }] });
  try {
    await h.load();
    expect(screen.queryByRole("button", { name: "Switch to Antigravity" })).toBeNull();
    expect(h.selections).toEqual([]);
  } finally { h.unregister(); }
});

it("uses injected declarative hints for other agents and redacts both reason and details", async () => {
  const h = mount({ agentId: "aider", events: [{ kind: "raw", line: "AuthenticationError: Incorrect API key provided: sk-secret" }],
    agents: [{ id: "aider", name: "Aider", available: true, failureHints: [{ category: "auth", patterns: ["Incorrect API key provided"], hint: "Replace the configured API key and retry." }] }] });
  try {
    await h.load();
    expect(screen.getAllByText("AuthenticationError: Incorrect API key provided: [REDACTED]").find(node => node.tagName === "P")?.textContent)
      .toBe("AuthenticationError: Incorrect API key provided: [REDACTED]");
    expect(screen.getByText("Replace the configured API key and retry.").textContent).toBe("Replace the configured API key and retry.");
    expect(document.querySelector("pre")?.textContent).toBe("AuthenticationError: Incorrect API key provided: [REDACTED]");
    expect(document.body.textContent).not.toContain("sk-secret");
  } finally { h.unregister(); }
});

it("shows today's exact generic notice when stderr is absent", () => {
  const h = mount({ agents: [], events: [{ kind: "status", label: GENERIC_AGENT_FAILURE }] });
  try {
    expect(screen.getByRole("status").textContent).toBe("The assistant could not continue this answer. Saved work is above.");
    expect(screen.queryByText("Show details")).toBeNull();
    expect(document.querySelector(".admin-agent-failure")).toBeNull();
  } finally { h.unregister(); }
});

it.each([undefined, null, false, "failed", {}, { reason: 1, details: "Error: failed" }, { reason: "Error: failed", details: 1 }])(
  "ignores malformed persisted failure data (%j)", data => {
    const { result } = renderHook(() => useAgentFailureCard({ events: [data], runStreaming: false, runSucceeded: false }));
    expect(result.current).toBeNull();
  },
);

it("uses the persisted reason when details are empty and no agent id or hint exists", () => {
  const { result } = renderHook(() => useAgentFailureCard({
    events: [{ reason: "Error: backend refused the request", details: "", agentId: 42 }],
    runStreaming: false, runSucceeded: false,
  }));
  expect(result.current).toEqual({ reason: "Error: backend refused the request", details: "Error: backend refused the request",
    hint: undefined, switchLabel: undefined, switchAgent: undefined });
});

it.each([{ runStreaming: true, runSucceeded: false }, { runStreaming: false, runSucceeded: true }])(
  "hides a valid failure while streaming or after success (%j)", flags => {
    const { result } = renderHook(() => useAgentFailureCard({
      events: [{ reason: "Error: refused", details: "Error: refused" }], ...flags,
    }));
    expect(result.current).toBeNull();
  },
);

it("the default failure context accepts a switch without requiring a provider", () => {
  const { result } = renderHook(() => useContext(FailureSurfaceContext));
  expect(result.current.agents).toEqual([]);
  expect(result.current.switchAgent("missing")).toBeUndefined();
});

it("uses local guidance when the source agent has no declared hints", () => {
  const actions = { agents: [{ id: "gemini", name: "Gemini", available: true }], switchAgent: () => {} };
  const { result } = renderHook(() => useAgentFailureCard({
    events: [{ reason, details: reason, agentId: "gemini" }], runStreaming: false, runSucceeded: false,
  }), { wrapper: ({ children }) => <FailureSurfaceContext.Provider value={actions}>{children}</FailureSurfaceContext.Provider> });
  expect(result.current).toEqual({ reason, details: reason, agentId: "gemini",
    hint: "Google ended free sign-in for Gemini CLI. Switch to Antigravity, or set Gemini CLI to use an API key.",
    switchLabel: undefined, switchAgent: undefined });
});

it("keeps the latest rescan inventory when an older list completes and switches only to confirmed agents", async () => {
  let releaseList!: (agents: readonly FailureAgent[]) => void;
  const listed = new Promise<readonly FailureAgent[]>(resolve => { releaseList = resolve; });
  const fresh: readonly FailureAgent[] = [
    { id: "aider", name: "Aider", available: true },
    { id: "gemini", name: "Gemini", available: false },
    { id: "unknown", name: "Unconfirmed" },
  ];
  const selections: ChatPaneAgentSelection[] = [];
  const modes: string[] = [];
  const input: Parameters<typeof useAgentFailureSurface>[0] = {
    transport: { async startRun() { return { runId: "run" }; }, async reattachRun() {},
      async stopRun() {}, async fetchRunStatus() { return null; } },
    runtimeAccess: { listAgents: () => listed, rescanAgents: async () => fresh, daemonOnline: async () => true },
    initialMessages: undefined,
    onSelectionChange: selection => { selections.push(selection); },
    onExecutionModeChange: mode => { modes.push(mode); },
  };
  const { result } = renderHook(() => useAgentFailureSurface(input));
  expect(result.current.initialMessages).toBeUndefined();
  const stale = result.current.runtimeAccess.listAgents();
  await act(async () => { expect(await result.current.runtimeAccess.rescanAgents()).toEqual(fresh); });
  expect(result.current.actions.agents).toEqual(fresh);
  await act(async () => { releaseList([{ id: "obsolete", name: "Old", available: true }]); await stale; });
  expect(result.current.actions.agents).toEqual(fresh);
  act(() => {
    result.current.actions.switchAgent("missing");
    result.current.actions.switchAgent("gemini");
    result.current.actions.switchAgent("unknown");
  });
  expect(selections).toEqual([]);
  expect(modes).toEqual([]);
  act(() => { result.current.actions.switchAgent("aider"); });
  expect(selections).toEqual([{ agentId: "aider" }]);
  expect(modes).toEqual(["local"]);
});

it.each([
  ["the run is still streaming", { runStreaming: true, runSucceeded: false }],
  ["the run succeeded after all", { runStreaming: false, runSucceeded: true }],
])("renders nothing while %s", (_label, run) => {
  const failure = { reason: "Agent exited", details: "Agent exited with code 1", agentId: "codex" };
  const { container, rerender } = render(<AgentFailureCard name={AGENT_FAILURE_EVENT} runId="run-1" events={[failure]} {...run} />);
  expect(container.innerHTML).toBe("");
  // Control: the same failure event, once the run has stopped without succeeding, does render.
  rerender(<AgentFailureCard name={AGENT_FAILURE_EVENT} runId="run-1" events={[failure]} runStreaming={false} runSucceeded={false} />);
  expect(screen.getByRole("status")).toBeInTheDocument();
});
