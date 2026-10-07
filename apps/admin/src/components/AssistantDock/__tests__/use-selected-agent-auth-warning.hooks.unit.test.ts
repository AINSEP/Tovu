import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import type { ChatPaneRuntimeAccess } from "@jini-ai/chat/react";
import type { DetectedAgent } from "@jini-ai/ui";
import { useSelectedAgentAuthWarning } from "../hooks/use-selected-agent-auth-warning.hooks";

const claudeMissing: DetectedAgent = { id: "claude", label: "Claude Code", installed: true, authStatus: "missing" };
const claudeOk: DetectedAgent = { ...claudeMissing, authStatus: "ok" };
const codexUnknown: DetectedAgent = { id: "codex", label: "Codex", installed: true, authStatus: "unknown" };
const WARNING = "Claude Code: Authentication required. Sign in before sending.";

function fakeRuntimeAccess(calls: string[]): ChatPaneRuntimeAccess {
  return {
    listAgents: async () => [],
    rescanAgents: async () => { calls.push("picker-rescan"); return [{ id: "claude", label: "Claude Code", available: true }] as never; },
    daemonOnline: async () => true,
  };
}

function fakePort({ detect, rescan }: { detect: DetectedAgent[]; rescan?: DetectedAgent[] }, calls: string[] = []) {
  return {
    detectLocalAgents: async () => { calls.push("detect"); return detect; },
    rescanLocalAgents: async () => { calls.push("rescan"); return rescan ?? detect; },
  };
}

type Props = { mode: string; agentId: string | undefined; locale: string };

function render(port: ReturnType<typeof fakePort>, initialProps: Props, calls: string[] = []) {
  const runtimeAccess = fakeRuntimeAccess(calls);
  return renderHook((props: Props) => useSelectedAgentAuthWarning({ ...props, runtimeAccess }, { port }), { initialProps });
}

test("D-21b: warns before send when the selected Local CLI agent confirms a missing sign-in", async () => {
  const { result } = render(fakePort({ detect: [claudeMissing] }), { mode: "local-cli", agentId: "claude", locale: "en" });
  await waitFor(() => expect(result.current.warning).toBe(WARNING));
});

test("D-21b: an unset selection follows the dock's Claude default", async () => {
  const { result } = render(fakePort({ detect: [claudeMissing] }), { mode: "local-cli", agentId: undefined, locale: "en" });
  await waitFor(() => expect(result.current.warning).toBe(WARNING));
});

test("D-21b: the warning is translated with the admin locale", async () => {
  const { result } = render(fakePort({ detect: [claudeMissing] }), { mode: "local-cli", agentId: "claude", locale: "es" });
  await waitFor(() => expect(result.current.warning).toBe("Claude Code: Se requiere autenticación. Inicia sesión antes de enviar."));
});

test("D-21b: unknown auth and BYOK mode never warn, and switching agents clears it", async () => {
  const calls: string[] = [];
  const port = fakePort({ detect: [claudeMissing, codexUnknown] }, calls);
  const { result, rerender } = render(port, { mode: "local-cli", agentId: "claude", locale: "en" });
  await waitFor(() => expect(result.current.warning).toBe(WARNING));
  rerender({ mode: "local-cli", agentId: "codex", locale: "en" });
  await waitFor(() => expect(calls.filter((call) => call === "detect")).toHaveLength(2));
  expect(result.current.warning).toBeNull();
  rerender({ mode: "byok", agentId: "claude", locale: "en" });
  expect(result.current.warning).toBeNull();
  expect(calls.filter((call) => call === "detect")).toHaveLength(2); // BYOK does not run detection at all
});

test("D-21b: the picker's Rescan re-probes auth beside it, and a fresh sign-in clears the warning", async () => {
  const calls: string[] = [];
  const port = fakePort({ detect: [claudeMissing], rescan: [claudeOk] }, calls);
  const { result } = render(port, { mode: "local-cli", agentId: "claude", locale: "en" }, calls);
  await waitFor(() => expect(result.current.warning).toBe(WARNING));
  const pickerAnswer = await result.current.runtimeAccess.rescanAgents();
  expect(pickerAnswer).toEqual([{ id: "claude", label: "Claude Code", available: true }]); // untouched
  expect([...calls].sort()).toEqual(["detect", "picker-rescan", "rescan"]); // the auth re-probe never blocks the picker
  await waitFor(() => expect(result.current.warning).toBeNull());
});

test("D-21b: a failed re-probe drops the warning rather than keeping a stale one", async () => {
  const port = {
    detectLocalAgents: async () => [claudeMissing],
    rescanLocalAgents: async (): Promise<DetectedAgent[]> => { throw new Error("detection failed"); },
  };
  const { result } = render(port, { mode: "local-cli", agentId: "claude", locale: "en" });
  await waitFor(() => expect(result.current.warning).toBe(WARNING));
  await result.current.runtimeAccess.rescanAgents();
  await waitFor(() => expect(result.current.warning).toBeNull());
});

test("D-21b: a slow first scan cannot overwrite a newer rescan's result", async () => {
  let resolveFirst: (agents: DetectedAgent[]) => void = () => {};
  const port = {
    detectLocalAgents: () => new Promise<DetectedAgent[]>((resolve) => { resolveFirst = resolve; }),
    rescanLocalAgents: async () => [claudeOk],
  };
  const { result } = render(port, { mode: "local-cli", agentId: "claude", locale: "en" });
  await act(async () => { await result.current.runtimeAccess.rescanAgents(); });
  await act(async () => { resolveFirst([claudeMissing]); await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(result.current.warning).toBeNull();
});
