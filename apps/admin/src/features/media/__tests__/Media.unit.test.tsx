import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Media } from "../Media";
import { api } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";

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
  slug: "sunset-photo",
  alt: "A sunset over the ocean",
  caption: "",
  credit: "",
  sha256: "abc123",
  contentType: "image/png",
  status: "active",
  // Newer than TRASHED_ITEM below (2026-09-11 media-order-by dispatch: the grid now defaults to
  // "Created" newest-first client-side too — `sortMediaByOrder`, `rules.ts`), so this item still
  // lands at grid index 0 the way this file's lightbox nav tests below assume — swapped alongside
  // TRASHED_ITEM's own timestamp rather than rewriting those tests' index-based assertions.
  createdAt: "2026-07-02T09:00:00.000Z",
  updatedAt: "2026-07-02T09:00:00.000Z",
  version: 1,
  width: null,
  height: null,
  cssClass: null,
  htmlAttributes: null,
};
const TRASHED_ITEM = {
  id: "media-2",
  workspaceId: "workspace-local",
  title: "Trashed Clip",
  slug: "trashed-clip",
  alt: "",
  caption: "",
  credit: "",
  sha256: "def456",
  contentType: "video/mp4",
  status: "trashed",
  createdAt: "2026-07-01T09:00:00.000Z",
  updatedAt: "2026-07-01T09:00:00.000Z",
  version: 1,
  width: null,
  height: null,
  cssClass: null,
  htmlAttributes: null,
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

/** Wraps every render in `FetchQueryProvider` (2026-08-12, `lib/fetch-query` migration) — `Media`'s
 *  hooks are now backed by `useFetchQuery`/`useFetchMutation`, which throw without a
 *  `QueryClientProvider` ancestor. `main.tsx` provides this in production; here it is one
 *  `FetchQueryProvider` per render, matching `taxonomy`'s own component-test precedent.
 *
 *  Takes `Media`'s own props (defaulted to `{}`) so a test can override an injectable seam —
 *  e.g. `useMediaTabsHook` below — without every other existing call site needing to change. */
function renderScreen(props: React.ComponentProps<typeof Media> = {}) {
  return render(
    <FetchQueryProvider>
      <Media {...props} />
    </FetchQueryProvider>
  );
}

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useMedia`/`useEditMediaPanel` now also call `useAdminLocale()` (real `fetch`, not this
  // screen's own concern), which would otherwise consume one of this file's strictly-ordered
  // `mockResolvedValueOnce` slots and shift every later assertion by one call. Routed to a fixed
  // default-locale response outside `fetchMock`'s own call queue — same interceptor pattern
  // `Members.unit.test.tsx` uses.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    return fetchMock(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  // `setActiveTab` drives real `history.replaceState` via `lib/router`'s `navigate()` — reset
  // between tests so one test's tab click can't leak a `?tab=` into the next (same convention
  // `Deployment.unit.test.tsx`/`SettingsUi.unit.test.tsx` document for the identical reason).
  window.history.replaceState(null, "", "/");
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
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Media" })).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("renders the section's own Publish media button (plan-publish-sections-2026-09-25.md §2 S3)", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    renderScreen();

    expect(await screen.findByRole("button", { name: "Publish media" })).toBeInTheDocument();
  });
});

describe("upload toolbar accessible names (regression: agent-driveability audit)", () => {
  // Both fields need names beyond this file's own `agentHandle(..., { label })`: a
  // `data-agent-label` attribute is invisible to a real screen reader or a generic browser agent.
  it("the file picker has a real accessible name, not just an agentHandle label", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    renderScreen();

    await screen.findByRole("heading", { name: "Media" });
    // `getByLabelText` (not `getByRole`): this jsdom/aria-query stack computes no ARIA role at all
    // for a bare `<input type="file">` (verified — it shows up under none of `getByRole`'s listed
    // groups), even though real browsers expose one. `getByLabelText` still resolves its `aria-label`
    // directly, which is what actually matters here: a real accessible name, reachable by a query
    // that only succeeds via a genuine label mechanism (never by reading the attribute string off
    // the markup).
    expect(screen.getByLabelText("File to upload")).toBeInTheDocument();
  });

  it("replaces browser chooser copy with the localized chooser and selected-file status", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    renderScreen();

    await screen.findByRole("heading", { name: "Media" });
    expect(screen.getByText("No file chosen")).toBeInTheDocument();
    expect(screen.getByText("Choose file")).toHaveAttribute("for", screen.getByLabelText("File to upload").id);

    fireEvent.change(screen.getByLabelText("File to upload"), {
      target: { files: [new File(["image"], "sunset.png", { type: "image/png" })] },
    });

    expect(screen.getByText("sunset.png")).toBeInTheDocument();
  });

  it("the alt-text field has a real accessible name beyond its placeholder", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    renderScreen();

    await screen.findByRole("heading", { name: "Media" });
    expect(screen.getByRole("textbox", { name: "Alt text (optional)" })).toBeInTheDocument();
  });

  // 2026-09-07 (Agent H, following up on Agent F's flag): this `accept` list is a hand-copied
  // literal, same "kept in sync manually with the server list" pattern as
  // `FILE_HANDLER_ALLOWED_MIME_TYPES` (`apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts`)
  // and `IMPORTABLE_CONTENT_TYPES` (`apps/website/src/features/media-import/fetch-image.ts`) — it had
  // drifted the same way theirs had: `video/mp4`/`video/webm` were added to the server's real ceiling
  // (`DEFAULT_ALLOWED_MIME_TYPES`, `@jini-ai/cms/media`'s `media-service.ts`) 2026-08-24 but never
  // mirrored into this upload `<input>`'s `accept` attribute or its handle label. Pinned here to the
  // exact 7-type set so a future server-side addition fails this test instead of silently drifting
  // again.
  it("the file picker's accept list matches the server's real upload ceiling (all 7 DEFAULT_ALLOWED_MIME_TYPES, not just images)", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    renderScreen();

    await screen.findByRole("heading", { name: "Media" });
    const fileInput = screen.getByLabelText("File to upload");
    const accepted = new Set((fileInput.getAttribute("accept") ?? "").split(",").filter(Boolean));
    expect(accepted).toEqual(
      new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "video/mp4", "video/webm"])
    );
  });
});

describe("empty state", () => {
  it("renders a real .card/.empty-state instead of an empty grid", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse({ media: [] })) }]));
    renderScreen();

    expect(await screen.findByText("No media uploaded yet.")).toBeInTheDocument();
  });
});

describe("preview fallback chain", () => {
  it("renders <img> first, using api.mediaOriginalUrl and a real alt", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = renderScreen();

    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");
    const img = card.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", api.mediaOriginalUrl("media-1"));
    expect(img).toHaveAttribute("alt", "A sunset over the ocean");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("falls back from image alt text to the title when alt is blank", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = renderScreen();

    const card = cardFor(await waitForCard(container, "Trashed Clip"), "Trashed Clip");
    const img = card.querySelector("img");
    expect(img).toHaveAttribute("alt", "Trashed Clip");
  });

  it("swaps to <video> (same src, controls, no autoplay) when the image probe fails", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = renderScreen();

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
    const { container } = renderScreen();

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

/**
 * `MediaLightbox` — a single shared `<dialog>` for the whole grid (see that component's own doc
 * comment in `Media.tsx`), opened per card via `MediaPreview`'s corner "view larger" trigger.
 * Because it is ONE instance rather than one per card, the collision `ConfirmDialog`'s own test
 * suite pins (two *simultaneously mounted* dialogs both reachable via `getElementById`, see
 * `ConfirmDialog.unit.test.tsx`'s "multiple instances" describe block) cannot occur here the same
 * way — there is only ever one `<dialog class="media-lightbox">` in the DOM. The equivalent risk
 * for a shared instance is temporal, not simultaneous: opening item B after item A must actually
 * re-target the label, not leave `aria-labelledby` resolving to a stale heading. The "single shared
 * instance" describe block below is this suite's version of that regression pin.
 */
describe("lightbox", () => {
  it("opens via the expand trigger, and aria-labelledby resolves to a heading with the item's own title", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = renderScreen();
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");

    const dialog = document.querySelector("dialog.media-lightbox")!;
    expect(dialog.hasAttribute("open")).toBe(false);

    await user.click(within(card).getByRole("button", { name: /view "sunset photo" larger/i }));

    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));
    const labelledbyId = dialog.getAttribute("aria-labelledby")!;
    expect(labelledbyId).not.toBe("");
    expect(document.getElementById(labelledbyId)).toBe(
      within(dialog as HTMLElement).getByRole("heading", { name: "Sunset Photo" })
    );
  });

  it("renders the SAME MediaPreview fallback chain as the grid card (same src, same image-to-video fallback), not a reimplementation", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = renderScreen();
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");
    await user.click(within(card).getByRole("button", { name: /view "sunset photo" larger/i }));

    const dialog = document.querySelector("dialog.media-lightbox")! as HTMLElement;
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));

    const lightboxImg = dialog.querySelector(".media-lightbox-media img")!;
    expect(lightboxImg).toHaveAttribute("src", api.mediaOriginalUrl("media-1"));

    fireEvent.error(lightboxImg);
    await waitFor(() => {
      expect(dialog.querySelector(".media-lightbox-media video")).toHaveAttribute(
        "src",
        api.mediaOriginalUrl("media-1")
      );
    });
  });

  /**
   * Regression: the lightbox is ONE shared `MediaPreview` instance at a fixed tree position, and
   * `useMediaPreview`'s `stage` is component state with no reset-on-`item` effect. Without a
   * changing `key`, navigating from an asset that fell through to `"unsupported"` to a perfectly
   * good image kept the placeholder — the previous asset's fallback verdict applied to the next
   * one. Grid cards never showed this because each card owns its own instance.
   */
  it("resets the image/video/placeholder fallback chain when navigating to the next asset, instead of carrying the previous asset's verdict across", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = renderScreen();
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");
    await user.click(within(card).getByRole("button", { name: /view "sunset photo" larger/i }));

    const dialog = document.querySelector("dialog.media-lightbox")! as HTMLElement;
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));

    // Drive asset 1 all the way down the chain: image fails, then video fails.
    fireEvent.error(dialog.querySelector(".media-lightbox-media img")!);
    await waitFor(() => expect(dialog.querySelector(".media-lightbox-media video")).not.toBeNull());
    fireEvent.error(dialog.querySelector(".media-lightbox-media video")!);
    await waitFor(() => expect(dialog.querySelector(".media-lightbox-media .media-card-placeholder")).not.toBeNull());

    fireEvent.keyDown(dialog, { key: "ArrowRight" });

    await waitFor(() => {
      expect(dialog.querySelector(".media-lightbox-media img")).toHaveAttribute("src", api.mediaOriginalUrl("media-2"));
    });
    expect(dialog.querySelector(".media-lightbox-media .media-card-placeholder")).toBeNull();
  });

  it("the native cancel event (what a real browser fires on Escape) closes the dialog and returns focus to the card's expand trigger", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = renderScreen();
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");
    const expandButton = within(card).getByRole("button", { name: /view "sunset photo" larger/i });

    await user.click(expandButton);
    const dialog = document.querySelector("dialog.media-lightbox")!;
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));

    fireEvent(dialog, new Event("cancel", { cancelable: true }));

    expect(dialog.hasAttribute("open")).toBe(false);
    expect(expandButton).toHaveFocus();
  });

  it("calls onCancel-equivalent (closes) when the click lands on the dialog element itself (the backdrop area), not on dialog content", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = renderScreen();
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");
    await user.click(within(card).getByRole("button", { name: /view "sunset photo" larger/i }));

    const dialog = document.querySelector("dialog.media-lightbox")!;
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));

    fireEvent.click(within(dialog as HTMLElement).getByRole("heading", { name: "Sunset Photo" }));
    expect(dialog.hasAttribute("open")).toBe(true);

    fireEvent.click(dialog);
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("ArrowRight/ArrowLeft navigate between assets and update the counter, clamping at the last item rather than wrapping", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = renderScreen();
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");
    await user.click(within(card).getByRole("button", { name: /view "sunset photo" larger/i }));

    const dialog = document.querySelector("dialog.media-lightbox")! as HTMLElement;
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));
    expect(within(dialog).getByText("1 / 2")).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(within(dialog).getByRole("heading", { name: "Trashed Clip" })).toBeInTheDocument();
    expect(within(dialog).getByText("2 / 2")).toBeInTheDocument();

    // Past the last item: stays put rather than wrapping to the first.
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(within(dialog).getByRole("heading", { name: "Trashed Clip" })).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(within(dialog).getByRole("heading", { name: "Sunset Photo" })).toBeInTheDocument();
  });

  it("omits the expand trigger once an asset resolves as unsupported — nothing larger to show than the existing placeholder", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const { container } = renderScreen();
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");

    fireEvent.error(card.querySelector("img")!);
    await waitFor(() => expect(card.querySelector("video")).toBeInTheDocument());
    fireEvent.error(card.querySelector("video")!);
    await waitFor(() => expect(within(card).getByText("Preview not available")).toBeInTheDocument());

    expect(within(card).queryByRole("button", { name: /view .* larger/i })).not.toBeInTheDocument();
  });

  /**
   * Regression pin for the shared-instance design: proves the grid mounts exactly ONE
   * `.media-lightbox` dialog for multiple cards (not one per card), and that re-opening it for a
   * DIFFERENT item correctly re-targets `aria-labelledby` to that item's own heading rather than
   * leaving it resolved to whichever item opened the dialog first. See this file's own header
   * comment above for why this is the shared-instance analogue of `ConfirmDialog`'s
   * simultaneous-instances regression test.
   */
  describe("single shared instance (not one dialog per card)", () => {
    it("mounts exactly one .media-lightbox for a multi-card grid, and re-targets its label when a different card's trigger opens it", async () => {
      const user = userEvent.setup();
      fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
      const { container } = renderScreen();
      await waitForCard(container, "Sunset Photo");
      await waitForCard(container, "Trashed Clip");

      expect(document.querySelectorAll("dialog.media-lightbox")).toHaveLength(1);

      const card1 = cardFor(container, "Sunset Photo");
      await user.click(within(card1).getByRole("button", { name: /view "sunset photo" larger/i }));
      const dialog = document.querySelector("dialog.media-lightbox")!;
      await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));
      expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)).toHaveTextContent("Sunset Photo");

      fireEvent(dialog, new Event("cancel", { cancelable: true }));
      await waitFor(() => expect(dialog.hasAttribute("open")).toBe(false));

      const card2 = cardFor(container, "Trashed Clip");
      await user.click(within(card2).getByRole("button", { name: /view "trashed clip" larger/i }));
      await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));

      expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)).toHaveTextContent("Trashed Clip");
      expect(document.querySelectorAll("dialog.media-lightbox")).toHaveLength(1);
    });
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
    const { container } = renderScreen();
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
    const { container } = renderScreen();
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
    const { container } = renderScreen();
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
    const { container } = renderScreen();
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

    const { container } = renderScreen();
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");

    await user.click(within(card).getByRole("button", { name: /actions for "sunset photo"/i }));
    await user.click(screen.getByRole("menuitem", { name: /edit metadata/i }));

    const altInput = await screen.findByLabelText("Alt");
    await user.clear(altInput);
    await user.type(altInput, "Updated alt text");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchBody).toEqual({ alt: "Updated alt text" }));
  });

  it("setting width/height sends {width, height} as numbers; leaving them blank sends nothing (native size)", async () => {
    const user = userEvent.setup();
    let patchBody: unknown = null;
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

    const { container } = renderScreen();
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");

    await user.click(within(card).getByRole("button", { name: /actions for "sunset photo"/i }));
    await user.click(screen.getByRole("menuitem", { name: /edit metadata/i }));

    const widthInput = await screen.findByLabelText("Width (px)");
    const heightInput = await screen.findByLabelText("Height (px)");
    // Both start blank (ACTIVE_ITEM.width/height are `null`, the "native size" default).
    expect(widthInput).toHaveValue(null);
    expect(heightInput).toHaveValue(null);

    await user.type(widthInput, "800");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchBody).toEqual({ width: 800 }));
  });
});

/**
 * Regression pin for the 2026-08-12 audit round 2 blocker F1 (domain 4 — writing to the wrong
 * record): `<EditMediaPanel>` used to render with no `key`, so switching the edit target from item
 * A directly to item B (`toggleEditing`'s `A id -> B id` transition — see `use-media.hooks.ts`'s
 * `toggleEditing`, which only passes through `null` when re-clicking the SAME row) re-rendered the
 * SAME component instance instead of remounting it. `useEditMediaPanel` seeds `draft` inside a
 * `useState` initializer, which React runs once per mount and never again — so `draft` stayed bound
 * to A's (possibly edited, unsaved) values while `item` became B, and `save()` PATCHed B's id with
 * A's stale field values. Two ordinary clicks, no race, no adversarial input.
 *
 * Fixed by `key={editingItem.id}` on `<EditMediaPanel>` in `Media.tsx`, forcing a remount (and a
 * fresh `useState` seed from the NEW item) whenever the edit target's id changes.
 */
describe("switching edit target between items (regression: stale draft overwrite, audit F1)", () => {
  const ITEM_ALPHA = {
    id: "media-alpha",
    workspaceId: "workspace-local",
    title: "Alpha Original Title",
    slug: "alpha-original-title",
    alt: "Alpha Alt",
    caption: "Alpha Caption",
    credit: "Alpha Credit",
    sha256: "alpha-sha",
    status: "active",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
  };
  const ITEM_BETA = {
    id: "media-beta",
    workspaceId: "workspace-local",
    title: "Beta Original Title",
    slug: "beta-original-title",
    alt: "Beta Alt",
    caption: "Beta Caption",
    credit: "Beta Credit",
    sha256: "beta-sha",
    status: "active",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
  };
  const TWO_ITEM_RESPONSE = { media: [ITEM_ALPHA, ITEM_BETA] };

  it("shows B's own values (not A's stale draft) after an unsaved A->B switch, and PATCHes only what was actually changed on B", async () => {
    const user = userEvent.setup();
    let patchedUrl: string | null = null;
    let patchBody: unknown = null;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "PATCH") {
        patchedUrl = url;
        patchBody = JSON.parse(String(init?.body));
        return Promise.resolve(jsonResponse({ media: ITEM_BETA }));
      }
      if (url.includes("/media")) return Promise.resolve(jsonResponse(TWO_ITEM_RESPONSE));
      return Promise.reject(new Error(`unexpected ${method} ${url}`));
    });

    const { container } = renderScreen();
    const cardAlpha = cardFor(await waitForCard(container, "Alpha Original Title"), "Alpha Original Title");

    // Open A's edit panel and change its title — WITHOUT saving. This is the divergence that makes
    // a stale draft distinguishable from a fresh one.
    await user.click(within(cardAlpha).getByRole("button", { name: /actions for "alpha original title"/i }));
    await user.click(screen.getByRole("menuitem", { name: /edit metadata/i }));
    const titleInputA = await screen.findByLabelText("Title");
    expect(titleInputA).toHaveValue("Alpha Original Title");
    await user.clear(titleInputA);
    await user.type(titleInputA, "Changed Alpha Title");

    // Switch the edit target DIRECTLY to B through the row menu's "Edit metadata" action (the same
    // `toggleEditing` path the UI drives) — A's panel is never closed/saved first, so this is the
    // A-id -> B-id transition `toggleEditing` takes without ever passing through `null`.
    const cardBeta = cardFor(container, "Beta Original Title");
    await user.click(within(cardBeta).getByRole("button", { name: /actions for "beta original title"/i }));
    await user.click(screen.getByRole("menuitem", { name: /edit metadata/i }));

    // The panel must now be editing B, seeded from B's OWN values — not A's stale/changed draft.
    expect(await screen.findByRole("heading", { name: /editing "beta original title"/i })).toBeInTheDocument();
    const titleInputB = screen.getByLabelText("Title");
    await waitFor(() => expect(titleInputB).toHaveValue("Beta Original Title"));
    expect(screen.getByLabelText("Alt")).toHaveValue("Beta Alt");
    expect(screen.getByLabelText("Caption")).toHaveValue("Beta Caption");
    expect(screen.getByLabelText("Credit")).toHaveValue("Beta Credit");

    // Change ONE field on B (a different field than the one changed on A) and save.
    const creditInputB = screen.getByLabelText("Credit");
    await user.clear(creditInputB);
    await user.type(creditInputB, "Changed Beta Credit");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchBody).not.toBeNull());
    expect(patchedUrl).toContain("/media/media-beta");
    // The whole point of the regression: B's patch is derived from B's own values only. A stale
    // instance would additionally carry A's changed title (and A's original alt/caption/credit,
    // since the whole draft object stayed bound to A) into this same payload.
    expect(patchBody).toEqual({ credit: "Changed Beta Credit" });
    expect(JSON.stringify(patchBody)).not.toContain("Alpha");
  });
});

/**
 * `EditMediaPanel` — slug field (owner-directed, 2026-09-07). Leona's design: `slug` is a SEPARATE
 * field from `title` — auto-derived at upload, then edited deliberately, and never recomputed by a
 * title-only rename. Uniqueness is enforced server-side (409); this suite proves the field renders
 * pre-filled, saves independently of title, and surfaces a 409 conflict through the same error
 * banner every other save failure uses.
 */
describe("EditMediaPanel — slug field", () => {
  async function openEditPanel() {
    const user = userEvent.setup();
    const { container } = renderScreen();
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");
    await user.click(within(card).getByRole("button", { name: /actions for "sunset photo"/i }));
    await user.click(screen.getByRole("menuitem", { name: /edit metadata/i }));
    await screen.findByRole("heading", { name: /editing "sunset photo"/i });
    return user;
  }

  it("renders pre-filled with the item's current slug, as its own field distinct from Title", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    await openEditPanel();

    expect(screen.getByLabelText("Title")).toHaveValue("Sunset Photo");
    expect(screen.getByLabelText("Slug")).toHaveValue("sunset-photo");
  });

  it("editing the slug alone PATCHes only slug, leaving title untouched in the payload", async () => {
    let patchBody: unknown = null;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "PATCH" && url.includes("/media/media-1")) {
        patchBody = JSON.parse(String(init?.body));
        return Promise.resolve(jsonResponse({ media: { ...ACTIVE_ITEM, slug: "renamed-slug" } }));
      }
      if (url.includes("/media")) return Promise.resolve(jsonResponse(MEDIA_RESPONSE));
      return Promise.reject(new Error(`unexpected ${method} ${url}`));
    });
    const user = await openEditPanel();
    const slugInput = screen.getByLabelText("Slug");
    await user.clear(slugInput);
    await user.type(slugInput, "renamed-slug");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchBody).not.toBeNull());
    expect(patchBody).toEqual({ slug: "renamed-slug" });
  });

  it("renaming ONLY the title leaves slug out of the patch entirely — slug is not recomputed from title", async () => {
    let patchBody: unknown = null;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "PATCH" && url.includes("/media/media-1")) {
        patchBody = JSON.parse(String(init?.body));
        return Promise.resolve(jsonResponse({ media: { ...ACTIVE_ITEM, title: "A Whole New Title" } }));
      }
      if (url.includes("/media")) return Promise.resolve(jsonResponse(MEDIA_RESPONSE));
      return Promise.reject(new Error(`unexpected ${method} ${url}`));
    });
    const user = await openEditPanel();
    const titleInput = screen.getByLabelText("Title");
    await user.clear(titleInput);
    await user.type(titleInput, "A Whole New Title");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchBody).not.toBeNull());
    expect(patchBody).toEqual({ title: "A Whole New Title" });
  });

  it("a 409 slug conflict from the server surfaces through the same save-error banner other failures use, naming the conflict", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "PATCH" && url.includes("/media/media-1")) {
        return Promise.resolve(jsonResponse({ error: "slug 'taken-slug' is already used by another media asset in this workspace" }, 409));
      }
      if (url.includes("/media")) return Promise.resolve(jsonResponse(MEDIA_RESPONSE));
      return Promise.reject(new Error(`unexpected ${method} ${url}`));
    });
    const user = await openEditPanel();
    const slugInput = screen.getByLabelText("Slug");
    await user.clear(slugInput);
    await user.type(slugInput, "taken-slug");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/taken-slug/);
  });
});

/**
 * `EditMediaPanel` — HTML attributes field (2026-09-07). The load-bearing regression this pins:
 * an earlier version of this field gated `save()` on the client-side allowlist check, so an
 * invalid HTML-attributes draft silently blocked saving every OTHER field too (title, alt,
 * caption, credit, cssClass — none of which have anything to do with this field). Reverted as
 * `a7cce060`; see `use-edit-media-panel.hooks.ts`'s own header for the full incident. These tests
 * prove that regression cannot recur: a live, visible hint is fine, a save-blocking gate is not.
 */
describe("EditMediaPanel — HTML attributes field", () => {
  async function openEditPanel() {
    const user = userEvent.setup();
    const { container } = renderScreen();
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");
    await user.click(within(card).getByRole("button", { name: /actions for "sunset photo"/i }));
    await user.click(screen.getByRole("menuitem", { name: /edit metadata/i }));
    await screen.findByRole("heading", { name: /editing "sunset photo"/i });
    return user;
  }

  it("a valid value PATCHes htmlAttributes verbatim — proves the client actually sends the field, not just that the server would accept it", async () => {
    let patchBody: unknown = null;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "PATCH" && url.includes("/media/media-1")) {
        patchBody = JSON.parse(String(init?.body));
        return Promise.resolve(jsonResponse({ media: { ...ACTIVE_ITEM, htmlAttributes: 'data-motion="fade-in"' } }));
      }
      if (url.includes("/media")) return Promise.resolve(jsonResponse(MEDIA_RESPONSE));
      return Promise.reject(new Error(`unexpected ${method} ${url}`));
    });
    const user = await openEditPanel();
    await user.type(screen.getByLabelText("HTML attributes (optional)"), 'data-motion="fade-in"');
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchBody).not.toBeNull());
    expect(patchBody).toEqual({ htmlAttributes: 'data-motion="fade-in"' });
  });

  it("an on* handler shows a live, specific error naming it, but does NOT disable Save (regression pin for a7cce060)", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const user = await openEditPanel();
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).not.toBeDisabled();

    await user.type(screen.getByLabelText("HTML attributes (optional)"), 'onerror="alert(1)"');

    expect(await screen.findByText(/onerror/i)).toBeInTheDocument();
    expect(saveButton).not.toBeDisabled();
  });

  it("clicking Save while HTML-attributes is invalid still sends the patch — the exact a7cce060 regression, corrected: the OLD code returned from save() before this request was ever attempted", async () => {
    let patchBody: unknown = null;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "PATCH" && url.includes("/media/media-1")) {
        patchBody = JSON.parse(String(init?.body));
        return Promise.resolve(jsonResponse({ media: { ...ACTIVE_ITEM, title: "A Whole New Title" } }, 400));
      }
      if (url.includes("/media")) return Promise.resolve(jsonResponse(MEDIA_RESPONSE));
      return Promise.reject(new Error(`unexpected ${method} ${url}`));
    });
    const user = await openEditPanel();
    // Leave the HTML-attributes field invalid (an on* handler) while ALSO changing title. Under the
    // reverted bug, `save()` returned before `diffMediaMetadata` ever ran, so NO request would ever
    // reach `fetch` at all and `patchBody` would stay `null` forever, regardless of the mocked
    // response below — this is a real fetch, not a stub the test drives directly.
    await user.type(screen.getByLabelText("HTML attributes (optional)"), 'onerror="alert(1)"');
    await screen.findByText(/onerror/i);
    const titleInput = screen.getByLabelText("Title");
    await user.clear(titleInput);
    await user.type(titleInput, "A Whole New Title");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // `diffMediaMetadata` is a diff, not a validator (see `rules.ts`'s own doc) — a genuinely dirty,
    // genuinely invalid `htmlAttributes` legitimately rides along in the same atomic patch as the
    // title change; the mocked 400 above stands in for the real server then rejecting the whole call
    // (Jini's `updateMediaMetadata` writes nothing on a rejection, title included). What matters here
    // is narrower and load-bearing on its own: the request was actually SENT.
    await waitFor(() => expect(patchBody).not.toBeNull());
    expect(patchBody).toEqual({ title: "A Whole New Title", htmlAttributes: 'onerror="alert(1)"' });
  });

  it("a 400 rejection from the server surfaces through the same save-error banner other failures use, even for a value THIS form's own client-side check passed (proves the server enforces independently, not just this form's live hint)", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "PATCH" && url.includes("/media/media-1")) {
        return Promise.resolve(jsonResponse({ error: "media.htmlAttributes: 'data-motion' is not an allowed HTML attribute." }, 400));
      }
      if (url.includes("/media")) return Promise.resolve(jsonResponse(MEDIA_RESPONSE));
      return Promise.reject(new Error(`unexpected ${method} ${url}`));
    });
    const user = await openEditPanel();
    // A value THIS form's own allowlist accepts cleanly (no live hint appears) — the mocked 400
    // below stands in for the server's INDEPENDENT copy of the allowlist rejecting it anyway
    // (@jini-ai/cms/media's own `html-attributes.ts`, not this file's `rules.ts`), which is exactly
    // the scenario a client-only check could never catch on its own.
    await user.type(screen.getByLabelText("HTML attributes (optional)"), 'data-motion="fade-in"');
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/data-motion/);
  });
});

/**
 * `EditMediaModal` — owner ask (2026-09-07): the metadata edit form is now reachable from an eye
 * icon on the card, presented as a modal, instead of an inline panel pushing the grid down. Pins
 * two things: the eye icon actually opens the same form the row menu already did (not a second,
 * divergent UI), and it renders inside a `<dialog>` (not the old inline `.card`).
 */
describe("EditMediaModal — eye-icon trigger", () => {
  it("the card's eye icon opens the SAME edit form the row menu's 'Edit metadata' opens, inside a <dialog>", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const user = userEvent.setup();
    const { container } = renderScreen();
    const card = cardFor(await waitForCard(container, "Sunset Photo"), "Sunset Photo");

    const dialog = document.querySelector("dialog.media-edit-dialog")!;
    expect(dialog.hasAttribute("open")).toBe(false);

    await user.click(within(card).getByRole("button", { name: /edit "sunset photo"/i }));

    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));
    expect(within(dialog as HTMLElement).getByRole("heading", { name: /editing "sunset photo"/i })).toBeInTheDocument();
    expect(within(dialog as HTMLElement).getByLabelText("Title")).toHaveValue("Sunset Photo");
  });

  it("is a single shared <dialog>, not one per card", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    renderScreen();
    await screen.findByText("Sunset Photo");

    expect(document.querySelectorAll("dialog.media-edit-dialog")).toHaveLength(1);
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

describe("tab bar — useMediaTabsHook injection seam", () => {
  it("renders the tab the injected hook reports, proving the default isn't hardcoded", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    // The real `useMediaTabs` can only ever start on "all" — landing already filtered to the
    // videos tab on first render is a value the real hook cannot produce, so seeing only the
    // `video/mp4` fixture here proves this seam is wired to the injected hook, not calling
    // `useMediaTabs()` directly.
    renderScreen({ useMediaTabsHook: () => ({ activeTab: "videos", setActiveTab: vi.fn() }) });

    expect(await screen.findByText("Trashed Clip")).toBeInTheDocument();
    expect(screen.queryByText("Sunset Photo")).not.toBeInTheDocument();
  });
});

describe("?tab= deep linking", () => {
  it("opens directly on the tab named by the tabId prop", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    renderScreen({ tabId: "videos" });

    expect(await screen.findByText("Trashed Clip")).toBeInTheDocument();
    expect(screen.queryByText("Sunset Photo")).not.toBeInTheDocument();
  });

  it("falls back to All for an id that names no real tab, instead of blanking the panel", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    renderScreen({ tabId: "not-a-real-tab" });

    expect(await screen.findByText("Sunset Photo")).toBeInTheDocument();
  });

  it("switching tabs writes the new id into the URL's ?tab= so the shown tab is always the linkable one", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/media", handler: () => Promise.resolve(jsonResponse(MEDIA_RESPONSE)) }]));
    const user = userEvent.setup();
    renderScreen({ tabId: "all" });
    await screen.findByText("Sunset Photo");

    await user.click(screen.getByRole("tab", { name: "Videos" }));

    expect(window.location.search).toBe("?tab=videos");
  });
});
