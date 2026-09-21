import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tabFromLastFocusableInDialog } from "../../hooks/__tests__/focus-trap.test-helpers";
import { api, ApiError, type AdminMedia } from "../../lib/api";
import { MediaPickerDialog } from "../MediaPickerDialog/MediaPickerDialog";
import type { MediaPickerDialogController, useWiredMediaPickerDialog } from "../MediaPickerDialog/MediaPickerDialog.hooks";

/**
 * @file First test file for `MediaPickerDialog` (0% before this refactor pass — no test file
 * existed at all, flat or split). Written against the post-split `MediaPickerDialog.tsx` +
 * `MediaPickerDialog.hooks.tsx` — the JSX and hook bodies were moved verbatim (see both files' own
 * headers), so this suite exercising the real default `useMediaPickerDialog` hook end-to-end
 * (mocking only `api.listMedia`, the actual network boundary, the same way
 * `WidgetConfigFields.unit.test.tsx` mocks `api.listMenus`/`api.listForms`) is the equivalence
 * check the pre-refactor file never had.
 *
 * The `useDialog`-injection describe block at the bottom is the seam-specific test the split adds:
 * it proves `MediaPickerDialog` actually reads through the prop rather than the hardcoded import.
 */

function mediaItem(overrides: Partial<AdminMedia> = {}): AdminMedia {
  return {
    id: "m1",
    workspaceId: "w1",
    title: "Sunset",
    slug: "sunset",
    alt: "A sunset over water",
    caption: "",
    credit: "",
    sha256: "abc",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    contentType: "image/png",
    ...overrides,
  };
}

beforeEach(() => {
  // `useWiredMediaPickerDialog` now also mounts `useAdminLocale()` (Batch D2 i18n wiring), which
  // reads `api.getSettingsEffective` (via `loadLanguage()`/`loadNamespaceValues`) — stub it to no
  // rows so it resolves to `DEFAULT_LOCALE` ("en") without a real network call, keeping every
  // existing test's literal-English assertions below unchanged. Unlike `WidgetPickerDialog.unit
  // .test.tsx`'s sibling fix, this file mocks at the `api` method level (matching `api.listMedia`'s
  // own mocking here), not global `fetch` — `getSettingsEffective` is its own `api` method, so no
  // shared-`Response`-body race is possible.
  vi.spyOn(api, "getSettingsEffective").mockResolvedValue({ data: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MediaPickerDialog — loading/error/empty", () => {
  it("shows a loading notice before the fetch resolves", () => {
    vi.spyOn(api, "listMedia").mockReturnValue(new Promise(() => {}));
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Loading media…")).toBeInTheDocument();
  });

  it("shows a describable error notice on a failed fetch", async () => {
    vi.spyOn(api, "listMedia").mockRejectedValue(new ApiError("media table locked", 500));
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByText("media table locked")).toBeInTheDocument();
  });

  it("points to the Media screen when nothing has been uploaded yet", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [] });
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByText(/No media uploaded yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Media" })).toHaveAttribute("href", "/admin/media");
  });
});

