import userEvent from "@testing-library/user-event";
import { screenshotCleanupClient } from "../api/screenshot-cleanup-api";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RetentionPassResult } from "@jini-ai/platform/retention";

import type { StorageClient, StorageReport } from "@jini-ai/admin/screens/storage/api/storage-api";
import type { ScreenshotCleanupClient } from "@jini-ai/admin/screens/storage/api/screenshot-cleanup-api";
import { StorageScreen } from "@jini-ai/admin/screens/storage/StorageScreen";
import { useWiredStorage } from "@jini-ai/admin/screens/storage/hooks/use-storage.hooks";
import { useScreenshotCleanup } from "@jini-ai/admin/screens/storage/hooks/use-screenshot-cleanup.hooks";
import { render as renderWithKits } from "@/__tests__/render-with-jini-kits";
import { Storage } from "../Storage";
import { storageClient } from "../api/storage-api";

const AMOUNT = { bytes: 2048, knownBytes: 2048, files: 1 };

function report(): StorageReport {
  return {
    categories: {
      logs: { ...AMOUNT, class: "automatic" },
      uploads: { ...AMOUNT, class: "yours" },
      exports: { ...AMOUNT, class: "report-only" },
    },
    lastPass: null,
  };
}

function pass(dryRun: boolean): RetentionPassResult {
  return dryRun
    ? { status: "completed", dryRun, startedAt: 1, finishedAt: 2, policies: [{ id: "logs", kind: "old-copy", status: "measured", measurement: { bytes: 1024 } }] }
    : { status: "completed", dryRun, startedAt: 3, finishedAt: 4, policies: [{ id: "logs", kind: "old-copy", status: "swept", result: { freedBytes: 1024, removed: 1 } }] };
}

function harness() {
  const seen: { dryRun: boolean; listShown: boolean }[] = [];
  const client: StorageClient = {
    report: vi.fn(async () => report()),
    cleanup: vi.fn(async ({ dryRun }) => {
      seen.push({ dryRun, listShown: screen.queryByText(/Old copies/) !== null });
      return dryRun ? { ...pass(dryRun), previewToken: "grant-1" } : pass(dryRun);
    }),
  };
  const screenshotClient: ScreenshotCleanupClient = { preview: vi.fn(), apply: vi.fn() };
  render(<StorageScreen client={client} screenshotClient={screenshotClient} reportErrors={({ error }) => String(error)} now={() => 0} locale="en" setDocumentTitle={vi.fn(() => () => {})} useWiredStorageHook={useWiredStorage} useScreenshotCleanupHook={useScreenshotCleanup}
    kit={{ Button: "button" }}
    links={[{ label: "Chats", href: "/admin/ai-assistant", categories: ["chat-database"] }, { label: "Trash", href: "/admin/trash", categories: [] }]}
    copy={{ automatic: "Cleaned automatically", yours: "Yours", shown: "Shown only", dryRun: "Clean up now", confirm: "Review and confirm", clean: "Clean up", lastAutomaticPass: "Last automatic clean-up", freed: "Freed", failures: "Could not clean" }}
    t={({ key }) => key} categoryLabels={{ logs: "Logs", uploads: "Uploads", exports: "Exports" }} kindLabels={{ cache: "Cache", derived: "Rebuildable files", "old-copy": "Old copies" }}
    screenshotAgeDays={90} screenshotsAnchor="storage-screenshots" screenshotHeading="Delete screenshots older than 90 days" />);
  return { client, seen };
}

afterEach(() => { cleanup(); });

