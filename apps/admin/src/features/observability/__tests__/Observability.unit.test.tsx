import { render, screen } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
  return render(<Observability useObservabilityStatusHook={useFakeObservabilityStatus} useQueriesTabHook={() => ({ visible: false, readOnly: true })} />);
}

it("shows delivery evidence and an authorized diagnostic button without claiming remote success", async () => {
  let sent = 0;
  renderObservability({ status: { enabled: true, serviceName: "tovu", canSendTestError: true, providers: [{
    providerId: "trace", lastExport: { phase: "export", outcome: "failed", host: "collector.test", at: "2026-10-26T01:00:00.000Z", errorClass: "Error", statusCode: 401 }, lastShutdown: null,
  }] }, sendTestError: async () => { sent++; }, testResult: { providers: [{ providerId: "errors", signals: ["error"] }] } });
  expect(screen.getByText("Last export failed")).toBeInTheDocument();
  expect(screen.getByText("2026-10-26T01:00:00.000Z")).toHaveAttribute("dateTime", "2026-10-26T01:00:00.000Z");
  expect(screen.getByText(/Remote delivery is confirmed by export status and your provider/)).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Send test error" }));
  expect(sent).toBe(1);
});

it("hides the diagnostic button from read-only admins", () => {
  renderObservability({ status: { enabled: true, serviceName: "tovu", canSendTestError: false }, sendTestError: async () => {} });
  expect(screen.queryByRole("button", { name: "Send test error" })).not.toBeInTheDocument();
});

describe("Observability — Overview tab", () => {
  it("renders Overview as the first tab, explaining OpenTelemetry and a provider in plain language", () => {
    renderObservability();

    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Providers" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")
      .filter((button) => button.textContent === "Overview" || button.textContent === "Providers")
      .map((button) => button.textContent)).toEqual(["Overview", "Providers"]);
    expect(screen.getByRole("region", { name: "Observability Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Observability Providers" })).not.toBeInTheDocument();
    expect(screen.getByText(/OpenTelemetry is the open standard Tovu uses/)).toBeInTheDocument();
    expect(screen.getByText(/A "provider" is that monitoring tool/)).toBeInTheDocument();
  });

  it("renders its own page-header — same markup as Secrets/AiAssistant — instead of relying only on the shell's own head strip", () => {
    const { container } = renderObservability();

    const header = container.querySelector(".page-header");
    expect(header).not.toBeNull();
    expect(header?.querySelector(".page-kicker")?.textContent).toBe("Operations");
    const title = header?.querySelector(".page-title");
    expect(title?.tagName).toBe("H1");
    expect(title?.textContent).toBe("Observability");
    expect(title?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(header?.querySelector(".page-description")).not.toBeNull();
    // The shell root still opts into `settings-ui-section--page-flow` (styles.css), whose
    // `.jini-tabbed-dialog-head { display: none }` is what actually retires the shell's own
    // duplicate kicker/title/subtitle strip at render time — `vitest.config.ts` runs with
    // `css: false`, so that CSS-only hiding can't be asserted from jsdom here (its DOM node still
    // renders, just invisibly); the Playwright pass over this same fix is what proves it visually.
    expect(container.querySelector(".settings-ui-section--page-flow")).not.toBeNull();
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
    expect(screen.getByRole("status")).toHaveClass("observability-status-card--on");
    expect(screen.getByRole("status")).toHaveTextContent("OpenTelemetry is ON — traces are being recorded.");
    unmount();

    const off = renderObservability({ status: { enabled: false, serviceName: null } });
    expect(off.container.querySelector(".observability-status-card--off")).not.toBeNull();
    expect(off.container.querySelector(".observability-status-card--on")).toBeNull();
    expect(screen.getByRole("status")).toHaveClass("observability-status-card--off");
    expect(screen.getByRole("status")).toHaveTextContent("OpenTelemetry is OFF (the default) — nothing is being recorded.");
  });

  it("opens the OpenTelemetry documentation in a new tab without sending a referrer", () => {
    renderObservability();
    const link = screen.getByRole("link", { name: "Read the OpenTelemetry documentation" });
    expect(link).toHaveAttribute("href", "https://opentelemetry.io/docs/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
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
    expect(screen.getByText(/Monitoring integrations are planned/)).toBeInTheDocument();
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

it("A7: selecting Tool gaps fetches the owner projection and renders the redacted Bash entry", async () => {
  const requests: string[] = [];
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/system/tool-gaps");
    requests.push(url);
    return new Response(JSON.stringify({ entries: [{
      id: "bash-gap", at: "2026-10-17T00:00:00Z", site: "site-a", chatId: "chat-a", runId: "run-a",
      provider: "claude", toolUsed: "Bash", summary: "curl password=[REDACTED:labeled_secret]",
      type: "tool_gap", gapLine: "Tool gap: download — no Tovu tool for it.",
    }] }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const view = renderObservability();
  try {
    expect(requests).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Tool gaps" }));
    expect(await screen.findByText("curl password=[REDACTED:labeled_secret]")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tool gaps" })).toHaveTextContent("claude · Bash");
    expect(screen.getByText("Tool gap: download — no Tovu tool for it.")).toBeInTheDocument();
    expect(screen.getByText(/site-a · Chat: chat-a/)).toBeInTheDocument();
    expect(requests).toEqual(["/api/admin/v1/workspaces/workspace-local/system/tool-gaps"]);
  } finally {
    view.unmount();
    fetch.mockRestore();
  }
});
