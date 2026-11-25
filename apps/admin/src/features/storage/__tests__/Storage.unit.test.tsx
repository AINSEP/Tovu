import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RetentionPassResult } from "@jini-ai/platform/retention";

import type { StorageClient, StorageReport } from "../api/storage-api";
import type { ScreenshotCleanupClient } from "../api/screenshot-cleanup-api";
import { StorageScreen } from "../Storage";
import { useWiredStorage } from "../hooks/use-storage.hooks";
import { useScreenshotCleanup } from "../hooks/use-screenshot-cleanup.hooks";

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
  render(<StorageScreen client={client} screenshotClient={screenshotClient} reportErrors={({ error }) => String(error)} now={() => 0} locale="en" useWiredStorageHook={useWiredStorage} useScreenshotCleanupHook={useScreenshotCleanup} />);
  return { client, seen };
}

afterEach(() => { cleanup(); });

describe("StorageScreen", () => {
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
    expect(seen).toEqual([{ dryRun: true, listShown: false }, { dryRun: false, listShown: true }]);
    expect(await screen.findByText(/Freed: 1 kB/)).toBeTruthy();
  });
});
