import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useContext } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { JiniChatProvider, MessageRow, registerExtEventRenderer, type ChatPaneAgent, type ChatPaneAgentSelection } from "@jini-ai/chat/react";
import type { AgentEvent, ChatMessage, ChatTransport } from "@jini-ai/chat/core";
import fixture from "./fixtures/gemini-position-9";
import { AgentFailureCard } from "../AgentFailureCard";
import { FailureSurfaceContext, hasAgentFailureNotice, useAgentFailureCard, useAgentFailureSurface } from "../AgentFailureCard.hooks";
import { AGENT_FAILURE_EVENT, GENERIC_AGENT_FAILURE, type FailureAgent } from "../agent-failure";
import { ADMIN_LOCALES } from "@tovu/contracts/admin-locales";
import { SelectedAgentPluginTray } from "../SelectedAgentPluginTray";
import { FolderDropConfirmation } from "../FolderDropConfirmation";
import { FolderDropError } from "../FolderDropError";
import { FolderDropPathHint } from "../FolderDropPathHint";
import { SlowRunNoticeCard } from "../SlowRunNoticeCard";
import { createChatI18nAdapter, t as translateDock } from "../assistant-dock-i18n";

afterEach(cleanup);
const reason = "IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals. To continue using Gemini, please migrate to the Antigravity suite of products: https://antigravity.google";

function mount({ agents, events = fixture as AgentEvent[], agentId = "gemini", locale = "en" }: {
  agents: readonly FailureAgent[]; events?: AgentEvent[]; agentId?: string; locale?: string;
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
  const unregister = registerExtEventRenderer({ name: AGENT_FAILURE_EVENT, renderer: props => <AgentFailureCard {...props} /> }, { terminalNotice: hasAgentFailureNotice });
  function Harness() {
    surface = useAgentFailureSurface({ transport, runtimeAccess, initialMessages, onSelectionChange, onExecutionModeChange }, {});
    return <JiniChatProvider transport={surface.transport} i18n={createChatI18nAdapter(locale)}>
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
      .toContain((fixture as AgentEvent[]).filter(event => event.kind === "raw").map(event => event.line).join("\n").trim());
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
    expect(document.querySelector("pre")?.textContent).toContain("Cause: AuthenticationError: Incorrect API key provided: [REDACTED]");
    expect(document.body.textContent).not.toContain("sk-secret");
  } finally { h.unregister(); }
});

