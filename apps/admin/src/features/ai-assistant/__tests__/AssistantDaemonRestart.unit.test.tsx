import { render, screen } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import { AssistantDaemonRestart } from "@jini-ai/admin/screens/assistant-settings/AssistantDaemonRestart";
import type { ProcessRestartController as AssistantDaemonRestartController } from "@jini-ai/admin/react";
import { useTovuExecutionPolicy } from '@/hooks/use-tovu-execution-policy.hooks';
import { useAssistantRestartAllowed } from "../AiAssistant.hooks";

/**
 * @file Host parity for `AssistantDaemonRestart` (now in `@jini-ai/admin`, whose own suite covers
 * the control's rendering and interaction): the host's `useAssistantRestartAllowed` binding over the
 * real execution policy decides whether the Local CLI process entry point exists at all.
 */

function fakeController(overrides: Partial<AssistantDaemonRestartController> = {}): AssistantDaemonRestartController {
  return {
    restarting: false,
    restartResult: null,
    restartError: null,
    checkingStatus: false,
    knownFailed: null,
    statusError: null,
    restart: vi.fn(async () => {}),
    checkStatus: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderRestart(policy: Parameters<typeof useTovuExecutionPolicy>[1], restart = vi.fn(async () => {})) {
  render(<AssistantDaemonRestart t={(key) => key} description="Explainer"
    useAssistantDaemonRestartHook={() => fakeController({ restart })}
    useRestartAllowedHook={() => useAssistantRestartAllowed({ useExecutionPolicy: (input) => useTovuExecutionPolicy(input, policy) })} />);
  return restart;
}

describe("AssistantDaemonRestart host binding", () => {
  it("shows the Local CLI process entry point on a desktop host", () => {
    renderRestart({ desktop: true });
    expect(screen.getByText("Local CLI process")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart assistant" })).toBeEnabled();
  });

  it('hides the Local CLI process entry point on a deployed site', () => {
    const restart = renderRestart({ desktop: false, loadRuntime: async () => ({ mode: 'production' }) });
    expect(screen.queryByText('Local CLI process')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restart assistant' })).not.toBeInTheDocument();
    expect(restart).not.toHaveBeenCalled();
  });
});
