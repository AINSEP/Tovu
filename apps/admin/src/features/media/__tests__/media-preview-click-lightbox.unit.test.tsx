import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Media } from "../Media";
import { FetchQueryProvider } from "@jini-ai/ui/fetch-query";

/** Clicking a card's picture opens the shared lightbox at that item; prev/next cycle. */

function item(id: string, title: string, createdAt: string) {
  return {
    id, workspaceId: "workspace-local", title, slug: id, alt: `${title} alt`, caption: "", credit: "",
    sha256: id, contentType: "image/png", status: "active", createdAt, updatedAt: createdAt, version: 1,
    width: null, height: null, cssClass: null, htmlAttributes: null,
  };
}
const ITEMS = [
  item("m-a", "Alpha", "2026-07-03T00:00:00.000Z"),
  item("m-b", "Beta", "2026-07-02T00:00:00.000Z"),
  item("m-c", "Gamma", "2026-07-01T00:00:00.000Z"),
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = String(url).includes("/settings/effective") ? { data: [] } : { media: ITEMS };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("media preview click opens lightbox", () => {
  it("clicking the picture itself opens the lightbox at that item, and next/prev cycle", async () => {
    const user = userEvent.setup();
    render(<FetchQueryProvider><Media /></FetchQueryProvider>);
    await screen.findByText("Beta");
    const card = screen.getByText("Beta").closest(".media-card") as HTMLElement;

    await user.click(card.querySelector(".media-card-preview img")!);

    const dialog = document.querySelector("dialog.media-lightbox") as HTMLElement;
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: "Beta" })).toBeInTheDocument());
    await user.click(within(dialog).getByRole("button", { name: /next asset/i }));
    expect(within(dialog).getByRole("heading", { name: "Gamma" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /previous asset/i }));
    await user.click(within(dialog).getByRole("button", { name: /previous asset/i }));
    expect(within(dialog).getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
  });

  it("video cards: clicking the video does not open the lightbox; the corner button still does", async () => {
    const user = userEvent.setup();
    render(<FetchQueryProvider><Media /></FetchQueryProvider>);
    await screen.findByText("Beta");
    const card = screen.getByText("Beta").closest(".media-card") as HTMLElement;
    fireEvent.error(card.querySelector(".media-card-preview img")!);
    const video = await waitFor(() => {
      const v = card.querySelector(".media-card-preview video");
      expect(v).not.toBeNull();
      return v as HTMLElement;
    });
    expect(video.closest("button")).toBeNull();

    await user.click(video);
    expect(document.querySelector("dialog.media-lightbox")!.querySelector("h2")).toBeNull();

    await user.click(within(card).getByRole("button", { name: /view "beta" larger/i }));
    const dialog = document.querySelector("dialog.media-lightbox") as HTMLElement;
    expect(within(dialog).getByRole("heading", { name: "Beta" })).toBeInTheDocument();
  });
});