it("shows a failure card with a safe next action and copyable disclosure when stderr is absent", () => {
  const h = mount({ agents: [], events: [{ kind: "status", label: GENERIC_AGENT_FAILURE }] });
  try {
    expect(screen.getByRole("status").textContent).toContain(GENERIC_AGENT_FAILURE);
    expect(screen.getByRole("status").textContent).toContain("Review the saved work above before sending another message.");
    fireEvent.click(screen.getByText("Show details"));
    expect(screen.getByRole("button", { name: "Copy details" })).toBeTruthy();
    expect(document.querySelector(".admin-agent-failure pre")?.textContent).toContain("Cause: The assistant stopped without reporting a cause.");
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

// Use the real provider: identity mocks hide both translation bypasses and missing keys.
it.each([
  { locale: "es", remove: "Quitar Design", send: "Enviar habilidades seleccionadas", details: "Mostrar detalles", hint: "Google ha dejado de ofrecer el inicio de sesión gratuito para Gemini CLI. Cambia a Antigravity o configura Gemini CLI para usar una clave de API.", switchLabel: "Cambiar a Antigravity" },
  { locale: "ja", remove: "Designを削除", send: "選択したスキルを送信", details: "詳細を表示", hint: "Google は Gemini CLI の無料ログインを終了しました。Antigravity に切り替えるか、API キーを使用するように Gemini CLI を設定してください。", switchLabel: "Antigravityに切り替える" },
])("translates pinned-skill controls and failure actions in $locale", async copy => {
  const h = mount({ locale: copy.locale, agents: [{ id: "antigravity", name: "Antigravity", available: true }] });
  try {
    await h.load();
    expect(screen.getByText(copy.details).closest("details")?.open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: copy.switchLabel }));
    expect(h.selections).toEqual([{ agentId: "antigravity" }]);
    expect(screen.getByText(copy.hint)).toBeInTheDocument();
    const onRemove = vi.fn();
    const onSend = vi.fn();
    const transport: ChatTransport = { async startRun() { return { runId: "test" }; }, async reattachRun() {}, async stopRun() {}, async fetchRunStatus() { return null; } };
    render(<JiniChatProvider transport={transport} i18n={createChatI18nAdapter(copy.locale)}>
      <SelectedAgentPluginTray chips={[{ pluginRefId: "design", label: "Design" }]} onRemove={onRemove} onSendSkills={onSend} />
    </JiniChatProvider>);
    const remove = screen.getByRole("button", { name: copy.remove });
    expect(remove).toHaveAttribute("title", copy.remove);
    fireEvent.click(remove);
    fireEvent.click(screen.getByRole("button", { name: copy.send }));
    expect(onRemove).toHaveBeenCalledWith("design");
    expect(onSend).toHaveBeenCalledTimes(1);
  } finally { h.unregister(); }
});

it.each([
  { locale: "es", confirmation: "El asistente ahora puede leer /work.", retry: "Reintentar", retryLabel: "Volver a intentar establecer la carpeta de trabajo", dismiss: "Descartar", slow: "Sigo trabajando: esto está tardando más de lo habitual." },
  { locale: "ja", confirmation: "アシスタントが/workを読み取れるようになりました。", retry: "再試行", retryLabel: "作業フォルダーの設定を再試行", dismiss: "閉じる", slow: "処理を続けています。通常より時間がかかっています。" },
])("translates folder notices and slow-run copy in $locale", copy => {
  const onDismiss = vi.fn();
  const onRetry = vi.fn();
  const transport: ChatTransport = { async startRun() { return { runId: "test" }; }, async reattachRun() {}, async stopRun() {}, async fetchRunStatus() { return null; } };
  render(<JiniChatProvider transport={transport} i18n={createChatI18nAdapter(copy.locale)}>
    <FolderDropConfirmation path="/work" onDismiss={onDismiss} />
    <FolderDropError path="/work" reason="endpoint-unreachable" onDismiss={onDismiss} onRetry={onRetry} />
    <FolderDropPathHint onDismiss={onDismiss} />
    <SlowRunNoticeCard name="slow_running" runId="slow" events={[]} runStreaming={true} runSucceeded={false} />
  </JiniChatProvider>);
  expect(screen.getByText(copy.confirmation)).toBeInTheDocument();
  expect(screen.getByText(copy.retry)).toBeInTheDocument();
  expect(screen.getByText(copy.slow)).toBeInTheDocument();
  expect(screen.queryByText(/Browsers can't share folder paths/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: copy.retryLabel }));
  expect(onRetry).toHaveBeenCalledWith({ path: "/work" });
  const dismissButtons = screen.getAllByRole("button", { name: copy.dismiss });
  expect(dismissButtons).toHaveLength(3);
  fireEvent.click(dismissButtons[0]!);
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

it("covers required dock keys through their actual translator in every admin locale", () => {
  const keys = [
    "Remove {name}", "Send selected skills", "Show details", "Switch to {name}",
    "Google ended free sign-in for Gemini CLI. Switch to Antigravity, or set Gemini CLI to use an API key.",
    "The assistant can now read {path}, replacing the previous folder.",
    "The assistant can now read {path}.", "Dismiss", "Retry setting the working folder", "Retry",
    "Browsers can't share folder paths. Use the folder button, or paste the path (Finder: ⌥⌘C, Explorer: Ctrl+Shift+C).",
    "Browsers can't share folder paths. Paste the path instead (Finder: ⌥⌘C, Explorer: Ctrl+Shift+C).",
    "Remove from canvas", "Still working — this is taking longer than usual.",
  ];
  const missing: string[] = [];
  for (const { code } of ADMIN_LOCALES.filter(({ code }) => code !== "en")) {
    const adapter = createChatI18nAdapter(code);
    for (const key of keys) {
      const translated = adapter.t(key);
      if (!translated.trim() || translated === key) missing.push(`${code}: ${key}`);
      expect(translated.match(/\{\w+\}/g) ?? []).toEqual(key.match(/\{\w+\}/g) ?? []);
    }
    if (translateDock(code, "More settings…") === "More settings…") missing.push(`${code}: More settings…`);
    expect(adapter.t("Switch to {name}", { name: "Antigravity" })).toContain("Antigravity");
  }
  expect(missing).toEqual([]);
});


it('keeps history failures polite with host chrome and masks Tovu API keys', () => {
  const secret = 'HISTORY_CANARY_abcdefghijklmnop';
  const h = mount({ agents: [], events: [{ kind: 'raw', line: `failed tovu_ak_012345abcdef.${secret}` }] as AgentEvent[] });
  try {
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toHaveClass('notice', 'error');
    expect(screen.getByRole('status').closest('.jini-message-error')).toBeTruthy();
    expect(document.body.textContent).toContain('[REDACTED:tovu_api_key]');
    expect(document.body.textContent).not.toContain(secret);
  } finally { h.unregister(); }
});
