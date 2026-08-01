import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Media } from "../Media";
import { api } from "../../lib/api";

/**
 * @file `Media` — MSG-05's preview-grid rewrite. Pins the two behaviors the dispatch called out as
 * load-bearing:
 *
 * 1. Content-type detection has no server signal to read (`AdminMedia` carries no MIME field), so
 *    `MediaPreview` falls back client-side: `<img>` → onError → `<video>` → onError → a
 *    non-previewable placeholder. Asserted end to end by firing synthetic `error` events (jsdom
 *    does not perform real resource fetches for `<img>`/`<video src>`, so there is nothing to mock
 *    at the network layer for the previews themselves — only `listMedia`/trash/purge/update go
 *    through the mocked `fetch`).
 * 2. The row-actions column moved from always-visible buttons into a `RowMenu` More menu per card,
 *    and permanent delete now gates through `ConfirmDialog` instead of `window.confirm` — trashing
 *    stays a single unconfirmed action, matching the original code's own trash-vs-purge asymmetry.
 *
 * Follows the RTL harness `Plugins.unit.test.tsx`/`Dashboard.unit.test.tsx` established for this
 * package (mocked global `fetch`, URL-routed rather than call-order-coupled, no server).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ACTIVE_ITEM = {
  id: "media-1",
  workspaceId: "workspace-local",
  title: "Sunset Photo",
  alt: "A sunset over the ocean",
  caption: "",
  credit: "",
  sha256: "abc123",
  status: "active",
  createdAt: "2026-07-01T09:00:00.000Z",
  updatedAt: "2026-07-01T09:00:00.000Z",
  version: 1,
};
const TRASHED_ITEM = {
  id: "media-2",
  workspaceId: "workspace-local",
  title: "Trashed Clip",
  alt: "",
  caption: "",
  credit: "",
  sha256: "def456",
  status: "trashed",
  createdAt: "2026-07-02T09:00:00.000Z",
  updatedAt: "2026-07-02T09:00:00.000Z",
  version: 1,
};
const MEDIA_RESPONSE = { media: [ACTIVE_ITEM, TRASHED_ITEM] };

/** Routes a mocked `fetch` call on method + a distinguishing URL substring — see
 *  `Dashboard.unit.test.tsx`'s identical helper for why (order/count-coupled mocks silently
 *  mis-assert the moment a call is added or reordered). */
function routeFetch(routes: Array<{ method?: string; match: string; handler: () => Promise<Response> }>) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const entry = routes.find((r) => url.includes(r.match) && (r.method ?? "GET") === method);
    if (!entry) return Promise.reject(new Error(`Media test: no mocked route for ${method} ${url}`));
    return entry.handler();
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function cardFor(container: HTMLElement, title: string): HTMLElement {
  const titleEl = Array.from(container.querySelectorAll(".media-card-title")).find((el) => el.textContent === title);
  if (!titleEl) throw new Error(`no card titled "${title}"`);
  const card = titleEl.closest(".media-card");
  if (!card) throw new Error(`card titled "${title}" has no .media-card ancestor`);
  return card as HTMLElement;
}

describe("page header", () => {
  it("uses the shared .page-header primitive with the Content kicker", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    render(<Media />);

    expect(await screen.findByRole("heading", { name: "Media" })).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});

describe("empty state", () => {
  it("renders a real .card/.empty-state instead of an empty grid", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse({ media: [] })) }]));
    render(<Media />);

    expect(await screen.findByText("No media uploaded yet.")).toBeInTheDocument();
  });
});

describe("preview fallback chain", () => {
  it("renders <img> first, using api.mediaOriginalUrl and a real alt", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = render(<Media />);

    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");
    const img = card.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", api.mediaOriginalUrl("media-1"));
    expect(img).toHaveAttribute("alt", "A sunset over the ocean");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("falls back from image alt text to the title when alt is blank", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = render(<Media />);

    const card = cardFor(await waitForCard(container, "Trashed Clip"), "Trashed Clip");
    const img = card.querySelector("img");
    expect(img).toHaveAttribute("alt", "Trashed Clip");
  });

  it("swaps to <video> (same src, controls, no autoplay) when the image probe fails", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = render(<Media />);

    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");
    const img = card.querySelector("img")!;
    fireEvent.error(img);

    await waitFor(() => {
      const video = card.querySelector("video");
      expect(video).toBeInTheDocument();
      expect(video).toHaveAttribute("src", api.mediaOriginalUrl("media-1"));
      expect(video).toHaveAttribute("controls");
      expect(video).not.toHaveAttribute("autoplay");
      expect(card.querySelector("img")).not.toBeInTheDocument();
    });
  });

  it("falls back to an informative placeholder — not a blank box — when both the image and video probes fail, and still offers the file via the same byte-route URL", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = render(<Media />);

    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");
    // Drives the FULL chain — image fails, confirm it actually became a <video> (not stuck
    // "loading"), THEN fail that too — rather than jumping straight to asserting the end state,
    // since a fallback chain whose middle link never fires would otherwise look identical to one
    // that works.
    fireEvent.error(card.querySelector("img")!);
    await waitFor(() => expect(card.querySelector("video")).toBeInTheDocument());
    fireEvent.error(card.querySelector("video")!);

    await waitFor(() => {
      expect(card.querySelector("video")).not.toBeInTheDocument();
      expect(card.querySelector("img")).not.toBeInTheDocument();
      expect(within(card).getByText("Preview not available")).toBeInTheDocument();
    });
    const downloadLink = within(card).getByRole("link", { name: /download original/i });
    expect(downloadLink).toHaveAttribute("href", api.mediaOriginalUrl("media-1"));
  });
});

