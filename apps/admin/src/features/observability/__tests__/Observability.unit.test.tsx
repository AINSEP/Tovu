import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Observability } from "../Observability";
import type { ObservabilityStatusController } from "../hooks/use-observability-status.hooks";
import type { AdminObservabilityStatus } from "@/lib/api";

/**
 * @file `Observability` driven entirely through the `useObservabilityStatusHook` DI seam — no
 * `fetch` stub, no real port. Mirrors `features/plugins/__tests__/AgentPlugins.unit.test.tsx`'s
 * split: the hook's own load behavior is covered by `use-observability-status.hooks.unit.test.ts`
 * against an injected `ObservabilityStatusPort`; this file covers what the component renders for a
 * given controller state.
 */

function fakeController(overrides: Partial<ObservabilityStatusController> = {}): ObservabilityStatusController {
  return {
    status: null,
    error: null,
    t: (key: string) => key,
    locale: "en",
    ...overrides,
  };
}

function renderObservability(overrides: Partial<ObservabilityStatusController> = {}) {
  function useFakeObservabilityStatus(): ObservabilityStatusController {
    return fakeController(overrides);
  }
  return render(<Observability useObservabilityStatusHook={useFakeObservabilityStatus} />);
}

describe("Observability — Overview tab", () => {
  it("renders Overview as the first tab, explaining OpenTelemetry and a provider in plain language", () => {
    renderObservability();

    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Providers" })).toBeInTheDocument();
    expect(screen.getByText(/OpenTelemetry is the open standard Tovu uses/)).toBeInTheDocument();
    expect(screen.getByText(/A "provider" is that monitoring tool/)).toBeInTheDocument();
  });

  it("shows a loading state before the status read settles", () => {
    renderObservability({ status: null, error: null });
    expect(screen.getByText("Checking current status…")).toBeInTheDocument();
  });

  it("reports OFF/noop when the injected status says disabled", () => {
    const disabled: AdminObservabilityStatus = { enabled: false, serviceName: null };
    renderObservability({ status: disabled });

    expect(screen.getByText("OpenTelemetry is OFF (the default) — nothing is being recorded.")).toBeInTheDocument();
    expect(screen.getByText(/Tovu is running its safe, no-op default/)).toBeInTheDocument();
  });

  it("reports ON, with the service name, when the injected status says enabled", () => {
    const enabled: AdminObservabilityStatus = { enabled: true, serviceName: "tovu" };
    renderObservability({ status: enabled });

    expect(screen.getByText("OpenTelemetry is ON — traces are being recorded.")).toBeInTheDocument();
    expect(screen.getByText('Reporting under the service name "tovu".')).toBeInTheDocument();
  });

  it("surfaces a load failure as an alert, distinct from the loading/empty states", () => {
    renderObservability({ status: null, error: "could not reach the server" });

    expect(screen.getByRole("alert")).toHaveTextContent("could not reach the server");
    expect(screen.queryByText("Checking current status…")).not.toBeInTheDocument();
  });

  it("marks the status card with an --on modifier when enabled and --off when disabled", () => {
    const { container, unmount } = renderObservability({ status: { enabled: true, serviceName: "tovu" } });
    expect(container.querySelector(".observability-status-card--on")).not.toBeNull();
    expect(container.querySelector(".observability-status-card--off")).toBeNull();
    unmount();

    const off = renderObservability({ status: { enabled: false, serviceName: null } });
    expect(off.container.querySelector(".observability-status-card--off")).not.toBeNull();
    expect(off.container.querySelector(".observability-status-card--on")).toBeNull();
  });

  it("renders no status card and no loading copy while only an error is present", () => {
    const { container } = renderObservability({ status: null, error: "boom" });
    expect(container.querySelector(".observability-status-card")).toBeNull();
    expect(screen.queryByText("Checking current status…")).not.toBeInTheDocument();
  });

  it("shows both the alert and the status card, and no loading copy, when an error and a status coexist", () => {
    const { container } = renderObservability({ status: { enabled: false, serviceName: null }, error: "stale" });
    expect(screen.getByRole("alert")).toHaveTextContent("stale");
    expect(container.querySelector(".observability-status-card--off")).not.toBeNull();
    expect(screen.queryByText("Checking current status…")).not.toBeInTheDocument();
  });
});

describe("Observability — Providers tab", () => {
  it("renders a static not-built-yet state with no functional inputs", async () => {
    renderObservability({ status: { enabled: false, serviceName: null } });

    await userEvent.click(screen.getByRole("button", { name: "Providers" }));

    expect(screen.getByText("No provider connected yet")).toBeInTheDocument();
    expect(screen.getByText(/Datadog and Grafana are planned/)).toBeInTheDocument();
    // No connection form of any kind: no text inputs, and no button offering to save/connect
    // anything — only the two tab-switch buttons this screen always renders.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const buttonNames = screen.getAllByRole("button").map((button) => button.textContent);
    expect(buttonNames).toEqual(expect.arrayContaining(["Overview", "Providers"]));
    for (const name of buttonNames) {
      expect(name).not.toMatch(/connect|save|configure/i);
    }
  });
});