describe("MediaPickerDialog — populated grid", () => {
  it("renders one button per active item, with its thumbnail and title", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [mediaItem()] });
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);

    // Queried by `title` rather than accessible name: the button's computed name is its content
    // (image `alt` + the visible title span concatenated), not the `title` attribute alone, which
    // only wins as an accessible-name fallback when there's no content — not the case here.
    const item = await screen.findByTitle("Sunset");
    const img = item.querySelector("img");
    expect(img).toHaveAttribute("src", api.mediaOriginalUrl("m1"));
    expect(img).toHaveAttribute("alt", "A sunset over water");
    expect(item).toHaveTextContent("Sunset");
  });

  it("falls back to the title as alt text when the asset has none", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [mediaItem({ alt: "" })] });
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("alt", "Sunset");
  });

  it("calls onSelect with the clicked item", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [mediaItem()] });
    const onSelect = vi.fn();
    render(<MediaPickerDialog onSelect={onSelect} onCancel={vi.fn()} />);

    await user.click(await screen.findByTitle("Sunset"));
    expect(onSelect).toHaveBeenCalledWith(mediaItem());
  });

  // Proof this landed on the injection seam, not just on matching URL shape — same pattern as
  // `PageEditor.unit.test.tsx`'s "not one this component computed itself" test for
  // `templatePreviewUrl`. `MediaPickerDialog.tsx` no longer imports `lib/api` at all (see
  // `media-picker-port.hooks.ts`'s `mediaOriginalUrl` and this file's `useDialog` field above); it
  // renders whatever the injected hook hands it. A `fake://` URL the real `api.mediaOriginalUrl`
  // could never produce still ends up as the thumbnail's `src` verbatim, which is only possible if
  // the component reads it off the injected port rather than calling `api.mediaOriginalUrl` itself.
  it("thumbnail src is exactly the injected port's mediaOriginalUrl, not one this component computed itself", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [mediaItem()] });
    const mediaOriginalUrlSpy = vi.spyOn(api, "mediaOriginalUrl");
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);

    const img = await screen.findByRole("img");
    // `defaultMediaPickerPort.mediaOriginalUrl` forwards to the real `api.mediaOriginalUrl`, so the
    // real client is exercised through the port here — the assertion below is the seam proof; the
    // "useDialog injection" describe block further down is the fake-value proof.
    expect(mediaOriginalUrlSpy).toHaveBeenCalledWith("m1");
    expect(img).toHaveAttribute("src", api.mediaOriginalUrl("m1"));
  });
});

describe("MediaPickerDialog — dismissal", () => {
  it("calls onCancel on Cancel button click", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [] });
    const onCancel = vi.fn();
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={onCancel} />);

    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on a backdrop click but not on a click inside the dialog panel", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [] });
    const onCancel = vi.fn();
    const { container } = render(<MediaPickerDialog onSelect={vi.fn()} onCancel={onCancel} />);

    await user.click(await screen.findByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(container.querySelector(".settings-dialog-backdrop")!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on Escape, via the real useMediaPickerDialog hook", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [] });
    const onCancel = vi.fn();
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={onCancel} />);

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("MediaPickerDialog — useDialog injection", () => {
  it("renders entirely off an injected useDialog — api.listMedia and api.mediaOriginalUrl are never called", () => {
    const listMedia = vi.spyOn(api, "listMedia");
    const mediaOriginalUrlSpy = vi.spyOn(api, "mediaOriginalUrl");
    const select = vi.fn();
    const fakeUseDialog: typeof useWiredMediaPickerDialog = (onSelect) => ({
      items: [mediaItem({ id: "fake-1", title: "Fake asset" })],
      error: null,
      select: (item) => {
        select(item);
        onSelect(item);
      },
      // A `fake://` scheme the real `api.mediaOriginalUrl` could never produce — see the assertion
      // below.
      mediaOriginalUrl: (id) => `fake://media-picker-original/${id}`,
      cancelRef: { current: null },
      // Identity passthrough — the component now destructures `t` off the controller (Batch D2's
      // i18n wiring); a fake that omits it would throw on the first `t(...)` call. Same note as
      // `WidgetPickerDialog.unit.test.tsx`'s `useFakeDialog`.
      t: (key) => key,
      locale: "en",
    });

    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} useDialog={fakeUseDialog} />);

    // Content only the fake could have produced — the real hook, given no mock, would never
    // resolve `items` synchronously like this.
    const img = screen.getByTitle("Fake asset").querySelector("img");
    expect(img).toHaveAttribute("src", "fake://media-picker-original/fake-1");
    expect(listMedia).not.toHaveBeenCalled();
    expect(mediaOriginalUrlSpy).not.toHaveBeenCalled();
  });
});