describe("row actions via RowMenu", () => {
  it("an active item's menu offers Trash (not Delete permanently), and selecting it POSTs to .../trash with no confirm dialog", async () => {
    const user = userEvent.setup();
    let trashCalled = false;
    fetchMock.mockImplementation(
      routeFetch([
        { match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) },
        {
          match: "/media/media-1/trash",
          method: "POST",
          handler: () => {
            trashCalled = true;
            return Promise.resolve(jsonResponse({ media: { ...ACTIVE_ITEM, status: "trashed" } }));
          },
        },
      ])
    );
    const { container } = render(<Media />);
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");

    await user.click(within(card).getByRole("button", { name: /actions for "sunset photo"/i }));
    expect(screen.queryByRole("menuitem", { name: /delete permanently/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Trash" }));

    await waitFor(() => expect(trashCalled).toBe(true));
    // `ConfirmDialog` stays mounted unconditionally (its own doc comment explains why), so its
    // content is always in the DOM — the thing to assert is that it never *opened* for the
    // reversible trash step, i.e. the native `<dialog>` never gained the `open` attribute.
    const dialog = document.querySelector("dialog.confirm-dialog");
    expect(dialog?.hasAttribute("open")).toBe(false);
  });

  it("a trashed item's menu offers Delete permanently, which opens ConfirmDialog rather than deleting immediately", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = render(<Media />);
    const card = cardFor(await waitForCard(container, "Trashed Clip"), "Trashed Clip");

    await user.click(within(card).getByRole("button", { name: /actions for "trashed clip"/i }));
    expect(screen.queryByRole("menuitem", { name: "Trash" })).not.toBeInTheDocument();

    // `ConfirmDialog` is mounted unconditionally, so its title text exists in the DOM even while
    // closed (see the sibling "no confirm for trash" test) — the real signal that selecting this
    // item opened it is the native `<dialog>` gaining the `open` attribute.
    const dialog = document.querySelector("dialog.confirm-dialog")!;
    expect(dialog.hasAttribute("open")).toBe(false);
    await user.click(screen.getByRole("menuitem", { name: /delete permanently/i }));

    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));
    expect(screen.getByText(/permanently delete "trashed clip".*cannot be undone/i)).toBeInTheDocument();
  });

  it("confirming the purge dialog DELETEs the asset", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;
    fetchMock.mockImplementation(
      routeFetch([
        { match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) },
        {
          match: "/media/media-2",
          method: "DELETE",
          handler: () => {
            deleteCalled = true;
            return Promise.resolve(jsonResponse({ purged: true }));
          },
        },
      ])
    );
    const { container } = render(<Media />);
    const card = cardFor(await waitForCard(container, "Trashed Clip"), "Trashed Clip");

    await user.click(within(card).getByRole("button", { name: /actions for "trashed clip"/i }));
    await user.click(screen.getByRole("menuitem", { name: /delete permanently/i }));
    await screen.findByText("Delete permanently?");

    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(deleteCalled).toBe(true));
  });

  it("canceling the purge dialog sends no DELETE and closes the dialog", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = render(<Media />);
    const card = cardFor(await waitForCard(container, "Trashed Clip"), "Trashed Clip");

    await user.click(within(card).getByRole("button", { name: /actions for "trashed clip"/i }));
    await user.click(screen.getByRole("menuitem", { name: /delete permanently/i }));
    const dialog = document.querySelector("dialog.confirm-dialog")!;
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(dialog.hasAttribute("open")).toBe(false);
    const deleteCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "DELETE");
    expect(deleteCalls).toHaveLength(0);
  });
});

describe("metadata edit stays a partial patch", () => {
  it("editing only the alt field sends {alt: ...} and nothing else", async () => {
    const user = userEvent.setup();
    let patchBody: unknown = null;
    // `routeFetch`'s handlers don't receive `init`, so this one test reads `fetch`'s body directly
    // rather than through that helper — the point is asserting the exact PATCH payload, not routing.
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "PATCH" && url.includes("/media/media-1")) {
        patchBody = JSON.parse(String(init?.body));
        return Promise.resolve(jsonResponse({ media: ACTIVE_ITEM }));
      }
      if (url.includes("/media")) return Promise.resolve(jsonResponse(MEDIA_RESPONSE));
      return Promise.reject(new Error(`unexpected ${method} ${url}`));
    });

    const { container } = render(<Media />);
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");

    await user.click(within(card).getByRole("button", { name: /actions for "sunset photo"/i }));
    await user.click(screen.getByRole("menuitem", { name: /edit metadata/i }));

    const altInput = await screen.findByLabelText("Alt");
    await user.clear(altInput);
    await user.type(altInput, "Updated alt text");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchBody).toEqual({ alt: "Updated alt text" }));
  });
});

/** Waits for the grid to have finished its initial load (the card for `title` exists), then
 *  returns the container for `cardFor` to re-scope against. */
async function waitForCard(container: HTMLElement, title: string): Promise<HTMLElement> {
  await waitFor(() => {
    const found = Array.from(container.querySelectorAll(".media-card-title")).some((el) => el.textContent === title);
    expect(found).toBe(true);
  });
  return container;
}
