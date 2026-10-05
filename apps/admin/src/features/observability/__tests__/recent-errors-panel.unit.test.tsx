import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Observability } from "../Observability";
import type { ObservabilityStatusController } from "../hooks/use-observability-status.hooks";
import type { RecentServerErrorsController } from "../hooks/use-recent-server-errors.hooks";

/** @file The Recent errors tab, driven through both hook seams — no fetch, no real port. */

const statusController: ObservabilityStatusController = { status: { enabled: false, serviceName: null }, error: null, t: (key: string) => key, locale: "en" };

function errorsController(overrides: Partial<RecentServerErrorsController> = {}): RecentServerErrorsController {
  return {
    rows: [],
    logs: { entries: [], matched: 0, buffered: 0, truncated: false, capturing: true },
    loading: false,
    error: null,
    refresh: () => {},
    t: (key: string) => key,
    ...overrides,
  };
}

async function openRecentErrors(controller: RecentServerErrorsController) {
  const useErrors = vi.fn(() => controller);
  render(<Observability useObservabilityStatusHook={() => statusController} useRecentServerErrorsHook={useErrors} />);
  expect(useErrors).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Recent errors" }));
  return screen.getByRole("region", { name: "Recent server errors" });
}

describe("Observability — Recent errors tab", () => {
  it("lists error rows newest first with time, source and the full message", async () => {
    const region = await openRecentErrors(errorsController({
      rows: [
        { key: "b", when: "Oct 5, 2026, 12:00:02 PM", source: "daemon", message: "newer\n  at stack" },
        { key: "a", when: "Oct 5, 2026, 12:00:01 PM", source: "server", message: "older" },
      ],
    }));
    const items = within(region).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Oct 5, 2026, 12:00:02 PMassistantnewer\n  at stack",
      "Oct 5, 2026, 12:00:01 PMserverolder",
    ]);
    expect(within(region).queryByText("No errors recorded.")).not.toBeInTheDocument();
  });

  it("says no errors were recorded when capture is on and the list is empty", async () => {
    const region = await openRecentErrors(errorsController());
    expect(within(region).getByText("No errors recorded.")).toBeInTheDocument();
  });

  it("says the log is not being recorded instead of claiming no errors", async () => {
    const region = await openRecentErrors(errorsController({ logs: { entries: [], matched: 0, buffered: 0, truncated: false, capturing: false } }));
    expect(within(region).getByRole("note")).toHaveTextContent("This server is not recording its log yet");
    expect(within(region).queryByText("No errors recorded.")).not.toBeInTheDocument();
  });

  it("shows loading, then an error alert, and Refresh calls the hook's refresh", async () => {
    const refresh = vi.fn();
    const region = await openRecentErrors(errorsController({ logs: null, loading: false, error: "failed to load recent server errors", refresh }));
    expect(within(region).getByRole("alert")).toHaveTextContent("failed to load recent server errors");
    await userEvent.click(within(region).getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("disables Refresh and shows a loading line during the first load", async () => {
    const region = await openRecentErrors(errorsController({ logs: null, loading: true }));
    expect(within(region).getByText("Loading recent errors…")).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Refresh" })).toBeDisabled();
  });

  it("notes truncation when more errors matched than were returned", async () => {
    const region = await openRecentErrors(errorsController({ logs: { entries: [], matched: 80, buffered: 2000, truncated: true, capturing: true } }));
    expect(within(region).getByText("Showing the newest 50 errors.")).toBeInTheDocument();
  });
});
