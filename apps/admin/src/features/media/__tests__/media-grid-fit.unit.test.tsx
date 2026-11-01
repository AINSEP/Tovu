import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Media } from "../Media";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";

/**
 * Owner report 2026-10-29 (todos.md "Media page grid for tall/long images and videos"): every tile
 * cropped to one landscape box, a vertical 1080×1920 video showed only its middle third with full
 * player controls inside the card, a tall wordmark read "REAT / ALLE", and a wide screen held only
 * two fixed 360px columns. These tests drive the real `Media` screen with the shapes from that report.
 */

function item(id: string, title: string, contentType: string) {
  return {
    id, workspaceId: "workspace-local", title, slug: id, alt: `${title} alt`, caption: "", credit: "",
    sha256: id, contentType, status: "active", createdAt: "2026-10-29T00:00:00.000Z",
    updatedAt: "2026-10-29T00:00:00.000Z", version: 1, width: null, height: null, cssClass: null, htmlAttributes: null,
  };
}
const ITEMS = [item("m-video", "GRV recap", "video/mp4"), item("m-long", "Poster", "image/png")];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = String(url).includes("/settings/effective") ? { data: [] } : { media: ITEMS };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function cardFor(name: string) {
  return (await screen.findByRole("button", { name })).closest(".media-card") as HTMLElement;
}

function setSize(el: Element, sizes: Record<string, number>) {
  for (const [key, value] of Object.entries(sizes)) Object.defineProperty(el, key, { configurable: true, value });
}

describe("media grid tiles fit the asset instead of cropping it", () => {
  it("a vertical video card is a still frame with a play cue, its shape and its duration — no player controls", async () => {
    const user = userEvent.setup();
    render(<FetchQueryProvider><Media /></FetchQueryProvider>);
    const card = await cardFor("GRV recap.mp4");
    fireEvent.error(card.querySelector(".media-card-preview img")!);
    const video = await waitFor(() => card.querySelector(".media-card-preview video") as HTMLVideoElement);
    setSize(video, { videoWidth: 1080, videoHeight: 1920, duration: 54.2 });
    fireEvent.loadedMetadata(video);

    expect(video.hasAttribute("controls")).toBe(false);
    expect(within(card).getByText("9:16 · 1080×1920")).toBeInTheDocument();
    expect(within(card).getByText("0:54")).toBeInTheDocument();

    // The still frame is the lightbox trigger now; the preview plays it at its real shape.
    await user.click(video);
    const dialog = document.querySelector("dialog.media-lightbox") as HTMLElement;
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: "GRV recap" })).toBeInTheDocument());
  });

  it("an image taller than 1:3 gets the long-image treatment and badge", async () => {
    render(<FetchQueryProvider><Media /></FetchQueryProvider>);
    const card = await cardFor("Poster.png");
    const img = card.querySelector(".media-card-preview img") as HTMLImageElement;
    setSize(img, { naturalWidth: 400, naturalHeight: 1600 });
    fireEvent.load(img);

    expect(img.classList.contains("media-card-media--long")).toBe(true);
    expect(within(card).getByText("Long image")).toBeInTheDocument();
    expect(within(card).getByText("400×1600")).toBeInTheDocument();
  });

  it("the card stylesheet fits (contain), never crops, and the columns stretch to fill the row", () => {
    const css = readFileSync(path.resolve(__dirname, "../../../styles/media.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = (selector: string) => css.match(new RegExp(`(?:^|})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*{([^}]*)}`))?.[1] ?? "";
    expect(rule(".media-card-media")).toMatch(/object-fit:\s*contain/);
    expect(rule(".media-grid")).toMatch(/grid-template-columns:[^;]*1fr\)/);
  });

  it("a landscape image fills the preview edge to edge; a tall one stays whole over a blurred copy", async () => {
    render(<FetchQueryProvider><Media /></FetchQueryProvider>);
    const card = await cardFor("Poster.png");
    const img = card.querySelector(".media-card-preview img") as HTMLImageElement;

    setSize(img, { naturalWidth: 1440, naturalHeight: 900 });
    fireEvent.load(img);
    expect(img.classList.contains("media-card-media--fill")).toBe(true);
    expect(card.querySelector(".media-card-backdrop")).toBeNull();

    setSize(img, { naturalWidth: 900, naturalHeight: 1440 });
    fireEvent.load(img);
    await waitFor(() => expect(img.classList.contains("media-card-media--fill")).toBe(false));
    expect(card.querySelector(".media-card-backdrop")).not.toBeNull();
  });

  it("the shape and length sit in the info section's second row, not on the picture", async () => {
    render(<FetchQueryProvider><Media /></FetchQueryProvider>);
    const card = await cardFor("Poster.png");
    const img = card.querySelector(".media-card-preview img") as HTMLImageElement;
    setSize(img, { naturalWidth: 1440, naturalHeight: 900 });
    fireEvent.load(img);
    const size = await within(card).findByText("1440×900");
    expect(size.closest(".media-card-body")).not.toBeNull();
    expect(card.querySelector(".media-card-preview")!.contains(size)).toBe(false);
  });
});