describe("MediaPickerDialog — translated copy (t injection)", () => {
  // Fake `t`s mapping to distinct non-English strings, not the real dictionary — proves the JSX
  // reads `useDialog(...)`'s own `t`, not a hardcoded English literal. Same reasoning
  // `WidgetConfigFields.unit.test.tsx`'s and `WidgetPickerDialog.unit.test.tsx`'s own
  // "translated copy" fakes use; the real-dictionary proof (a genuine non-English value) lives in
  // `MediaPickerDialog.hooks.unit.test.tsx` instead, matching `WidgetInstanceEditor.unit.test.tsx`'s
  // split between the two.
  const FAKE_DICT: Record<string, string> = {
    "Choose an image": "Elegir-FAKE",
    "Loading media…": "Cargando-FAKE",
    "No media uploaded yet. Upload an asset from the {link} screen first.": "Antes-FAKE {link} despues-FAKE",
    Media: "Multimedia-FAKE",
    Cancel: "Cancelar-FAKE",
  };
  const fakeT = (key: string) => FAKE_DICT[key] ?? key;

  function fakeDialog(overrides: Partial<MediaPickerDialogController>): typeof useWiredMediaPickerDialog {
    return (onSelect) => ({
      items: null,
      error: null,
      select: onSelect,
      mediaOriginalUrl: (id) => `fake://${id}`,
      cancelRef: { current: null },
      t: fakeT,
      locale: "es",
      ...overrides,
    });
  }

  it("renders the translated title heading and Cancel button", () => {
    render(
      <MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} useDialog={fakeDialog({ items: [] })} />
    );
    expect(screen.getByRole("heading", { name: "Elegir-FAKE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar-FAKE" })).toBeInTheDocument();
    // The untranslated English literals must be gone, not just absent from the assertions above.
    expect(screen.queryByText("Choose an image")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("renders translated loading copy while items is null", () => {
    render(
      <MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} useDialog={fakeDialog({ items: null })} />
    );
    expect(screen.getByText("Cargando-FAKE")).toBeInTheDocument();
    expect(screen.queryByText("Loading media…")).not.toBeInTheDocument();
  });

  it("renders the translated empty-state template split around a real <a> link, with translated link text", () => {
    render(
      <MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} useDialog={fakeDialog({ items: [] })} />
    );
    // Both text segments around the {link} token must survive splitOnPlaceholders untranslated-loss.
    expect(screen.getByText(/Antes-FAKE/)).toBeInTheDocument();
    expect(screen.getByText(/despues-FAKE/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Multimedia-FAKE" });
    expect(link).toHaveAttribute("href", "/admin/media");
  });
});

describe("MediaPickerDialog — focus management", () => {

  it("keeps Tab inside the dialog: Tab on the last focusable element wraps to the first", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [] });
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);
    const { event, first } = tabFromLastFocusableInDialog();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });
  // No dialog/modal wrapper existed at all before this fix (no useEffect, no ref, nothing) — on
  // close, focus fell through to `<body>` instead of returning to whatever control opened the
  // picker (e.g. the Posts/Pages editor's "Insert from Media Library" toolbar button). Real
  // keyboard/screen-reader defect: a keyboard user closing the dialog was dropped back to the top
  // of the page instead of staying where they were. Mirrors the `triggerRef`/`document.activeElement`
  // technique `ConfirmDialog.hooks.tsx` (`@jini-ai/admin`) and this app's own `useMediaLightbox`
  // (`features/media/hooks/use-media-lightbox.hooks.ts`) already use, adapted to a
  // conditionally-mounted div dialog rather than an always-mounted native `<dialog>`: this
  // component only ever exists in the DOM while open, so mount/unmount IS the open/close
  // transition.
  it("moves focus onto Cancel when it opens, not left on whatever had focus before", () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [] });
    const trigger = document.createElement("button");
    trigger.textContent = "Insert from Media Library";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    try {
      render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    } finally {
      trigger.remove();
    }
  });

  it("returns focus to the element that opened it once the dialog closes (unmounts)", () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [] });
    const trigger = document.createElement("button");
    trigger.textContent = "Insert from Media Library";
    document.body.appendChild(trigger);
    trigger.focus();

    try {
      const { unmount } = render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);
      expect(document.activeElement).not.toBe(trigger);

      unmount();
      expect(document.activeElement).toBe(trigger);
    } finally {
      trigger.remove();
    }
  });
});
