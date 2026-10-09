import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Observability } from "../Observability";
import { createFakeRecentServerErrorsPort } from "../hooks/recent-server-errors-dependencies.hooks";
import type { ObservabilityStatusController } from "../hooks/use-observability-status.hooks";
import type { RecentServerErrorRow, RecentServerErrorsController } from "../hooks/use-recent-server-errors.hooks";

/** @file The Recent errors tab, driven through both hook seams — no fetch, no real port. */

const statusController: ObservabilityStatusController = { status: { enabled: false, serviceName: null }, error: null, t: (key: string) => key, locale: "en" };

function errorsController(overrides: Partial<RecentServerErrorsController> = {}): RecentServerErrorsController {
  return {
    rows: [],
    logs: { entries: [], matched: 0, buffered: 0, truncated: false, capturing: true },
    loading: false,
    error: null,
    refresh: () => {},
    clipboard: createFakeRecentServerErrorsPort(),
    t: (key: string) => key,
    ...overrides,
  };
}

function row(overrides: Partial<RecentServerErrorRow> = {}): RecentServerErrorRow {
  return {
    key: "server\u0000boom",
    when: "Oct 5, 2026, 12:00:01 PM",
    at: "2026-10-05T12:00:01.000Z",
    firstWhen: null,
    firstAt: null,
    source: "server",
    scope: null,
    summary: "boom",
    message: "boom",
    segments: [{ text: "boom" }],
    count: 1,
    copyText: "Time: 2026-10-05T12:00:01.000Z\nSource: server\nMessage:\nboom",
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
  it("lists one collapsed row per error, newest first, with time, source, tag, count and summary", async () => {
    const region = await openRecentErrors(errorsController({
      rows: [
        row({ key: "b", when: "Oct 5, 2026, 12:00:02 PM", at: "2026-10-05T12:00:02.000Z", source: "daemon", scope: "assistant", summary: "daemon unreachable — fetch failed", count: 3 }),
        row({ key: "a" }),
      ],
    }));
    const items = within(region).getAllByRole("listitem");
    const toggles = items.map((item) => within(item).getByRole("button", { expanded: false }));
    expect(toggles.map((toggle) => toggle.textContent)).toEqual([
      "Oct 5, 2026, 12:00:02 PMassistantassistant×3daemon unreachable — fetch failed",
      "Oct 5, 2026, 12:00:01 PMserverboom",
    ]);
    expect(within(items[0]).getByText("×3")).toHaveAttribute("title", "Times this error occurred: 3");
    expect(within(items[0]).getByText("Oct 5, 2026, 12:00:02 PM")).toHaveAttribute("dateTime", "2026-10-05T12:00:02.000Z");
    expect(within(region).queryByText("No errors recorded.")).not.toBeInTheDocument();
  });

  it("opens and closes the full message, with shortened paths carrying the full path", async () => {
    const fullPath = "/Users/me/Tovu/apps/website/src/a.ts:1:2";
    const region = await openRecentErrors(errorsController({
      rows: [row({
        firstWhen: "Oct 5, 2026, 11:00:00 AM",
        firstAt: "2026-10-05T11:00:00.000Z",
        count: 2,
        segments: [{ text: "boom\n    at f (" }, { text: "apps/website/src/a.ts:1:2", fullPath }, { text: ")" }],
      })],
    }));
    const toggle = within(region).getByRole("button", { expanded: false });
    const detail = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(detail).not.toBeVisible();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(detail).toBeVisible();
    expect(within(detail).getByText("apps/website/src/a.ts:1:2")).toHaveAttribute("title", fullPath);
    expect(within(detail).getByText("Oct 5, 2026, 11:00:00 AM")).toHaveAttribute("dateTime", "2026-10-05T11:00:00.000Z");
    expect(detail.querySelector("code")!.textContent).toBe("boom\n    at f (apps/website/src/a.ts:1:2)");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(detail).not.toBeVisible();
  });

  it("shows a placeholder summary for an empty message and no first-seen line for a single error", async () => {
    const region = await openRecentErrors(errorsController({ rows: [row({ summary: "", message: "", segments: [] })] }));
    const toggle = within(region).getByRole("button", { expanded: false });
    expect(toggle).toHaveTextContent("(empty message)");
    await userEvent.click(toggle);
    expect(within(region).queryByText(/First seen/)).not.toBeInTheDocument();
  });

  it("Copy puts the row's paste-ready text on the clipboard and says Copied", async () => {
    const clipboard = createFakeRecentServerErrorsPort();
    const region = await openRecentErrors(errorsController({ rows: [row()], clipboard }));
    const copy = within(region).getByRole("button", { name: "Copy" });
    expect(copy).toHaveAttribute("title", "Copy the time, source and full message, ready to paste.");

    await userEvent.click(copy);
    expect(clipboard.copied).toEqual(["Time: 2026-10-05T12:00:01.000Z\nSource: server\nMessage:\nboom"]);
    expect(await within(region).findByRole("button", { name: "Copied" })).toHaveAttribute("data-copied", "true");
    // Copy is its own button, not part of the disclosure: copying never opens the row.
    expect(within(region).getByRole("button", { expanded: false })).toBeInTheDocument();
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
