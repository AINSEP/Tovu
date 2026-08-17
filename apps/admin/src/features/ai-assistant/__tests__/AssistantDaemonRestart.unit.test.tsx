import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssistantDaemonRestart, assistantDaemonStatusMessage } from "../AiAssistant";
import type { AssistantDaemonRestartController } from "../hooks/use-assistant-daemon-restart.hooks";

/**
 * @file First test for `AssistantDaemonRestart` (the "Admin AI Assistant" tab's manual daemon
 * restart control). Mirrors `AdminExecutionMode.unit.test.tsx`'s "renders from the injected fake,
 * not a real round trip" shape: `useAssistantDaemonRestartHook` is the DI seam every assertion
 * below drives directly, so no test here depends on a real `fetch`.
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

describe("AssistantDaemonRestart — rendering from the injected controller", () => {
  it("renders the idle state with both controls enabled", () => {
    render(<AssistantDaemonRestart useAssistantDaemonRestartHook={() => fakeController()} />);
    expect(screen.getByRole("button", { name: "Restart assistant" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Check status" })).toBeEnabled();
  });

  it("shows 'Restarting…' and disables the restart button while a restart is in flight", () => {
    render(<AssistantDaemonRestart useAssistantDaemonRestartHook={() => fakeController({ restarting: true })} />);
    expect(screen.getByRole("button", { name: "Restarting…" })).toBeDisabled();
  });

  it("an accepted restart shows the 'accepted' line, never claiming the daemon is healthy", () => {
    render(
      <AssistantDaemonRestart useAssistantDaemonRestartHook={() => fakeController({ restartResult: { ok: true } })} />,
    );
    expect(screen.getByText(/Restart accepted\. This does not confirm the process is healthy yet/)).toBeInTheDocument();
    expect(screen.queryByText(/restarted successfully/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/is now healthy/i)).not.toBeInTheDocument();
  });

  it("a refused restart shows the server's own reason verbatim", () => {
    render(
      <AssistantDaemonRestart
        useAssistantDaemonRestartHook={() => fakeController({ restartResult: { ok: false, reason: "shutting down" } })}
      />,
    );
    expect(screen.getByText("Restart refused: shutting down")).toBeInTheDocument();
  });

  it("an unexpected restart error renders in the error slot, not the ordinary result line", () => {
    render(
      <AssistantDaemonRestart useAssistantDaemonRestartHook={() => fakeController({ restartError: "forbidden" })} />,
    );
    expect(screen.getByText("forbidden")).toBeInTheDocument();
    expect(screen.queryByText(/Restart accepted/)).not.toBeInTheDocument();
  });

  it("shows the known-failed status line distinctly from the no-failure line", () => {
    const { rerender } = render(
      <AssistantDaemonRestart useAssistantDaemonRestartHook={() => fakeController({ knownFailed: true })} />,
    );
    expect(screen.getByText("Known failed — the last attempt to start it did not succeed.")).toBeInTheDocument();

    rerender(<AssistantDaemonRestart useAssistantDaemonRestartHook={() => fakeController({ knownFailed: false })} />);
    expect(screen.getByText("No known failure right now.")).toBeInTheDocument();
  });
});

describe("AssistantDaemonRestart — user interaction", () => {
  it("pressing 'Restart assistant' calls the controller's restart()", async () => {
    const restart = vi.fn(async () => {});
    render(<AssistantDaemonRestart useAssistantDaemonRestartHook={() => fakeController({ restart })} />);

    await userEvent.click(screen.getByRole("button", { name: "Restart assistant" }));
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("pressing 'Check status' calls the controller's checkStatus()", async () => {
    const checkStatus = vi.fn(async () => {});
    render(<AssistantDaemonRestart useAssistantDaemonRestartHook={() => fakeController({ checkStatus })} />);

    await userEvent.click(screen.getByRole("button", { name: "Check status" }));
    expect(checkStatus).toHaveBeenCalledTimes(1);
  });
});

describe("assistantDaemonStatusMessage", () => {
  it("prioritizes statusError over every other state", () => {
    expect(
      assistantDaemonStatusMessage({ knownFailed: true, checkingStatus: true, statusError: "network down" }),
    ).toBe("network down");
  });

  it("shows the checking line only before the first result (knownFailed still null)", () => {
    expect(assistantDaemonStatusMessage({ knownFailed: null, checkingStatus: true, statusError: null })).toBe(
      "Checking status…",
    );
  });

  it("keeps showing the last known result during a RE-check (checkingStatus true, knownFailed already settled), instead of flashing back to 'Checking…'", () => {
    expect(assistantDaemonStatusMessage({ knownFailed: false, checkingStatus: true, statusError: null })).toBe(
      "No known failure right now.",
    );
  });

  it("returns null before the first check has even started (nothing loading, nothing known, no error)", () => {
    expect(assistantDaemonStatusMessage({ knownFailed: null, checkingStatus: false, statusError: null })).toBeNull();
  });
});