describe("StorageScreen", () => {
  it("Storage names its tab and distinguishes categories without repeating destinations", async () => {
    const previousTitle = document.title;
    document.title = "Previous page";
    const request = vi.spyOn(storageClient, "report").mockResolvedValue({
      categories: {
        "content-database": { ...AMOUNT, class: "yours" },
        screenshots: { ...AMOUNT, class: "yours" },
        "database-wal": { ...AMOUNT, class: "report-only" },
        "database-shm": { ...AMOUNT, class: "report-only" },
      },
      lastPass: null,
    });
    try {
      const view = renderWithKits(<Storage useAdminLocaleHook={() => "en"} />);
      for (const label of ["Content database", "Screenshots", "Database write-ahead log", "Database shared-memory files"]) {
        expect(await screen.findByText(`${label}: 2 kB`)).toBeTruthy();
      }
      expect(screen.queryByText(/Content database \(Database\)|Screenshots \(Screenshots\)/)).toBeNull();
      expect(screen.getByRole("link", { name: "Database" }).getAttribute("href")).toBe("/admin/database");
      expect(screen.getByRole("link", { name: "Screenshots" }).getAttribute("href")).toBe("#storage-screenshots");
      expect(document.title).toBe("Storage — Tovu Admin");
      view.unmount();
      expect(document.title).toBe("Previous page");
    } finally {
      cleanup();
      request.mockRestore();
      document.title = previousTitle;
    }
  });

  it("shows the page title and styles every section heading like its sibling screens (live-found bare headings, 2026-11-25)", async () => {
    harness();
    const title = screen.getByRole("heading", { level: 1, name: "Storage" });
    expect(title).toHaveClass("jini-page-title");
    expect(title.closest(".jini-page-header")).not.toBeNull();
    for (const name of ["Cleaned automatically", "Yours", "Shown only", "Delete screenshots older than 90 days"]) {
      expect(await screen.findByRole("heading", { level: 2, name })).toHaveClass("jini-card-title");
    }
  });

  it("three class labels", async () => {
    harness();
    const automatic = (await screen.findByRole("heading", { name: "Cleaned automatically" })).parentElement!;
    const yours = screen.getByRole("heading", { name: "Yours" }).parentElement!;
    const shown = screen.getByRole("heading", { name: "Shown only" }).parentElement!;
    expect(within(automatic).getByText(/Logs/)).toBeTruthy();
    expect(within(yours).getByText(/Uploads/)).toBeTruthy();
    expect(within(shown).getByText(/Exports: 2 kB/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Chats" }).getAttribute("href")).toBe("/admin/ai-assistant");
    expect(screen.getByRole("link", { name: "Trash" }).getAttribute("href")).toBe("/admin/trash");
  });

  it("dry-run list first", async () => {
    const { client, seen } = harness();
    // Found outside `act`: awaiting inside it would hold back the report's own state update.
    const cleanUpNow = await screen.findByRole("button", { name: "Clean up now" });
    await act(async () => { fireEvent.click(cleanUpNow); });
    expect(seen).toEqual([{ dryRun: true, listShown: false }]);
    expect(await screen.findByText(/Old copies: would free 1 kB/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clean up" })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Review and confirm" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Clean up" })); });
    // The live pass only ever runs the automatic kinds the owner was shown, and only after the list.
    // The confirm spends the single-use grant of the preview on screen (Codex FIX 5); without it the website refuses.
    expect(client.cleanup).toHaveBeenLastCalledWith({ dryRun: false, classes: ["old-copy"], previewToken: "grant-1" }, {});
    expect(client.cleanup).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([{ dryRun: true, listShown: false }, { dryRun: false, listShown: true }]);
    expect(await screen.findByText(/Freed: 1 kB/)).toBeTruthy();
  });
});

it("reports a failed storage read with safe copy and diagnostic class rather than the raw message", async () => {
  const read = vi.spyOn(storageClient, "report").mockRejectedValue(new TypeError("private-path=/srv/site"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    renderWithKits(<Storage useAdminLocaleHook={() => "en"} />);
    expect(await screen.findByText("The storage request could not finish. Try again.")).toBeVisible();
    expect(log).toHaveBeenCalledWith("Storage request failed", "TypeError");
    expect(document.body).not.toHaveTextContent("/srv/site");
  } finally {
    log.mockRestore();
    read.mockRestore();
  }
});

it("uses the browser clock for the 90-day screenshot preview cutoff without deleting", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 27));
  const read = vi.spyOn(storageClient, "report").mockResolvedValue(report());
  const preview = vi.spyOn(screenshotCleanupClient, "preview").mockResolvedValue({
    previewToken: "preview-9", deadline: Date.UTC(2026, 10, 28), count: 1, bytes: 30, items: ["2026-01-15/summary.jpg"],
  });
  const apply = vi.spyOn(screenshotCleanupClient, "apply").mockRejectedValue(new Error("must not apply a preview"));
  try {
    const user = userEvent.setup();
    renderWithKits(<Storage useAdminLocaleHook={() => "en"} />);
    await user.click(screen.getByRole("button", { name: "Show what would be deleted" }));
    expect(await screen.findByText("2026-01-15/summary.jpg")).toBeVisible();
    expect(preview).toHaveBeenCalledExactlyOnceWith({ before: Date.UTC(2026, 7, 29) });
    expect(apply).not.toHaveBeenCalled();
  } finally {
    apply.mockRestore();
    preview.mockRestore();
    read.mockRestore();
    now.mockRestore();
  }
});
